package ai

import (
	"strings"
	"testing"
)

func TestGenerateCode(t *testing.T) {
	// Mock or use dummy client
	res, err := GenerateCode("buatkan fungsi tambah di Go", "generate_code")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if !strings.Contains(res, "func") {
		t.Errorf("expected generated code to contain 'func', got %s", res)
	}
}
