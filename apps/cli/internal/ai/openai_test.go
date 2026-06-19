package ai

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenAIProvider_Chat(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`data: {"id":"1","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant","content":"hello"},"finish_reason":null}]}

data: {"id":"1","object":"chat.completion.chunk","choices":[{"delta":{"content":" world"},"finish_reason":null}]}

data: {"id":"1","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}

data: [DONE]

`))
	}))
	defer srv.Close()

	p := NewOpenAIProvider(OpenAIConfig{
		APIKey:  "test-key",
		BaseURL: srv.URL,
	})

	events, err := p.Chat(context.Background(), ChatRequest{
		Model: "gpt-4o",
		Messages: []Message{
			{Role: RoleUser, Content: "hi"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	var texts []string
	for e := range events {
		if e.Type == EventText {
			texts = append(texts, e.Text)
		}
	}
	got := strings.Join(texts, "")
	if got != "hello world" {
		t.Errorf("got %q, want %q", got, "hello world")
	}
}

func TestNewOpenAIProvider_Defaults(t *testing.T) {
	p := NewOpenAIProvider(OpenAIConfig{APIKey: "key"})
	if p == nil {
		t.Fatal("expected non-nil provider")
	}
}

func TestOpenAIProvider_APIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":{"message":"Invalid API key"}}`))
	}))
	defer srv.Close()

	p := NewOpenAIProvider(OpenAIConfig{
		APIKey:  "bad-key",
		BaseURL: srv.URL,
	})

	events, err := p.Chat(context.Background(), ChatRequest{
		Model: "gpt-4o",
		Messages: []Message{{Role: RoleUser, Content: "hi"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	var errEvent error
	for e := range events {
		if e.Type == EventError {
			errEvent = e.Err
		}
	}
	if errEvent == nil {
		t.Fatal("expected error event for API error")
	}
}
