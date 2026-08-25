package loop

import (
	"testing"
	"time"
)

func TestClaimConflictBackoffIsBoundedAndExponential(t *testing.T) {
	if got, want := claimConflictBackoff(time.Second, 1), 2*time.Second; got != want {
		t.Fatalf("first conflict backoff=%s want=%s", got, want)
	}
	if got, want := claimConflictBackoff(time.Second, 5), 32*time.Second; got != want {
		t.Fatalf("fifth conflict backoff=%s want=%s", got, want)
	}
	if got, want := claimConflictBackoff(10*time.Second, 5), 60*time.Second; got != want {
		t.Fatalf("capped conflict backoff=%s want=%s", got, want)
	}
}
