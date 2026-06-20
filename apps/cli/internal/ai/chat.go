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

func (s *ChatSession) Send(ctx context.Context, userMsg string) (<-chan Event, error) {
	s.mu.Lock()
	s.messages = append(s.messages, Message{Role: RoleUser, Content: userMsg})
	msgs := make([]Message, len(s.messages))
	copy(msgs, s.messages)
	s.mu.Unlock()

	return s.loop(ctx, msgs, 0)
}

func (s *ChatSession) loop(ctx context.Context, msgs []Message, iteration int) (<-chan Event, error) {
	if iteration >= s.config.MaxIterations {
		ch := make(chan Event, 2)
		ch <- Event{Type: EventText, Text: "I've reached the limit for tool calls. Please simplify your request."}
		ch <- Event{Type: EventDone}
		close(ch)
		return ch, nil
	}

	if s.config.CostTracker != nil {
		if err := s.config.CostTracker.Check(); err != nil {
			ch := make(chan Event, 2)
			ch <- Event{Type: EventText, Text: err.Error()}
			ch <- Event{Type: EventDone}
			close(ch)
			return ch, nil
		}
	}

	req := ChatRequest{
		Model:    s.config.Model,
		Messages: msgs,
		Tools:    s.config.ToolRegistry.Definitions(),
	}

	providerCh, err := s.config.Provider.Chat(ctx, req)
	if err != nil {
		return nil, err
	}

	outCh := make(chan Event)
	go func() {
		defer close(outCh)

		var toolCall *ToolCall
		var fullText string
		var hasToolCall bool

		for e := range providerCh {
			switch e.Type {
			case EventText:
				fullText += e.Text
				outCh <- e
			case EventToolCall:
				hasToolCall = true
				toolCall = e.Call
				outCh <- e
			case EventError:
				outCh <- e
				return
			case EventDone:
				s.mu.Lock()
				s.messages = append(s.messages, Message{Role: RoleAssistant, Content: fullText})
				s.mu.Unlock()

				if !hasToolCall {
					outCh <- Event{Type: EventDone}
					return
				}

				result, err := s.config.ToolRegistry.Execute(ctx, toolCall.Name, toolCall.Params)
				resultStr := result
				if err != nil {
					resultStr = fmt.Sprintf("Error: %v", err)
				}

				s.mu.Lock()
				s.messages = append(s.messages, Message{
					Role:       RoleTool,
					ToolCallID: toolCall.ID,
					Name:       toolCall.Name,
					Content:    resultStr,
				})
				s.mu.Unlock()

				outCh <- Event{Type: EventToolResult, Result: resultStr}

				nextCh, err := s.loop(ctx, s.messages, iteration+1)
				if err != nil {
					outCh <- Event{Type: EventError, Err: err}
					return
				}
				for e := range nextCh {
					outCh <- e
				}
				return
			}
		}
	}()

	return outCh, nil
}
