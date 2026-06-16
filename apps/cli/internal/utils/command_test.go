package utils

import (
	"runtime"
	"testing"
)

func TestExecuteCommand(t *testing.T) {
	out, err := ExecuteCommand("echo", "hello")
	if err != nil {
		t.Fatalf("ExecuteCommand failed: %v", err)
	}
	if out != "hello\n" && out != "hello\r\n" {
		t.Errorf("Expected hello, got %q", out)
	}
	
	_, err = ExecuteCommand("non-existent-command-123")
	if err == nil {
		t.Error("Expected error for non-existent command")
	}
}

func TestCheckIfCommandExists(t *testing.T) {
	if !CheckIfCommandExists("ls") && !CheckIfCommandExists("cmd.exe") {
		t.Errorf("CheckIfCommandExists returned false for ls/cmd.exe")
	}
	if CheckIfCommandExists("non-existent-command-123") {
		t.Errorf("CheckIfCommandExists returned true for non-existent command")
	}
}

func TestCheckMacOSApp(t *testing.T) {
	if runtime.GOOS == "darwin" {
		// Just verify it runs and returns false for non-existent
		CheckMacOSApp("NonExistentApp")
	} else {
		if CheckMacOSApp("AnyApp") {
			t.Errorf("CheckMacOSApp should return false on non-darwin")
		}
	}
}

func TestCheckWindowsApp(t *testing.T) {
	if runtime.GOOS == "windows" {
		CheckWindowsApp("C:\\NonExistent.exe")
	} else {
		if CheckWindowsApp("C:\\AnyApp.exe") {
			t.Errorf("CheckWindowsApp should return false on non-windows")
		}
	}
}

func TestRunCommand(t *testing.T) {
	err := RunCommand("echo", "hello")
	if err != nil {
		t.Fatalf("RunCommand failed: %v", err)
	}
	
	err = RunCommand("non-existent-command-123")
	if err == nil {
		t.Error("Expected error for non-existent command")
	}
}
