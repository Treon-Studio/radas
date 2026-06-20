package ai

import (
	"strings"
	"testing"
)

func TestBuildSystemPrompt(t *testing.T) {
	reg := NewToolRegistry()
	reg.Register(Tool{
		ToolDef: ToolDef{
			Name:        "echo",
			Description: "Echo back input",
		},
	})

	prompt := BuildSystemPrompt(SystemContext{
		Tools:     reg.Definitions(),
		Projects:  []string{"api", "web"},
		Templates: []string{"react-component", "go-api"},
	})

	if !strings.Contains(prompt, "echo") {
		t.Error("prompt should contain tool name")
	}
	if !strings.Contains(prompt, "api") {
		t.Error("prompt should contain project names")
	}
	if !strings.Contains(prompt, "react-component") {
		t.Error("prompt should contain template names")
	}
}

func TestBuildSystemPrompt_Empty(t *testing.T) {
	prompt := BuildSystemPrompt(SystemContext{})
	if prompt == "" {
		t.Error("prompt should not be empty")
	}
}
