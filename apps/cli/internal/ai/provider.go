// Package ai defines the AI provider interface and shared types for
// LLM-based interactions, including streaming chat, tool calls, and
// structured events.
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

// Event is a tagged union for streaming AI responses.
//   - EventText:      Text is populated
//   - EventToolCall:  Call is populated
//   - EventToolResult: Result is populated
//   - EventError:     Err is populated
//   - EventDone:      stream is complete (no fields)
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
	ID     string         `json:"id"`
	Name   string         `json:"name"`
	Params map[string]any `json:"params"`
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
