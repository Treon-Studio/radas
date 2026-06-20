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

var allTypes = []EventType{EventText, EventToolCall, EventToolResult, EventError, EventDone}

func TestEventTypes(t *testing.T) {
	for i, typ := range allTypes {
		if int(typ) != i {
			t.Errorf("[%d] EventType = %d, want %d", i, typ, i)
		}
	}
}

func TestMessageRoles(t *testing.T) {
	tests := []struct {
		role string
		want string
	}{
		{RoleUser, "user"},
		{RoleAssistant, "assistant"},
		{RoleTool, "tool"},
		{RoleSystem, "system"},
	}
	for _, tt := range tests {
		if tt.role != tt.want {
			t.Errorf("Role = %q, want %q", tt.role, tt.want)
		}
	}
}
