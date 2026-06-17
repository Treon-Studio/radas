package scan

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGitleaksScanner_DetectsFakeAWSSecret(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, ".env")
	if err := os.WriteFile(envFile, []byte("AWS_ACCESS_KEY_ID=AKIA5X2P7Q4R6S3T2VWZ\n"), 0600); err != nil {
		t.Fatal(err)
	}

	s := NewGitleaksScanner()
	findings, err := s.Scan(dir, ScanOptions{})
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	if len(findings) == 0 {
		t.Fatal("expected at least one finding, got 0")
	}
	found := false
	for _, f := range findings {
		if filepath.Base(f.File) == ".env" && f.Rule != "" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected finding for .env, got %+v", findings)
	}
}

func TestGitleaksScanner_NoSecretsEmpty(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("# no secrets here\n"), 0644); err != nil {
		t.Fatal(err)
	}
	s := NewGitleaksScanner()
	findings, err := s.Scan(dir, ScanOptions{})
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	if len(findings) != 0 {
		t.Errorf("expected 0 findings, got %d: %+v", len(findings), findings)
	}
}
