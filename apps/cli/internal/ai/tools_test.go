package ai

import (
	"context"
	"testing"
)

func TestToolRegistry_Register(t *testing.T) {
	reg := NewToolRegistry()
	reg.Register(Tool{
		ToolDef: ToolDef{
			Name:        "echo",
			Description: "Echo back input",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"msg": map[string]any{"type": "string"},
				},
			},
		},
		Execute: func(ctx context.Context, params map[string]any) (string, error) {
			return params["msg"].(string), nil
		},
	})

	defs := reg.Definitions()
	if len(defs) != 1 {
		t.Fatalf("got %d defs, want 1", len(defs))
	}
	if defs[0].Name != "echo" {
		t.Errorf("Name = %q", defs[0].Name)
	}
}

func TestToolRegistry_Execute(t *testing.T) {
	reg := NewToolRegistry()
	reg.Register(Tool{
		ToolDef: ToolDef{Name: "echo", Description: "echo"},
		Execute: func(ctx context.Context, params map[string]any) (string, error) {
			return params["msg"].(string), nil
		},
	})

	result, err := reg.Execute(context.Background(), "echo", map[string]any{"msg": "hello"})
	if err != nil {
		t.Fatal(err)
	}
	if result != "hello" {
		t.Errorf("result = %q, want %q", result, "hello")
	}
}

func TestToolRegistry_ExecuteUnknown(t *testing.T) {
	reg := NewToolRegistry()
	_, err := reg.Execute(context.Background(), "nonexistent", nil)
	if err == nil {
		t.Error("expected error for unknown tool")
	}
}

func TestToolRegistry_DefinitionsEmpty(t *testing.T) {
	reg := NewToolRegistry()
	defs := reg.Definitions()
	if len(defs) != 0 {
		t.Errorf("got %d defs, want 0", len(defs))
	}
}

func TestToolRegistry_ConcurrentSafe(t *testing.T) {
	reg := NewToolRegistry()
	reg.Register(Tool{
		ToolDef: ToolDef{Name: "a", Description: "a"},
		Execute: func(ctx context.Context, params map[string]any) (string, error) { return "a", nil },
	})

	done := make(chan bool)
	go func() {
		reg.Definitions()
		done <- true
	}()
	go func() {
		reg.Register(Tool{
			ToolDef: ToolDef{Name: "b", Description: "b"},
			Execute: func(ctx context.Context, params map[string]any) (string, error) { return "b", nil },
		})
		done <- true
	}()
	<-done
	<-done
}
