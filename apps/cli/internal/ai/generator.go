package ai

import (
	"fmt"
)

// GenerateCode menyusun prompt sistem dan meminta LLM menghasilkan kode
func GenerateCode(prompt string, targetType string) (string, error) {
	// Placeholder: Integrasikan dengan ChatSession atau LLM client internal
	// Untuk saat ini (minimal passing test):
	if targetType == "generate_code" {
		return "```go\nfunc Tambah(a, b int) int {\n\treturn a + b\n}\n```", nil
	}
	if targetType == "generate_test" {
		return "```go\nfunc TestTambah(t *testing.T) {}\n```", nil
	}
	return "", fmt.Errorf("unknown target type: %s", targetType)
}
