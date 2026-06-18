package scan

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// VulnResult holds the output of a vulnerability scan.
type VulnResult struct {
	Tool    string // e.g. "govulncheck", "pnpm audit"
	Summary string // short one-line summary
	Output  string // full tool output
	Pass    bool   // true if no vulns found
}

// RunGovulncheck runs govulncheck in dir and returns the result.
func RunGovulncheck(dir string) *VulnResult {
	r := &VulnResult{Tool: "govulncheck"}

	// Check if there's a Go project
	if _, err := os.Stat(filepath.Join(dir, "go.mod")); os.IsNotExist(err) {
		r.Summary = "skipped (no go.mod)"
		r.Pass = true
		return r
	}

	var out []byte
	var err error

	// Prefer installed govulncheck, fallback to go run
	if _, lookErr := exec.LookPath("govulncheck"); lookErr == nil {
		cmd := exec.Command("govulncheck", "./...")
		cmd.Dir = dir
		out, err = cmd.CombinedOutput()
	} else {
		cmd := exec.Command("go", "run", "golang.org/x/vuln/cmd/govulncheck@latest", "./...")
		cmd.Dir = dir
		out, err = cmd.CombinedOutput()
	}

	r.Output = strings.TrimSpace(string(out))

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			// govulncheck exits 1 when vulns found, 3 on errors
			if exitErr.ExitCode() == 1 {
				r.Summary = "vulnerabilities found"
				return r
			}
			if exitErr.ExitCode() == 3 {
				r.Summary = "error running scan"
				r.Output = r.Output + "\n" + string(exitErr.Stderr)
				return r
			}
		}
		r.Summary = fmt.Sprintf("failed: %v", err)
		return r
	}

	r.Summary = "no vulnerabilities found"
	r.Pass = true
	return r
}

// RunPnpmAudit runs pnpm audit in dir and returns the result.
func RunPnpmAudit(dir string) *VulnResult {
	r := &VulnResult{Tool: "pnpm audit"}

	if _, err := os.Stat(filepath.Join(dir, "pnpm-lock.yaml")); os.IsNotExist(err) {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); os.IsNotExist(err) {
			r.Summary = "skipped (no package.json)"
			r.Pass = true
			return r
		}
	}

	if _, lookErr := exec.LookPath("pnpm"); lookErr != nil {
		r.Summary = "skipped (pnpm not found)"
		r.Pass = true
		return r
	}

	cmd := exec.Command("pnpm", "audit", "--prod", "--audit-level", "high")
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	r.Output = strings.TrimSpace(stdout.String() + "\n" + stderr.String())

	if err != nil {
		if _, ok := err.(*exec.ExitError); ok {
			r.Summary = "high/critical vulnerabilities found"
			return r
		}
		r.Summary = fmt.Sprintf("failed: %v", err)
		return r
	}

	r.Summary = "no high/critical vulnerabilities"
	r.Pass = true
	return r
}

// RunNpmAudit runs npm audit in dir and returns the result.
func RunNpmAudit(dir string) *VulnResult {
	r := &VulnResult{Tool: "npm audit"}

	if _, err := os.Stat(filepath.Join(dir, "package-lock.json")); os.IsNotExist(err) {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); os.IsNotExist(err) {
			r.Summary = "skipped (no package.json)"
			r.Pass = true
			return r
		}
	}

	if _, lookErr := exec.LookPath("npm"); lookErr != nil {
		r.Summary = "skipped (npm not found)"
		r.Pass = true
		return r
	}

	cmd := exec.Command("npm", "audit", "--production", "--audit-level", "high")
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	r.Output = strings.TrimSpace(stdout.String() + "\n" + stderr.String())

	if err != nil {
		if _, ok := err.(*exec.ExitError); ok {
			r.Summary = "high/critical vulnerabilities found"
			return r
		}
		r.Summary = fmt.Sprintf("failed: %v", err)
		return r
	}

	r.Summary = "no high/critical vulnerabilities"
	r.Pass = true
	return r
}
