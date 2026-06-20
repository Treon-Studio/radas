package ai

import (
	"context"
	"strconv"
	"sync"
	"testing"
)

type toolCallProvider struct {
	callCount int
}

func (p *toolCallProvider) Chat(ctx context.Context, req ChatRequest) (<-chan Event, error) {
	ch := make(chan Event)
	go func() {
		defer close(ch)
		if p.callCount == 0 {
			p.callCount++
			ch <- Event{Type: EventText, Text: "I will call a tool"}
			ch <- Event{
				Type: EventToolCall,
				Call: &ToolCall{
					ID:   "call_1",
					Name: "echo",
					Params: map[string]any{"msg": "hello"},
				},
			}
			ch <- Event{Type: EventDone}
		} else {
			ch <- Event{Type: EventText, Text: "Done!"}
			ch <- Event{Type: EventDone}
		}
	}()
	return ch, nil
}

type infiniteToolCallProvider struct {
	mu    sync.Mutex
	count int
}

func (p *infiniteToolCallProvider) Chat(ctx context.Context, req ChatRequest) (<-chan Event, error) {
	ch := make(chan Event)
	go func() {
		defer close(ch)
		p.mu.Lock()
		p.count++
		id := p.count
		p.mu.Unlock()
		ch <- Event{Type: EventText, Text: "calling tool"}
		ch <- Event{
			Type: EventToolCall,
			Call: &ToolCall{
				ID:   "call_" + strconv.Itoa(id),
				Name: "echo",
				Params: map[string]any{"msg": "x"},
			},
		}
		ch <- Event{Type: EventDone}
	}()
	return ch, nil
}

func TestChatLoop_Basic(t *testing.T) {
	reg := NewToolRegistry()
	reg.Register(Tool{
		ToolDef: ToolDef{Name: "echo", Description: "echo"},
		Execute: func(ctx context.Context, params map[string]any) (string, error) {
			return params["msg"].(string), nil
		},
	})

	chat := NewChatSession(ChatConfig{
		Provider:         &toolCallProvider{},
		ToolRegistry:     reg,
		Model:            "test-model",
		MaxIterations:    10,
	})

	events := chat.Send(context.Background(), "do something")

	var texts []string
	for e := range events {
		if e.Type == EventText {
			texts = append(texts, e.Text)
		}
	}
	if len(texts) == 0 {
		t.Error("expected at least one text event")
	}
}

func TestChatLoop_MaxIterations(t *testing.T) {
	reg := NewToolRegistry()
	reg.Register(Tool{
		ToolDef: ToolDef{Name: "echo", Description: "echo"},
		Execute: func(ctx context.Context, params map[string]any) (string, error) {
			return "ok", nil
		},
	})

	infinite := &infiniteToolCallProvider{}
	chat := NewChatSession(ChatConfig{
		Provider:         infinite,
		ToolRegistry:     reg,
		Model:            "test",
		MaxIterations:    2,
	})

	events := chat.Send(context.Background(), "loop")

	hasLimitMsg := false
	for e := range events {
		if e.Type == EventText && e.Text == "I've reached the limit for tool calls. Please simplify your request." {
			hasLimitMsg = true
		}
	}
	if !hasLimitMsg {
		t.Error("expected iteration limit message")
	}
}

func TestChatLoop_AddSystemMessage(t *testing.T) {
	chat := NewChatSession(ChatConfig{
		Provider:     &toolCallProvider{},
		Model:        "test",
		MaxIterations: 5,
	})

	chat.AddSystem("You are a helpful assistant.")
	// No error expected — just verify it doesn't panic
}
