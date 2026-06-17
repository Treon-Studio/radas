package scan

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestToSARIF_EmptyFindings(t *testing.T) {
	out := ToSARIF(nil, "1.0.0")
	if !strings.Contains(string(out), `"version": "2.1.0"`) {
		t.Errorf("missing SARIF version: %s", out)
	}
	if !strings.Contains(string(out), `"name": "radas"`) {
		t.Errorf("missing tool name: %s", out)
	}
	if strings.Contains(string(out), `"results"`) {
		t.Errorf("expected no results key when findings empty, got: %s", out)
	}
}

func TestToSARIF_SingleFinding(t *testing.T) {
	findings := []Finding{{
		File:     "/repo/.env",
		Line:     1,
		Rule:     "aws-access-token",
		Secret:   "AKIA***",
		Severity: "error",
	}}
	out := ToSARIF(findings, "1.2.3")
	s := string(out)

	if !strings.Contains(s, `"version": "2.1.0"`) {
		t.Errorf("missing SARIF version")
	}
	if !strings.Contains(s, `"name": "radas"`) {
		t.Error("missing tool name")
	}
	if !strings.Contains(s, `"version": "1.2.3"`) {
		t.Error("missing tool version")
	}
	if !strings.Contains(s, `"ruleId": "aws-access-token"`) {
		t.Error("missing ruleId")
	}
	if !strings.Contains(s, `"level": "error"`) {
		t.Error("missing level")
	}
	if !strings.Contains(s, `"uri": "/repo/.env"`) {
		t.Error("missing artifactLocation uri")
	}
	if !strings.Contains(s, `"startLine": 1`) {
		t.Error("missing startLine")
	}
	if !strings.Contains(s, `"AKIA***"`) {
		t.Error("missing redacted secret snippet")
	}

	var any interface{}
	if err := json.Unmarshal(out, &any); err != nil {
		t.Errorf("output is not valid JSON: %v\n%s", err, out)
	}
}

func TestToSARIF_LevelMapping(t *testing.T) {
	cases := []struct {
		severity string
		want     string
	}{
		{"error", "error"},
		{"warning", "warning"},
		{"note", "note"},
		{"unknown", "note"},
	}
	for _, c := range cases {
		got := sarifLevel(c.severity)
		if got != c.want {
			t.Errorf("sarifLevel(%q) = %q, want %q", c.severity, got, c.want)
		}
	}
}
