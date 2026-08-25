// Package serviceops executes service-operation claims carried by the existing
// worker claim/heartbeat/finish protocol. It intentionally has no container
// runtime implementation: providers are injected, and the mock provider keeps
// tests deterministic without Docker or Podman.
package serviceops

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/opensible/worker-go/internal/redaction"
)

type Operation struct {
	OperationID string
	LeaseToken  string

	Operation         string
	IdempotencyKey    string
	RuntimeID         string
	ProjectID         string
	InstanceID        string
	DesiredRevisionID string
	Spec              map[string]any
	Instance          map[string]any
}

type Result struct {
	Success bool
	Data    map[string]any
	Code    string
	Message string
}

type ProviderFactory func() Provider

type Provider interface {
	Execute(context.Context, Operation) Result
}

type Reporter interface {
	SendServiceLog(executionID, leaseToken, text string, ts float64) bool
	FinishServiceExecution(executionID, leaseToken, status string, finishedAt float64, duration int, returnCode *int, errStr string, result map[string]any) bool
}

type heartbeatReporter interface {
	HeartbeatWithLease(currentExecutionID, leaseToken string) (bool, bool)
}

type Runner struct {
	Providers map[string]Provider
}

func (r Runner) provider(runtimeID string) (Provider, bool) {
	id := strings.ToLower(strings.TrimSpace(runtimeID))
	p, ok := r.Providers[id]
	return p, ok
}

func operationErrorCode(value string) string {
	candidate := strings.ToUpper(strings.TrimSpace(value))
	switch candidate {
	case "PROVIDER_ERROR", "PROVIDER_TIMEOUT", "PROVIDER_DISABLED", "INVALID_RUNTIME",
		"UNSUPPORTED_CAPABILITY", "UNSUPPORTED_TIMEOUT", "UNSUPPORTED_IDEMPOTENCY",
		"IDEMPOTENCY_MISMATCH", "INVALID_PROVIDER_RESULT", "INVALID_PROVIDER_LOG",
		"INVALID_PROVIDER_VALIDATION", "INVALID_SPEC", "PROVIDER_VALIDATION_ERROR",
		"REMOTE_ERROR", "BAD_SPEC", "MISSING_DETAILS", "OPERATION_FAILED", "OPERATION_CANCELED":
		return candidate
	default:
		return "OPERATION_FAILED"
	}
}

// Run executes exactly one already-claimed service operation. Finish is safe
// to repeat because the server owns terminal-state CAS and idempotency.
func (r Runner) Run(ctx context.Context, raw map[string]any, reporter Reporter) {
	op, err := decode(raw)
	if err != nil {
		executionID := op.OperationID
		if executionID == "" {
			executionID = rawString(raw, "executionId")
		}
		leaseToken := op.LeaseToken
		if leaseToken == "" {
			leaseToken = rawString(raw, "leaseToken")
		}
		reporter.FinishServiceExecution(executionID, leaseToken, "FAILED", 0, 0, nil, redactText(err.Error()), map[string]any{"code": "OPERATION_FAILED"})
		return
	}
	if op.OperationID == "" {
		reporter.FinishServiceExecution("", op.LeaseToken, "FAILED", 0, 0, nil, "service operation id is required", map[string]any{"code": "OPERATION_FAILED"})
		return
	}
	provider, ok := r.provider(op.RuntimeID)
	if !ok {
		reporter.SendServiceLog(op.OperationID, op.LeaseToken, "service operation provider is unavailable\n", 0)
		reporter.FinishServiceExecution(op.OperationID, op.LeaseToken, "FAILED", 0, 0, nil, "runtime provider is unavailable", map[string]any{"code": "INVALID_RUNTIME"})
		return
	}
	reporter.SendServiceLog(op.OperationID, op.LeaseToken, "service operation started\n", 0)
	if err := ctx.Err(); err != nil {
		reporter.SendServiceLog(op.OperationID, op.LeaseToken, "service operation canceled before provider execution\n", 0)
		reporter.FinishServiceExecution(op.OperationID, op.LeaseToken, "CANCELED", 0, 0, nil, "service operation was canceled before provider execution", map[string]any{"code": "OPERATION_CANCELED"})
		return
	}

	// The provider contract is synchronous, so cancellation is cooperative:
	// providers receive ctx and should check it at safe boundaries. The
	// heartbeat loop also cancels ctx when the server rejects the lease, which
	// prevents a stale worker from reporting a successful result.
	providerCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	if heartbeater, ok := reporter.(heartbeatReporter); ok {
		done := make(chan struct{})
		defer close(done)
		go func() {
			ticker := time.NewTicker(20 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					if ok, _ := heartbeater.HeartbeatWithLease(op.OperationID, op.LeaseToken); !ok {
						cancel()
						return
					}
				case <-done:
					return
				case <-providerCtx.Done():
					return
				}
			}
		}()
	}

	result := provider.Execute(providerCtx, op)
	// A synchronous/non-cancelable provider may return after cancellation. Do
	// not claim that its result was applied; the server's lease/terminal CAS
	// remains authoritative and the result is marked as late/canceled.
	if err := providerCtx.Err(); err != nil {
		reporter.SendServiceLog(op.OperationID, op.LeaseToken, "service operation cancellation observed after provider result\n", 0)
		reporter.FinishServiceExecution(op.OperationID, op.LeaseToken, "CANCELED", 0, 0, nil, "service operation was canceled", map[string]any{"code": "OPERATION_CANCELED", "provider_result_available": true})
		return
	}
	if result.Success {
		reporter.SendServiceLog(op.OperationID, op.LeaseToken, "service operation provider succeeded\n", 0)
		reporter.FinishServiceExecution(op.OperationID, op.LeaseToken, "SUCCESS", 0, 0, nil, "", redactMap(result.Data))
		return
	}
	code := operationErrorCode(result.Code)
	message := result.Message

	if message == "" {
		message = "runtime provider operation failed"
	}
	safeMessage := redactText(message)
	reporter.SendServiceLog(op.OperationID, op.LeaseToken, "service operation provider failed: "+safeMessage+"\n", 0)
	reporter.FinishServiceExecution(op.OperationID, op.LeaseToken, "FAILED", 0, 0, nil, safeMessage, map[string]any{"code": code})
}

