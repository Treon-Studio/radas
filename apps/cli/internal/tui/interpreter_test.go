package tui

import (
	"testing"
)

func TestInterpretChatInput_Empty(t *testing.T) {
	result, msg := InterpretChatInput("")
	if result != nil {
		t.Errorf("expected nil result, got %+v", result)
	}
	if msg != "" {
		t.Errorf("expected empty msg, got %q", msg)
	}
}

func TestInterpretChatInput_Quit(t *testing.T) {
	tests := []string{"exit", "quit", "bye", "q"}
	for _, input := range tests {
		t.Run(input, func(t *testing.T) {
			result, _ := InterpretChatInput(input)
			if result == nil || result.Cmd != "q" {
				t.Errorf("input %q: expected q cmd, got %+v", input, result)
			}
		})
	}
}

func TestInterpretChatInput_Help(t *testing.T) {
	tests := []string{"help", "what can you do", "commands", "?"}
	for _, input := range tests {
		t.Run(input, func(t *testing.T) {
			result, _ := InterpretChatInput(input)
			if result == nil || result.Cmd != "help" {
				t.Errorf("input %q: expected help cmd, got %+v", input, result)
			}
		})
	}
}

func TestInterpretChatInput_Run(t *testing.T) {
	tests := []struct {
		input string
		want  string
		args1 string
		args2 string
	}{
		{"run api test", "run", "api", "test"},
		{"execute api build", "run", "api", "build"},
		{"run test for api", "run", "api", "test"},
		{"run build on web", "run", "web", "build"},
		{"do api test", "run", "api", "test"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result, _ := InterpretChatInput(tt.input)
			if result == nil {
				t.Fatalf("expected result, got nil")
			}
			if result.Cmd != tt.want {
				t.Errorf("Cmd = %q, want %q", result.Cmd, tt.want)
			}
			if len(result.Args) < 2 || result.Args[0] != tt.args1 || result.Args[1] != tt.args2 {
				t.Errorf("Args = %v, want [%s %s]", result.Args, tt.args1, tt.args2)
			}
		})
	}
}

func TestInterpretChatInput_Generate(t *testing.T) {
	tests := []struct {
		input string
		tmpl  string
		name  string
	}{
		{"generate crud users", "crud", "users"},
		{"create model user", "model", "user"},
		{"scaffold react-component button", "react-component", "button"},
		{"make a crud for users", "crud", "users"},
		{"generate model for posts", "model", "posts"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result, _ := InterpretChatInput(tt.input)
			if result == nil {
				t.Fatalf("expected result, got nil")
			}
			if result.Cmd != "generate" {
				t.Errorf("Cmd = %q, want generate", result.Cmd)
			}
			if len(result.Args) < 2 || result.Args[0] != tt.tmpl || result.Args[1] != tt.name {
				t.Errorf("Args = %v, want [%s %s]", result.Args, tt.tmpl, tt.name)
			}
		})
	}
}

func TestInterpretChatInput_ListTemplates(t *testing.T) {
	tests := []string{"list templates", "show templates", "templates", "available templates"}
	for _, input := range tests {
		t.Run(input, func(t *testing.T) {
			result, _ := InterpretChatInput(input)
			if result == nil || result.Cmd != "template" {
				t.Errorf("input %q: expected template cmd, got %+v", input, result)
			}
			if len(result.Args) < 1 || result.Args[0] != "list" {
				t.Errorf("expected [list], got %v", result.Args)
			}
		})
	}
}

func TestInterpretChatInput_AddTemplate(t *testing.T) {
	result, _ := InterpretChatInput("add template https://github.com/foo/bar")
	if result == nil {
		t.Fatal("expected result")
	}
	if result.Cmd != "template" || len(result.Args) < 2 || result.Args[0] != "add" {
		t.Errorf("got %+v, want [template add <url>]", result)
	}
	if result.Args[1] != "https://github.com/foo/bar" {
		t.Errorf("expected URL in args, got %v", result.Args)
	}
}

func TestInterpretChatInput_CreateTemplate(t *testing.T) {
	result, _ := InterpretChatInput("create template my-template")
	if result == nil {
		t.Fatal("expected result")
	}
	if result.Cmd != "template" || result.Args[0] != "create" || result.Args[1] != "my-template" {
		t.Errorf("got %+v", result)
	}
}

func TestInterpretChatInput_Graph(t *testing.T) {
	tests := []string{"graph", "show graph", "show dependencies", "project graph"}
	for _, input := range tests {
		result, _ := InterpretChatInput(input)
		if result == nil || result.Cmd != "graph" {
			t.Errorf("input %q: expected graph, got %+v", input, result)
		}
	}
}

func TestInterpretChatInput_Refresh(t *testing.T) {
	tests := []string{"refresh", "reload"}
	for _, input := range tests {
		result, _ := InterpretChatInput(input)
		if result == nil || result.Cmd != "refresh" {
			t.Errorf("input %q: expected refresh, got %+v", input, result)
		}
	}
}

func TestInterpretChatInput_Unknown(t *testing.T) {
	result, _ := InterpretChatInput("what's the meaning of life?")
	if result != nil {
		t.Errorf("expected nil for unknown input, got %+v", result)
	}
}
