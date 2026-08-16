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
)

type Operation struct {
	OperationID       string
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

type Provider interface {
	Execute(context.Context, Operation) Result
}

type Reporter interface {
	SendLog(executionID, text string, ts float64) bool
	FinishExecution(executionID, status string, finishedAt float64, duration int, returnCode *int, errStr string, result map[string]any) bool
}

type Runner struct {
	Providers map[string]Provider
}

func (r Runner) provider(runtimeID string) (Provider, bool) {
	p, ok := r.Providers[strings.TrimSpace(runtimeID)]
	return p, ok
}

// Run executes exactly one already-claimed service operation. Finish is safe
// to repeat because the server owns terminal-state CAS and idempotency.
func (r Runner) Run(ctx context.Context, raw map[string]any, reporter Reporter) {
	op, err := decode(raw)
	if err != nil {
		reporter.FinishExecution(rawString(raw, "executionId"), "FAILED", 0, 0, nil, redactText(err.Error()), nil)
		return
	}
	if op.OperationID == "" {
		reporter.FinishExecution("", "FAILED", 0, 0, nil, "service operation id is required", nil)
		return
	}
	provider, ok := r.provider(op.RuntimeID)
	if !ok {
		reporter.SendLog(op.OperationID, "service operation provider is unavailable\n", 0)
		reporter.FinishExecution(op.OperationID, "FAILED", 0, 0, nil, "runtime provider is unavailable", map[string]any{"code": "INVALID_RUNTIME"})
		return
	}
	reporter.SendLog(op.OperationID, "service operation started\n", 0)
	result := provider.Execute(ctx, op)
	if result.Success {
		reporter.SendLog(op.OperationID, "service operation provider succeeded\n", 0)
		reporter.FinishExecution(op.OperationID, "SUCCESS", 0, 0, nil, "", redactMap(result.Data))
		return
	}
	code := result.Code
	if code == "" {
		code = "PROVIDER_ERROR"
	}
	message := result.Message
	if message == "" {
		message = "runtime provider operation failed"
	}
	safeMessage := redactText(message)
	reporter.SendLog(op.OperationID, "service operation provider failed: "+safeMessage+"\n", 0)
	reporter.FinishExecution(op.OperationID, "FAILED", 0, 0, nil, safeMessage, map[string]any{"code": code})
}

func decode(raw map[string]any) (Operation, error) {
	payload, ok := raw["serviceOperation"].(map[string]any)
	if !ok {
		return Operation{}, errors.New("service operation payload is missing")
	}
	op := Operation{
		OperationID:       rawString(payload, "operation_id"),
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
	if op.Operation == "" || op.RuntimeID == "" || op.IdempotencyKey == "" {
		return Operation{}, errors.New("service operation payload is incomplete")
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

func redactText(input string) string {
	for _, key := range []string{"password", "secret", "token", "credential", "api_key", "private_key"} {
		lower := strings.ToLower(input)
		for {
			idx := strings.Index(lower, key+"=")
			if idx < 0 {
				break
			}
			start := idx + len(key) + 1
			if strings.HasPrefix(lower[start:], "[redacted]") {
				break
			}
			end := start
			for end < len(input) && !strings.ContainsRune(" ,;\n\t", rune(input[end])) {
				end++
			}
			input = input[:start] + "[REDACTED]" + input[end:]
			lower = strings.ToLower(input)
		}
	}
	return input
}

func redactMap(input map[string]any) map[string]any {
	out := make(map[string]any, len(input))
	for key, value := range input {
		lower := strings.ToLower(key)
		if strings.Contains(lower, "secret") || strings.Contains(lower, "password") || strings.Contains(lower, "token") || strings.Contains(lower, "credential") || strings.Contains(lower, "private") {
			out[key] = "[REDACTED]"
			continue
		}
		if nested, ok := value.(map[string]any); ok {
			out[key] = redactMap(nested)
		} else {
			out[key] = value
		}
	}
	return out
}

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
