package network

import (
	"context"
	"testing"
	"time"
)

func TestCheck_CanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	result := Check(ctx)
	if result.Connected {
		t.Error("expected disconnected with canceled context")
	}
	if result.Error == nil {
		t.Error("expected error with canceled context")
	}
}

func TestCheck_TimeoutContext(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancel()

	result := Check(ctx)
	if result.Connected {
		t.Error("expected disconnected with immediate timeout")
	}
}

func TestCheckResult_ZeroValue(t *testing.T) {
	var r CheckResult
	if r.Connected {
		t.Error("expected zero value connected=false")
	}
	if r.Latency != 0 {
		t.Errorf("expected zero value latency=0, got %v", r.Latency)
	}
}
