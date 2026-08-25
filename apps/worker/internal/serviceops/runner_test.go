package serviceops

import (
	"context"
	"testing"
)

type reporter struct {
	logs         []string
	finished     []string
	finishIDs    []string
	finishTokens []string
	result       map[string]any
	errorCode    string
}

func (r *reporter) SendServiceLog(_ string, _ string, text string, _ float64) bool {
	r.logs = append(r.logs, text)
	return true
}
func (r *reporter) FinishServiceExecution(id string, leaseToken string, status string, _ float64, _ int, _ *int, _ string, result map[string]any) bool {
	r.finished = append(r.finished, status)
	if result != nil {
		if code, ok := result["code"].(string); ok {
			r.errorCode = code
		}
	}
	r.finishIDs = append(r.finishIDs, id)
	r.finishTokens = append(r.finishTokens, leaseToken)
	r.result = result
	return true
}

type provider struct{ result Result; started chan struct{}; release chan struct{} }

func (p provider) Execute(ctx context.Context, _ Operation) Result {
	if p.started != nil {
		close(p.started)
	}
	if p.release != nil {
		<-p.release
	}
	return p.result
}

func payload() map[string]any {
	return map[string]any{
		"executionId": "op-1",
		"serviceOperation": map[string]any{
			"operation_id": "op-1", "operation": "deploy", "idempotency_key": "idem-1",
			"runtime_id": "mock", "project_id": "project-1", "instance_id": "instance-1",
			"desired_revision_id": "revision-1", "spec": map[string]any{"password": "never-log"},
			"instance": map[string]any{"id": "instance-1"},
		},
	}
}

func TestRunSuccessUsesInjectedProviderAndRedactsOutput(t *testing.T) {
	rep := &reporter{}
	runner := Runner{Providers: map[string]Provider{
		"mock": provider{result: Result{Success: true, Data: map[string]any{"password": "secret", "endpoint": "ok"}}},
	}}
	runner.Run(context.Background(), payload(), rep)
	if len(rep.finished) != 1 || rep.finished[0] != "SUCCESS" {
		t.Fatalf("finished=%v", rep.finished)
	}
	if rep.result["password"] != "[REDACTED]" {
		t.Fatalf("result was not redacted: %#v", rep.result)
	}
}

func TestRunCanceledBeforeProviderExecution(t *testing.T) {
	rep := &reporter{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	runner := Runner{Providers: map[string]Provider{"mock": provider{result: Result{Success: true}}}}
	runner.Run(ctx, payload(), rep)
	if len(rep.finished) != 1 || rep.finished[0] != "CANCELED" || rep.errorCode != "OPERATION_CANCELED" {
		t.Fatalf("finished=%v code=%q", rep.finished, rep.errorCode)
	}
}

func TestRunCanceledAfterNonCancelableProviderResult(t *testing.T) {
	rep := &reporter{}
	started := make(chan struct{})
	release := make(chan struct{})
	runner := Runner{Providers: map[string]Provider{"mock": provider{result: Result{Success: true}, started: started, release: release}}}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { runner.Run(ctx, payload(), rep); close(done) }()
	<-started
	cancel()
	close(release)
	<-done
	if len(rep.finished) != 1 || rep.finished[0] != "CANCELED" || rep.result["provider_result_available"] != true {
		t.Fatalf("finished=%v result=%#v", rep.finished, rep.result)
	}
}

func TestRunFailureReportsStableError(t *testing.T) {
	rep := &reporter{}
	runner := Runner{Providers: map[string]Provider{
		"mock": provider{result: Result{Code: "PROVIDER_ERROR", Message: "password=secret"}},
	}}
	runner.Run(context.Background(), payload(), rep)
	if len(rep.finished) != 1 || rep.finished[0] != "FAILED" {
		t.Fatalf("finished=%v", rep.finished)
	}
	for _, line := range rep.logs {
		if line == "password=secret" {
			t.Fatal("secret was logged")
		}
	}
}

func TestRunRejectsLegacyPayloadWithoutServiceOperation(t *testing.T) {
	rep := &reporter{}
	(Runner{}).Run(context.Background(), map[string]any{"executionId": "legacy"}, rep)
	if len(rep.finished) != 1 || rep.finished[0] != "FAILED" {
		t.Fatalf("finished=%v", rep.finished)
	}
}

func TestRunDecodeFailureFinishesWithNestedLeaseToken(t *testing.T) {
	rep := &reporter{}
	raw := payload()
	raw["serviceOperation"].(map[string]any)["lease_token"] = "claim-token"
	delete(raw["serviceOperation"].(map[string]any), "operation")
	(Runner{}).Run(context.Background(), raw, rep)
	if len(rep.finished) != 1 || rep.finished[0] != "FAILED" {
		t.Fatalf("finished=%v", rep.finished)
	}
	if rep.finishIDs[0] != "op-1" || rep.finishTokens[0] != "claim-token" {
		t.Fatalf("finish identity=%q token=%q", rep.finishIDs[0], rep.finishTokens[0])
	}
	if rep.errorCode != "OPERATION_FAILED" {
		t.Fatalf("error code=%q; want OPERATION_FAILED", rep.errorCode)
	}
}

func TestRunRejectsMalformedProviderCodeWithAllowlistedFailure(t *testing.T) {
	rep := &reporter{}
	runner := Runner{Providers: map[string]Provider{
		"mock": provider{result: Result{Code: "password=secret", Message: "malformed"}},
	}}
	runner.Run(context.Background(), payload(), rep)
	if rep.errorCode != "OPERATION_FAILED" {
		t.Fatalf("error code=%q; want OPERATION_FAILED", rep.errorCode)
	}
}
