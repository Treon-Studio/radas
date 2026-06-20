package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type OpenAIConfig struct {
	APIKey  string
	BaseURL string
	Model   string
}

type openAIProvider struct {
	config OpenAIConfig
	client *http.Client
}

func NewOpenAIProvider(config OpenAIConfig) Provider {
	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	baseURL = strings.TrimRight(baseURL, "/")
	return &openAIProvider{
		config: OpenAIConfig{
			APIKey:  config.APIKey,
			BaseURL: baseURL,
			Model:   config.Model,
		},
		client: http.DefaultClient,
	}
}

type chatMessage struct {
	Role       string `json:"role"`
	Content    string `json:"content"`
	Name       string `json:"name,omitempty"`
	ToolCallID string `json:"tool_call_id,omitempty"`
}

type toolFn struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Parameters  any    `json:"parameters"`
}

type chatTool struct {
	Type     string `json:"type"`
	Function toolFn `json:"function"`
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
	Tools    []chatTool    `json:"tools,omitempty"`
	Stream   bool          `json:"stream"`
}

type chatResponseChunk struct {
	ID      string        `json:"id"`
	Object  string        `json:"object"`
	Choices []choiceDelta `json:"choices"`
}

type choiceDelta struct {
	Index        int           `json:"index"`
	Delta        deltaContent  `json:"delta"`
	FinishReason *string       `json:"finish_reason"`
}

type deltaContent struct {
	Role      string     `json:"role,omitempty"`
	Content   string     `json:"content,omitempty"`
	ToolCalls []toolCall `json:"tool_calls,omitempty"`
}

type toolCall struct {
	Index    int    `json:"index"`
	ID       string `json:"id,omitempty"`
	Type     string `json:"type,omitempty"`
	Function struct {
		Name      string `json:"name,omitempty"`
		Arguments string `json:"arguments,omitempty"`
	} `json:"function"`
}

func (p *openAIProvider) Chat(ctx context.Context, req ChatRequest) (<-chan Event, error) {
	msgs := make([]chatMessage, len(req.Messages))
	for i, m := range req.Messages {
		msgs[i] = chatMessage{
			Role:       m.Role,
			Content:    m.Content,
			Name:       m.Name,
			ToolCallID: m.ToolCallID,
		}
	}

	tools := make([]chatTool, len(req.Tools))
	for i, t := range req.Tools {
		tools[i] = chatTool{
			Type:     "function",
			Function: toolFn(t),
		}
	}

	body := chatRequest{
		Model:    req.Model,
		Messages: msgs,
		Tools:    tools,
		Stream:   true,
	}

	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(body); err != nil {
		return nil, fmt.Errorf("encode request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.config.BaseURL+"/chat/completions", &buf)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}

	ch := make(chan Event)
	go func() {
		defer close(ch)
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			bodyBytes, _ := io.ReadAll(resp.Body)
			ch <- Event{Type: EventError, Err: fmt.Errorf("API error %d: %s", resp.StatusCode, string(bodyBytes))}
			return
		}

		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				ch <- Event{Type: EventDone}
				return
			}
			var chunk chatResponseChunk
			if err := json.Unmarshal([]byte(data), &chunk); err != nil {
				continue
			}
			for _, c := range chunk.Choices {
				if c.Delta.Content != "" {
					ch <- Event{Type: EventText, Text: c.Delta.Content}
				}
				for _, tc := range c.Delta.ToolCalls {
					if tc.Function.Name != "" {
						ch <- Event{
							Type: EventToolCall,
							Call: &ToolCall{
								ID:     tc.ID,
								Name:   tc.Function.Name,
								Params: map[string]any{"__raw_args__": tc.Function.Arguments},
							},
						}
					}
				}
			}
			for _, c := range chunk.Choices {
				if c.FinishReason != nil && *c.FinishReason == "stop" {
					ch <- Event{Type: EventDone}
					return
				}
			}
		}
		if err := scanner.Err(); err != nil {
			ch <- Event{Type: EventError, Err: fmt.Errorf("stream read: %w", err)}
			return
		}
		ch <- Event{Type: EventDone}
	}()

	return ch, nil
}
