package tui

import (
	"testing"
)

func TestParseCommand_Run(t *testing.T) {
	cmd, args := parseCommand(":run api test")
	if cmd != "run" {
		t.Errorf("cmd = %q, want %q", cmd, "run")
	}
	if len(args) != 2 || args[0] != "api" || args[1] != "test" {
		t.Errorf("args = %v, want [api test]", args)
	}
}

func TestParseCommand_Generate(t *testing.T) {
	cmd, args := parseCommand(":generate model user")
	if cmd != "generate" {
		t.Errorf("cmd = %q, want %q", cmd, "generate")
	}
	if len(args) != 2 || args[0] != "model" || args[1] != "user" {
		t.Errorf("args = %v, want [model user]", args)
	}
}

func TestParseCommand_Help(t *testing.T) {
	cmd, args := parseCommand(":help")
	if cmd != "help" {
		t.Errorf("cmd = %q, want %q", cmd, "help")
	}
	if len(args) != 0 {
		t.Errorf("args = %v, want empty", args)
	}
}

func TestParseCommand_Invalid(t *testing.T) {
	cmd, _ := parseCommand("not a command")
	if cmd != "" {
		t.Errorf("cmd = %q, want empty", cmd)
	}
}

func TestParseCommand_Empty(t *testing.T) {
	cmd, _ := parseCommand(":")
	if cmd != "" {
		t.Errorf("cmd = %q, want empty", cmd)
	}
}

func TestParseCommand_WithSpaces(t *testing.T) {
	cmd, args := parseCommand(":run   api  test")
	if cmd != "run" {
		t.Errorf("cmd = %q", cmd)
	}
	if len(args) != 2 {
		t.Errorf("args = %v", args)
	}
}
