// Package rootcmd implements root-level utility commands that don't belong
// to a domain group. The open command is the CLI→desktop handoff: it hands a
// radas:// deep link to the OS, which routes it to the RADAS desktop app
// (or opens the equivalent console route in a browser when the desktop app
// is not installed).
package rootcmd

import (
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
)

// OpenCmd opens a RADAS target in the desktop companion app via the
// radas:// deep-link protocol, falling back to the system browser.
var OpenCmd = &cobra.Command{
	Use:   "open <target>",
	Short: "Open a RADAS console route in the desktop app (or browser)",
	Long: `Open a RADAS target in the desktop companion app via the radas://
deep-link protocol, falling back to the system browser when the desktop
app is not installed.

Targets:
  console <route>   open the console at a route (default "/"), e.g.
                    "radas open console /approvals"
  approvals         shorthand for "console /approvals"
  dashboard         shorthand for "console /dashboard"
  stacks            shorthand for "console /cloud/stacks"

The desktop app must be running (or installed) for the deep link to land;
otherwise the equivalent http URL is opened in the default browser. Set
RADAS_CONSOLE_URL to override the browser fallback origin.`,
	Example: `  # Open the approvals queue
  radas open approvals

  # Open any console route
  radas open console /projects/proj-123/services

  # Open the dashboard
  radas open dashboard`,
	Args: cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		target := args[0]
		route := "/"
		switch {
		case target == "console":
			if len(args) > 1 {
				route = normalizeRoute(args[1])
			}
		case target == "approvals":
			route = "/approvals"
		case target == "dashboard":
			route = "/dashboard"
		case target == "stacks" || target == "cloud":
			route = "/cloud/stacks"
		default:
			// Allow a bare route: "radas open /approvals"
			route = normalizeRoute(target)
		}
		return openTarget(route)
	},
}

func normalizeRoute(r string) string {
	if r == "" {
		return "/"
	}
	if !strings.HasPrefix(r, "/") {
		r = "/" + r
	}
	return r
}

func openTarget(route string) error {
	// Try the radas:// deep link first; it reaches the desktop app when the
	// protocol is registered. If open(1)/xdg-open can't handle the scheme it
	// exits non-zero and we fall back to the plain browser URL.
	deepLink := "radas://console" + route
	if err := openURL(deepLink); err == nil {
		return nil
	}

	// Fallback: open the console route in the default browser. There is no
	// server-side route->console mapping, so the console origin defaults to
	// the local dev server and can be overridden with RADAS_CONSOLE_URL.
	consoleBase := os.Getenv("RADAS_CONSOLE_URL")
	if consoleBase == "" {
		consoleBase = "http://localhost:8080"
	}
	return openURL(consoleBase + route)
}

func openURL(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}
