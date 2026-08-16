package serviceops

import (
	"context"
	"testing"
)

type reporter struct {
	logs     []string
	finished []string
	result   map[string]any
}

func (r *reporter) SendLog(_ string, text string, _ float64) bool {
	r.logs = append(r.logs, text)
	return true
}
func (r *reporter) FinishExecution(_ string, status string, _ float64, _ int, _ *int, _ string, result map[string]any) bool {
	r.finished = append(r.finished, status)
	r.result = result
	return true
}

type provider struct{ result Result }

func (p provider) Execute(context.Context, Operation) Result { return p.result }

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
