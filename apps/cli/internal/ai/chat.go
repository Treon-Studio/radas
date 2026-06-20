package ai

import (
	"context"
	"fmt"
	"sync"
)

type ChatConfig struct {
	Provider      Provider
	ToolRegistry  *ToolRegistry
	Model         string
	MaxIterations int
	CostTracker   *CostTracker
}

type ChatSession struct {
	config   ChatConfig
	messages []Message
	mu       sync.Mutex
}

func NewChatSession(config ChatConfig) *ChatSession {
	if config.MaxIterations == 0 {
		config.MaxIterations = 10
	}
	return &ChatSession{
		config:   config,
		messages: make([]Message, 0),
	}
}

func (s *ChatSession) AddSystem(msg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.messages = append(s.messages, Message{Role: RoleSystem, Content: msg})
}

func (s *ChatSession) Send(ctx context.Context, userMsg string) <-chan Event {
	s.mu.Lock()
	s.messages = append(s.messages, Message{Role: RoleUser, Content: userMsg})
	msgs := make([]Message, len(s.messages))
	copy(msgs, s.messages)
	s.mu.Unlock()

	return s.loop(ctx, msgs, 0)
}

func (s *ChatSession) loop(ctx context.Context, msgs []Message, startIter int) <-chan Event {
	ch := make(chan Event, 16)
	go func() {
		defer close(ch)

		iteration := startIter
		currentMsgs := msgs
	mainLoop:
		for {
			if err := ctx.Err(); err != nil {
				ch <- Event{Type: EventError, Err: err}
				return
			}
			if iteration >= s.config.MaxIterations {
				ch <- Event{Type: EventText, Text: "I've reached the limit for tool calls. Please simplify your request."}
				ch <- Event{Type: EventDone}
				return
			}
			if s.config.CostTracker != nil {
				if err := s.config.CostTracker.Check(); err != nil {
					ch <- Event{Type: EventText, Text: err.Error()}
					ch <- Event{Type: EventDone}
					return
				}
			}

			req := ChatRequest{
				Model:    s.config.Model,
				Messages: currentMsgs,
				Tools:    s.config.ToolRegistry.Definitions(),
			}

			providerCh, err := s.config.Provider.Chat(ctx, req)
			if err != nil {
				ch <- Event{Type: EventError, Err: err}
				return
			}

			var toolCall *ToolCall
			var fullText string
			var hasToolCall bool

			for e := range providerCh {
				if err := ctx.Err(); err != nil {
					ch <- Event{Type: EventError, Err: err}
					return
				}
				switch e.Type {
				case EventText:
					fullText += e.Text
					ch <- e
				case EventToolCall:
					hasToolCall = true
					toolCall = e.Call
					ch <- e
				case EventError:
					ch <- e
					return
				case EventDone:
					s.mu.Lock()
					s.messages = append(s.messages, Message{Role: RoleAssistant, Content: fullText})
					s.mu.Unlock()

					if !hasToolCall {
						ch <- Event{Type: EventDone}
						return
					}

					result, execErr := s.config.ToolRegistry.Execute(ctx, toolCall.Name, toolCall.Params)
					resultStr := result
					if execErr != nil {
						resultStr = fmt.Sprintf("Error: %v", execErr)
					}

					s.mu.Lock()
					s.messages = append(s.messages, Message{
						Role:       RoleTool,
						ToolCallID: toolCall.ID,
						Name:       toolCall.Name,
						Content:    resultStr,
					})
					s.mu.Unlock()

					ch <- Event{Type: EventToolResult, Result: resultStr}

					currentMsgs = append([]Message{}, s.messages...)
					iteration++
					continue mainLoop
				}
			}
			return
		}
	}()
	return ch
}
