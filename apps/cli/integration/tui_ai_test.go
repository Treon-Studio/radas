package integration

import (
	"context"
	"strings"
	"testing"

	"github.com/raizora/radas/v4/internal/ai"
)

func TestAIIntegration_ChatLoop(t *testing.T) {
	provider := &echoProvider{}

	reg := ai.NewToolRegistry()
	reg.Register(ai.Tool{
		ToolDef: ai.ToolDef{
			Name:        "echo",
			Description: "Echo input",
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

	chat := ai.NewChatSession(ai.ChatConfig{
		Provider:      provider,
		ToolRegistry:  reg,
		Model:         "test-model",
		MaxIterations: 5,
		CostTracker:   ai.NewCostTracker(0.50),
	})

	events := chat.Send(context.Background(), "say hello")

	var texts []string
	for e := range events {
		if e.Type == ai.EventText {
			texts = append(texts, e.Text)
		}
	}
	full := strings.Join(texts, "")
	if full == "" {
		t.Error("expected non-empty response")
	}
}

type echoProvider struct{}

func (e *echoProvider) Chat(ctx context.Context, req ai.ChatRequest) (<-chan ai.Event, error) {
	ch := make(chan ai.Event, 4)
	go func() {
		defer close(ch)
		ch <- ai.Event{Type: ai.EventText, Text: "Response: "}
		if len(req.Tools) > 0 {
			ch <- ai.Event{
				Type: ai.EventToolCall,
				Call: &ai.ToolCall{
					ID:     "call_1",
					Name:   "echo",
					Params: map[string]any{"msg": "tool executed"},
				},
			}
		}
		ch <- ai.Event{Type: ai.EventDone}
	}()
	return ch, nil
}

func TestAIIntegration_SystemPrompt(t *testing.T) {
	prompt := ai.BuildSystemPrompt(ai.SystemContext{
		Tools: []ai.ToolDef{
			{Name: "test_tool", Description: "A test tool"},
		},
		Projects:  []string{"api", "web"},
		Templates: []string{"go-api"},
	})

	if !strings.Contains(prompt, "test_tool") {
		t.Error("prompt missing tool name")
	}
	if !strings.Contains(prompt, "api") {
		t.Error("prompt missing project")
	}
}

func TestAIIntegration_CostTracking(t *testing.T) {
	ct := ai.NewCostTracker(0.10)
	if err := ct.Check(); err != nil {
		t.Fatal(err)
	}
	ct.Add(0.05)
	if err := ct.Check(); err != nil {
		t.Fatal(err)
	}
	ct.Add(0.06)
	if err := ct.Check(); err == nil {
		t.Error("expected cost ceiling error")
	}
	ct.Reset()
	if err := ct.Check(); err != nil {
		t.Fatal(err)
	}
}

func TestAIIntegration_ConfigParsing(t *testing.T) {
	yaml := `
default_provider: openai
providers:
  openai:
    api_key: literal-key
    model: gpt-4o
cost_ceiling: 0.25
max_tool_iterations: 20
`
	cfg, err := ai.ParseConfig([]byte(yaml))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DefaultProvider != "openai" {
		t.Errorf("DefaultProvider = %q", cfg.DefaultProvider)
	}
	if cfg.CostCeiling != 0.25 {
		t.Errorf("CostCeiling = %f, want 0.25", cfg.CostCeiling)
	}
	if cfg.MaxToolIterations != 20 {
		t.Errorf("MaxToolIterations = %d, want 20", cfg.MaxToolIterations)
	}
	if cfg.Providers["openai"].APIKey != "literal-key" {
		t.Errorf("APIKey = %q", cfg.Providers["openai"].APIKey)
	}
}

func TestAIIntegration_ToolRegistry(t *testing.T) {
	reg := ai.NewToolRegistry()
	reg.Register(ai.Tool{
		ToolDef: ai.ToolDef{Name: "sum", Description: "Add two numbers"},
		Execute: func(ctx context.Context, params map[string]any) (string, error) {
			a, _ := params["a"].(float64)
			b, _ := params["b"].(float64)
			return string(rune(int(a + b))), nil
		},
	})

	result, err := reg.Execute(context.Background(), "sum", map[string]any{"a": 1.0, "b": 2.0})
	if err != nil {
		t.Fatal(err)
	}
	if result == "" {
		t.Error("expected non-empty result")
	}

	defs := reg.Definitions()
	if len(defs) != 1 {
		t.Errorf("got %d defs, want 1", len(defs))
	}
}