func decode(raw map[string]any) (Operation, error) {
	payload, ok := raw["serviceOperation"].(map[string]any)
	if !ok {
		return Operation{OperationID: rawString(raw, "executionId")}, errors.New("service operation payload is missing")
	}
	op := Operation{
		OperationID:       rawString(payload, "operation_id"),
		LeaseToken:        rawString(payload, "lease_token"),
		Operation:         rawString(payload, "operation"),
		IdempotencyKey:    rawString(payload, "idempotency_key"),
		RuntimeID:         rawString(payload, "runtime_id"),
		ProjectID:         rawString(payload, "project_id"),
		InstanceID:        rawString(payload, "instance_id"),
		DesiredRevisionID: rawString(payload, "desired_revision_id"),
		Spec:              mapValue(payload, "spec"),
		Instance:          mapValue(payload, "instance"),
	}
	if op.OperationID == "" {
		op.OperationID = rawString(raw, "executionId")
	}
	op.RuntimeID = strings.ToLower(strings.TrimSpace(op.RuntimeID))
	if op.Operation == "" || op.RuntimeID == "" || op.IdempotencyKey == "" {
		return op, errors.New("service operation payload is incomplete")
	}
	return op, nil
}

func rawString(m map[string]any, key string) string {
	value, _ := m[key].(string)
	return strings.TrimSpace(value)
}

func mapValue(m map[string]any, key string) map[string]any {
	value, _ := m[key].(map[string]any)
	if value == nil {
		return map[string]any{}
	}
	return value
}

func redactText(input string) string { return redaction.Text(input) }

func redactMap(input map[string]any) map[string]any {
	return redaction.Value(input).(map[string]any)
}

func redactValue(value any) any { return redaction.Value(value) }

// MockProvider is deterministic and provider-neutral. It models lifecycle
// state only; it never starts a process or contacts a runtime.
type MockProvider struct{}

func (MockProvider) Execute(ctx context.Context, op Operation) Result {
	select {
	case <-ctx.Done():
		return Result{Code: "PROVIDER_ERROR", Message: "operation canceled"}
	default:
	}
	if op.RuntimeID != "mock" {
		return Result{Code: "INVALID_RUNTIME", Message: "runtime provider is unavailable"}
	}
	if op.Operation == "" {
		return Result{Code: "BAD_SPEC", Message: "provider operation is required"}
	}
	return Result{Success: true, Data: map[string]any{
		"provider_ref": map[string]any{"provider": "mock", "instance_id": op.InstanceID},
		"endpoint":     map[string]any{"url": fmt.Sprintf("https://mock.invalid/%s", op.InstanceID)},
		"health":       "healthy",
	}}
}
