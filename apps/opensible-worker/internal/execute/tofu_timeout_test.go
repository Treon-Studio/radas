package execute

import (
	"testing"
	"time"
)

func TestTofuActionTimeoutDefaultsToThirtyMinutes(t *testing.T) {
	if got, want := tofuActionTimeout(nil), 30*time.Minute; got != want {
		t.Fatalf("default timeout = %s, want %s", got, want)
	}
}

func TestTofuActionTimeoutAcceptsBoundedRunOverride(t *testing.T) {
	if got, want := tofuActionTimeout(map[string]any{"action_timeout_seconds": float64(7)}), 7*time.Second; got != want {
		t.Fatalf("override timeout = %s, want %s", got, want)
	}
	if got, want := tofuActionTimeout(map[string]any{"action_timeout_seconds": float64(999999999)}), 24*time.Hour; got != want {
		t.Fatalf("clamped timeout = %s, want %s", got, want)
	}
}

func TestTofuActionTimeoutIgnoresInvalidOverride(t *testing.T) {
	for _, value := range []any{-1.0, "bad", nil} {
		if got, want := tofuActionTimeout(map[string]any{"action_timeout_seconds": value}), 30*time.Minute; got != want {
			t.Fatalf("invalid override %#v produced %s, want %s", value, got, want)
		}
	}
}
