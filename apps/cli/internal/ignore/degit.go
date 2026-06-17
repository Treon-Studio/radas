package ignore

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

var errDegitMissing = errors.New("degit not found in PATH")

// fetchViaDegit is a package-level variable, overridden in tests.
// Returns the resolved degit binary path (or errDegitMissing if
// not found). Implementations must populate dest with the cloned
// template tree.
var fetchViaDegit = fetchViaDegitImpl

// fetchViaDegitImpl is the real implementation, used in production.
func fetchViaDegitImpl(repo, dest string) (string, error) {
	bin, err := exec.LookPath("degit")
	if err != nil {
		return "", fmt.Errorf("%w (install with: npm install -g degit)", errDegitMissing)
	}
	dest = filepath.Clean(dest)
	if err := os.RemoveAll(dest); err != nil {
		return "", fmt.Errorf("clear dest: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
		return "", fmt.Errorf("mkdir parent: %w", err)
	}
	cmd := exec.Command(bin, repo, dest)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return "", err
	}
	return bin, nil
}
