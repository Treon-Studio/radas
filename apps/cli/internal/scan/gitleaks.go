package scan

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/zricethezav/gitleaks/v8/detect"
)

type GitleaksScanner struct{}

func NewGitleaksScanner() *GitleaksScanner {
	return &GitleaksScanner{}
}

func (s *GitleaksScanner) Scan(dir string, opts ScanOptions) ([]Finding, error) {
	d, err := detect.NewDetectorDefaultConfig()
	if err != nil {
		return nil, fmt.Errorf("init detector: %w", err)
	}
	d.MaxTargetMegaBytes = 100

	var findings []Finding
	err = filepath.Walk(dir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			name := info.Name()
			if name == ".git" || name == "node_modules" || name == "vendor" || name == "dist" || name == "build" {
				return filepath.SkipDir
			}
			return nil
		}

		if isBinary(path) {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		frags := d.DetectBytes(data)
		for _, f := range frags {
			findings = append(findings, Finding{
				File:     path,
				Line:     f.StartLine,
				Rule:     f.RuleID,
				Secret:   redact(f.Secret),
				Severity: severityFromLevel(f.Entropy),
			})
		}
		return nil
	})
	if err != nil {
		return findings, fmt.Errorf("walk: %w", err)
	}
	return findings, nil
}

func isBinary(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	buf := make([]byte, 8192)
	n, _ := f.Read(buf)
	for i := 0; i < n; i++ {
		if buf[i] == 0 {
			return true
		}
	}
	return false
}

func redact(s string) string {
	if len(s) <= 4 {
		return "***"
	}
	return s[:4] + "***"
}

func severityFromLevel(entropy float32) string {
	switch {
	case entropy >= 4.0:
		return "error"
	case entropy >= 3.0:
		return "warning"
	default:
		return "note"
	}
}
