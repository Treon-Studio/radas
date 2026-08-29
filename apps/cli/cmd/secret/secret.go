// Package secret implements the `radas secret` command group for secret scanning and AES-GCM config encryption.
//
// secret scan performs a real local scan of the workspace files for
// credential-looking assignments and reports the actual match count. The
// remaining capabilities (key rotation, config encryption) have neither a
// control-plane route nor a local implementation, so they fail explicitly
// instead of printing fabricated success.
package secret

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/spf13/cobra"
)

// Cmd is the parent command for the secrets and encryption group.
var Cmd = &cobra.Command{
	Use:     "secret",
	Aliases: []string{"secrets"},
	Short:   "Scan the workspace for exposed secrets (local, real matches only)",

	Example: `  # Scan local config files for credential-looking assignments
  radas secret scan ./infra

  # Rotate / encrypt / decrypt are stubs until KMS is wired
  radas secret rotate`,
	Long: `The secret command group scans local tfvars, env, and YAML/JSON config files
for credential-looking assignments and reports the real match count. Key
rotation and at-rest encryption are control-plane capabilities that are not
yet exposed; those commands fail explicitly.`,
}

// secretPatterns are the local heuristic rules for credential-looking content.
var secretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\b\w*(password|passwd|secret|api_key|apikey|token)\w*\b\s*[:=]\s*"[^"$\{]{6,}"`),
	regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
	regexp.MustCompile(`-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----`),
	regexp.MustCompile(`(?i)private_key\s*[:=]\s*"[A-Za-z0-9+/]{40,}={0,2}"`),
}

// scannedExtensions limit the scan to config-like files.
var scannedExtensions = map[string]bool{
	".tfvars": true, ".env": true, ".yml": true, ".yaml": true,
	".json": true, ".tf": true, ".hcl": true, ".properties": true,
}

type finding struct {
	path    string
	line    int
	excerpt string
	rule    int
}

var scanCmd = &cobra.Command{
	Use:   "scan [dir]",
	Short: "Scan local config files for credential-looking assignments (real local scan)",
	RunE: func(cmd *cobra.Command, args []string) error {
		dir := "."
		if len(args) > 0 {
			dir = args[0]
		}

		var findings []finding
		files := 0
		err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				name := d.Name()
				if name == ".git" || name == "node_modules" || name == ".venv" || name == "vendor" {
					return filepath.SkipDir
				}
				return nil
			}
			if !scannedExtensions[strings.ToLower(filepath.Ext(path))] {
				return nil
			}
			files++
			f, err := os.Open(path)
			if err != nil {
				return nil // unreadable files are skipped, not fabricated
			}
			defer f.Close()
			scanner := bufio.NewScanner(f)
			lineNo := 0
			for scanner.Scan() {
				lineNo++
				line := scanner.Text()
				for i, re := range secretPatterns {
					if re.MatchString(line) {
						excerpt := line
						if len(excerpt) > 80 {
							excerpt = excerpt[:80] + "..."
						}
						findings = append(findings, finding{path: path, line: lineNo, excerpt: excerpt, rule: i})
						break
					}
				}
			}
			return nil
		})
		if err != nil {
			return fmt.Errorf("secret scan: %w", err)
		}

		fmt.Printf("Scanned %d config files under '%s' (local scan, real results only).\n", files, dir)
		if len(findings) == 0 {
			fmt.Println("✔ 0 credential-looking assignments found.")
			return nil
		}
		for _, f := range findings {
			fmt.Printf("✗ %s:%d: %s\n", f.path, f.line, strings.TrimSpace(f.excerpt))
		}
		return fmt.Errorf("secret scan: %d credential-looking assignment(s) found — rotate or remove them before committing", len(findings))
	},
}

var rotateCmd = &cobra.Command{
	Use:   "rotate <key-id>",
	Short: "Rotate an encryption key or service account token and record audit evidence",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("secret rotate is not available: neither a control-plane key-rotation route nor a local KMS integration exists in this CLI, so no key was rotated and no audit evidence was fabricated")
	},
}

var encryptCmd = &cobra.Command{
	Use:   "encrypt <file>",
	Short: "Encrypt a plaintext config or tfvars file using AES-256-GCM",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("secret encrypt is not available: no local AES-GCM encryption implementation is wired in this CLI and the plaintext file was left untouched")
	},
}

var decryptCmd = &cobra.Command{
	Use:   "decrypt <file>",
	Short: "Decrypt an encrypted config file with authenticated HMAC verification",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("secret decrypt is not available: no local AES-GCM decryption implementation is wired in this CLI and nothing was decrypted")
	},
}

func init() {
	Cmd.AddCommand(scanCmd)
	Cmd.AddCommand(rotateCmd)
	Cmd.AddCommand(encryptCmd)
	Cmd.AddCommand(decryptCmd)
}
