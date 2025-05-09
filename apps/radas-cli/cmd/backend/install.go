package backend

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"github.com/spf13/cobra"
)

// InstallCmd is the command to install backend dependencies
var InstallCmd = &cobra.Command{
	Use:   "install",
	Short: "Install backend dependencies based on detected stack (Golang, Elixir, Rust, PHP, Laravel)",
	Run: func(cmd *cobra.Command, args []string) {
		stack, dir := detectBackendStack()
		if stack == "" {
			fmt.Println("Could not detect backend stack in current or parent directories (up to 10 levels). Supported: Golang, Elixir, Rust, PHP, Laravel.")
			os.Exit(1)
		}
		fmt.Printf("Detected backend stack: %s (at %s)\n", stack, dir)
		err := runInstallForStack(stack, dir)
		if err != nil {
			fmt.Printf("Install failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Install completed successfully!")
	},
}

// detectBackendStack tries to detect the backend stack from files in current or parent directories (up to 10 levels)
func detectBackendStack() (string, string) {
	dir, _ := os.Getwd()
	for i := 0; i < 10; i++ {
		if fileExists(filepath.Join(dir, "go.mod")) {
			return "golang", dir
		}
		if fileExists(filepath.Join(dir, "mix.exs")) {
			return "elixir", dir
		}

		if fileExists(filepath.Join(dir, "composer.json")) {
			if dirExists(filepath.Join(dir, "laravel")) || fileExists(filepath.Join(dir, "artisan")) {
				return "laravel", dir
			}
			return "php", dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", ""
}

// runInstallForStack runs the install command for the given stack and directory
func runInstallForStack(stack string, dir string) error {
	var cmd *exec.Cmd
	switch stack {
	case "golang":
		cmd = exec.Command("go", "mod", "tidy")
	case "elixir":
		cmd = exec.Command("mix", "deps.get")

	case "php":
		cmd = exec.Command("composer", "install")
	case "laravel":
		cmd = exec.Command("composer", "install")
		// Optionally run "php artisan key:generate" after install
		defer func() {
			artisan := filepath.Join(dir, "artisan")
			if fileExists(artisan) {
				_ = exec.Command("php", "artisan", "key:generate").Run()
			}
		}()
	}
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

// fileExists checks if a file exists
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// dirExists checks if a directory exists
func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}
