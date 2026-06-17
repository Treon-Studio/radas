package scan

import (
	"strings"
	"testing"
)

func TestToTable_Empty(t *testing.T) {
	out := ToTable(nil)
	if !strings.Contains(out, "no secrets") {
		t.Errorf("expected empty-state message, got: %q", out)
	}
}

func TestToTable_OneFinding(t *testing.T) {
	findings := []Finding{{
		File:   "/r/.env",
		Line:   3,
		Rule:   "aws-access-token",
		Secret: "AKIA***",
	}}
	out := ToTable(findings)
	for _, want := range []string{"/r/.env", "3", "aws-access-token", "AKIA***"} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
}
