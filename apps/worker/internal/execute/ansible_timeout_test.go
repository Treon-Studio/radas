package execute

import (
	"testing"
	"time"
)

func TestAnsibleActionTimeoutDefaultsToThirtyMinutes(t *testing.T) {
	if got, want := ansibleActionTimeout(nil), 30*time.Minute; got != want {
		t.Fatalf("default timeout = %s, want %s", got, want)
	}
}

func TestAnsibleActionTimeoutAcceptsBoundedOverride(t *testing.T) {
	if got, want := ansibleActionTimeout(map[string]any{"action_timeout_seconds": float64(9)}), 9*time.Second; got != want {
		t.Fatalf("override timeout = %s, want %s", got, want)
	}
	if got, want := ansibleActionTimeout(map[string]any{"action_timeout_seconds": float64(999999999)}), 24*time.Hour; got != want {
		t.Fatalf("clamped timeout = %s, want %s", got, want)
	}
}

func TestAnsibleActionTimeoutIgnoresInvalidOverride(t *testing.T) {
	for _, value := range []any{-1.0, "bad", nil} {
		if got, want := ansibleActionTimeout(map[string]any{"action_timeout_seconds": value}), 30*time.Minute; got != want {
			t.Fatalf("invalid override %#v produced %s, want %s", value, got, want)
		}
	}
}
