package system

import (
	"fmt"
	"os"
	"runtime"
	"strings"
)

// TouchIDStatus checks if Touch ID for sudo is enabled in macOS PAM configuration.
func TouchIDStatus() (bool, string) {
	if runtime.GOOS != "darwin" {
		return false, "Touch ID is only supported on macOS hardware."
	}

	// On macOS Sonoma/Sequoia/Ventura, PAM looks in /etc/pam.d/sudo_local or /etc/pam.d/sudo
	for _, pamFile := range []string{"/etc/pam.d/sudo_local", "/etc/pam.d/sudo"} {
		if content, err := os.ReadFile(pamFile); err == nil {
			if strings.Contains(string(content), "pam_tid.so") {
				return true, fmt.Sprintf("Touch ID for sudo is ENABLED in %s", pamFile)
			}
		}
	}

	return false, "Touch ID for sudo is currently NOT enabled in PAM configuration."
}

// GenerateTouchIDCommand returns the shell command required to enable Touch ID for sudo.
func GenerateTouchIDCommand() string {
	return "echo 'auth       sufficient     pam_tid.so' | sudo tee /etc/pam.d/sudo_local > /dev/null"
}
