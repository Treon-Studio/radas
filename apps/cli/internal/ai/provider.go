package ai

import "context"

type EventType int

const (
	EventText EventType = iota
	EventToolCall
	EventToolResult
	EventError
	EventDone
)

type Event struct {
	Type   EventType
	Text   string
	Call   *ToolCall
	Result string
	Err    error
}

const (
	RoleUser      = "user"
	RoleAssistant = "assistant"
	RoleTool      = "tool"
	RoleSystem    = "system"
)

type Message struct {
	Role       string
	Content    string
	ToolCallID string
	Name       string
}

type ToolCall struct {
	ID     string
	Name   string
	Params map[string]any
}

type ToolDef struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Parameters  any    `json:"parameters"`
}

type ChatRequest struct {
	Model    string
	Messages []Message
	Tools    []ToolDef
}

type Provider interface {
	Chat(ctx context.Context, req ChatRequest) (<-chan Event, error)
}
