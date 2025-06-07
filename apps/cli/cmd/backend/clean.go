package backend

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"github.com/spf13/cobra"
)

// CleanCmd is the command to clean backend build/deps artifacts
var CleanCmd = &cobra.Command{
	Use:   "clean",
	Short: "Clean backend build/dependency artifacts based on detected stack (Golang, Elixir, PHP, Laravel)",
	Run: func(cmd *cobra.Command, args []string) {
		stack, dir := detectBackendStack()
		if stack == "" {
			fmt.Println("Could not detect backend stack in current or parent directories (up to 10 levels). Supported: Golang, Elixir, PHP, Laravel.")
			os.Exit(1)
		}
		fmt.Printf("Detected backend stack: %s (at %s)\n", stack, dir)
		err := runCleanForStack(stack, dir, false)
		if err != nil {
			fmt.Printf("Clean failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Clean completed successfully!")
	},
}

// runCleanForStack runs the clean command for the given stack and directory
func runCleanForStack(stack string, dir string, cleanCache bool) error {
	var cmd *exec.Cmd
	switch stack {
	case "golang":
		os.RemoveAll(filepath.Join(dir, "bin"))
		os.RemoveAll(filepath.Join(dir, "pkg"))
		cmd = exec.Command("go", "clean", "-modcache", "-cache")
		if cleanCache {
			// Optionally remove custom cache folders if any
			os.RemoveAll(filepath.Join(dir, "build", "cache"))
		}
	case "elixir":
		os.RemoveAll(filepath.Join(dir, "_build"))
		os.RemoveAll(filepath.Join(dir, "deps"))
		cmd = exec.Command("mix", "clean")
		if cleanCache {
			os.RemoveAll(filepath.Join(dir, ".elixir_ls"))
		}
	case "php":
		os.RemoveAll(filepath.Join(dir, "vendor"))
		if cleanCache {
			os.RemoveAll(filepath.Join(dir, "cache"))
		}
	case "laravel":
		os.RemoveAll(filepath.Join(dir, "vendor"))
		os.RemoveAll(filepath.Join(dir, "storage", "framework", "cache"))
		os.RemoveAll(filepath.Join(dir, "bootstrap", "cache"))
		if cleanCache {
			os.RemoveAll(filepath.Join(dir, "storage", "logs"))
			os.RemoveAll(filepath.Join(dir, "storage", "cache"))
		}
	}
	if cmd != nil {
		cmd.Dir = dir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
		return cmd.Run()
	}
	return nil
}
