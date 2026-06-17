package backend

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/utils"
)

// DevCmd is the command to run the backend dev server
var DevCmd = &cobra.Command{
	Use:   "dev [--watch]",
	Short: "Run backend dev server",
	Long: `Start the backend development server. Auto-detects stack (Go, Elixir, PHP, Laravel)
and picks the right run command. Uses radas.yml run config if available.

Flags:
  --watch        enable hot-reload (auto-detects air, gow, reflex)
  --tool <name>  force a specific watch tool (air, gow, reflex, nodemon)
  --port <n>     override server port
`,
	Run: func(cmd *cobra.Command, args []string) {
		stack, dir := detectBackendStack()
		if stack == "" {
			fmt.Println("Could not detect backend stack. Supported: Golang, Elixir, PHP, Laravel.")
			os.Exit(1)
		}
		fmt.Printf("Detected backend stack: %s (at %s)\n", stack, dir)

		watch := cmd.Flags().Changed("watch")
		watchTool, _ := cmd.Flags().GetString("tool")
		port, _ := cmd.Flags().GetInt("port")

		// Try to load radas.yml config for run settings
		runCmd := ""
		if cfgPath, err := config.FindConfig(); err == nil {
			if cfg, err := config.ParseConfig(cfgPath); err == nil {
				if cfg.Run.Command != "" {
					runCmd = cfg.Run.Command
				}
				if !watch && cfg.Run.Watch {
					watch = true
				}
				if watchTool == "" && cfg.Run.WatchTool != "" {
					watchTool = cfg.Run.WatchTool
				}
				if port == 0 && cfg.Server.Port != 0 {
					port = cfg.Server.Port
				}
			}
		}

		runDevServer(stack, dir, runCmd, watch, watchTool, port)
	},
}

func init() {
	DevCmd.Flags().BoolP("watch", "w", false, "enable hot-reload")
	DevCmd.Flags().String("tool", "", "watch tool (air, gow, reflex, nodemon)")
	DevCmd.Flags().Int("port", 0, "override server port")
}

func runDevServer(stack, dir, runCmd string, watch bool, watchTool string, port int) {
	switch stack {
	case "golang":
		runGoDev(dir, runCmd, watch, watchTool, port)
	case "elixir":
		runElixirDev(dir, runCmd, port)
	case "laravel", "php":
		runPhpDev(dir, runCmd, stack, port)
	}
}

func findMainPackage(dir string) string {
	// Look for common main package locations
	candidates := []string{
		filepath.Join(dir, "cmd", "server"),
		filepath.Join(dir, "cmd", "api"),
		filepath.Join(dir, "cmd", "app"),
		filepath.Join(dir, "cmd"),
		dir,
	}
	for _, c := range candidates {
		mainFile := filepath.Join(c, "main.go")
		if _, err := os.Stat(mainFile); err == nil {
			rel, _ := filepath.Rel(dir, c)
			return rel
		}
	}
	return "."
}

func findWatchTool() string {
	for _, tool := range []string{"air", "gow", "reflex", "nodemon", "entr"} {
		if utils.CheckIfCommandExists(tool) {
			return tool
		}
	}
	return ""
}

func runGoDev(dir, runCmd string, watch bool, watchTool string, port int) {
	if runCmd == "" {
		mainPkg := findMainPackage(dir)
		runCmd = fmt.Sprintf("go run ./%s", mainPkg)
	}

	if watch && watchTool == "" {
		watchTool = findWatchTool()
	}

	parts := strings.Fields(runCmd)

	if watch && watchTool != "" {
		// Wrap with watch tool
		var cmd *exec.Cmd
		switch watchTool {
		case "air":
			// air reads .air.toml; just run it
			cmd = exec.Command("air")
		case "gow":
			cmd = exec.Command("gow", parts...)
		case "reflex":
			reflexArgs := []string{"-r", `\.go$`, "--"}
			reflexArgs = append(reflexArgs, parts...)
			cmd = exec.Command("reflex", reflexArgs...)
		case "nodemon":
			cmd = exec.Command("nodemon", "--exec", parts[0], strings.Join(parts[1:], " "))
		case "entr":
			fmt.Println("For entr, use: ls *.go | entr -r", runCmd)
			fmt.Println("Falling back to direct run...")
			cmd = exec.Command(parts[0], parts[1:]...)
		}
		cmd.Dir = dir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		fmt.Printf("Running: %s (via %s)\n", runCmd, watchTool)
		if err := cmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Dev server failed: %v\n", err)
			os.Exit(1)
		}
		return
	}

	cmd := exec.Command(parts[0], parts[1:]...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	fmt.Printf("Running: %s\n", runCmd)
	if port > 0 {
		cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", port))
	}
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Dev server failed: %v\n", err)
		os.Exit(1)
	}
}

func runElixirDev(dir, runCmd string, port int) {
	if runCmd == "" {
		runCmd = "mix phx.server"
	}
	parts := strings.Fields(runCmd)
	cmd := exec.Command(parts[0], parts[1:]...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if port > 0 {
		cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", port))
	}
	fmt.Printf("Running: %s\n", runCmd)
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Dev server failed: %v\n", err)
		os.Exit(1)
	}
}

func runPhpDev(dir, runCmd string, stack string, port int) {
	if runCmd == "" {
		if stack == "laravel" {
			runCmd = "php artisan serve"
		} else {
			runCmd = "php -S localhost:8080 -t public"
		}
	}
	parts := strings.Fields(runCmd)
	cmd := exec.Command(parts[0], parts[1:]...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if port > 0 {
		// Override port for artisan serve or php -S
		if stack == "laravel" {
			cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", port))
		} else {
			// Replace port in php -S command
			for i, p := range parts {
				if p == "localhost:8080" {
					parts[i] = fmt.Sprintf("localhost:%d", port)
				}
			}
			cmd = exec.Command(parts[0], parts[1:]...)
			cmd.Dir = dir
		}
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	fmt.Printf("Running: %s\n", strings.Join(parts, " "))
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Dev server failed: %v\n", err)
		os.Exit(1)
	}
}
