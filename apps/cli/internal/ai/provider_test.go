package ai

import (
	"context"
	"testing"
)

func TestProviderInterface(t *testing.T) {
	var p Provider = &mockProvider{}
	_ = p
}

type mockProvider struct{}

func (m *mockProvider) Chat(ctx context.Context, req ChatRequest) (<-chan Event, error) {
	ch := make(chan Event, 2)
	ch <- Event{Type: EventText, Text: "hello"}
	ch <- Event{Type: EventDone}
	close(ch)
	return ch, nil
}

func TestEventTypes(t *testing.T) {
	tests := []struct {
		typ  EventType
		name string
	}{
		{EventText, "text"},
		{EventToolCall, "tool_call"},
		{EventToolResult, "tool_result"},
		{EventError, "error"},
		{EventDone, "done"},
	}
	for _, tt := range tests {
		if tt.typ < 0 || tt.typ > 4 {
			t.Errorf("unexpected event type value: %d", tt.typ)
		}
	}
}

func TestMessageRoles(t *testing.T) {
	msg := Message{Role: RoleUser, Content: "hi"}
	if msg.Role != "user" {
		t.Errorf("Role = %q, want %q", msg.Role, "user")
	}
	msg2 := Message{Role: RoleAssistant, Content: "hello"}
	if msg2.Role != "assistant" {
		t.Errorf("Role = %q, want %q", msg2.Role, "assistant")
	}
}
