package utils

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/fatih/color"
)

// Success, Warning, Failure printers
var (
	Success = color.New(color.FgGreen).PrintfFunc()
	Warning = color.New(color.FgYellow).PrintfFunc()
	Failure = color.New(color.FgRed).PrintfFunc()
)

// ExecuteCommand runs a command and returns its output
func ExecuteCommand(command string, args ...string) (string, error) {
	cmd := exec.Command(command, args...)
	var outBuffer bytes.Buffer
	cmd.Stdout = &outBuffer
	err := cmd.Run()
	return outBuffer.String(), err
}

// CheckIfCommandExists checks if a command is available in PATH
func CheckIfCommandExists(cmd string) bool {
	_, err := exec.LookPath(cmd)
	return err == nil
}

// CheckMacOSApp checks if an application is installed on macOS
func CheckMacOSApp(appName string) bool {
	if runtime.GOOS != "darwin" {
		return false
	}
	_, err := os.Stat(filepath.Join("/Applications", appName+".app"))
	return err == nil
}

// CheckWindowsApp checks if an application is installed on Windows
func CheckWindowsApp(exePath string) bool {
	if runtime.GOOS != "windows" {
		return false
	}
	_, err := os.Stat(exePath)
	return err == nil
}

// FileExists checks if a file exists
func FileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// RunCommand executes a command with stdout and stderr connected to the terminal
func RunCommand(command string, args ...string) error {
	cmd := exec.Command(command, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}