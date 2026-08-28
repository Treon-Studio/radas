package ai

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/raizora/radas/v4/internal/netgate"
)

type mockProber struct {
	err error
}

func (m *mockProber) Probe(ctx context.Context) error {
	return m.err
}

func TestOpenAIProvider_Chat(t *testing.T) {
	netgate.ResetCache()
	netgate.SetProber(&mockProber{err: nil})
	defer func() {
		netgate.SetProber(nil)
		netgate.ResetCache()
	}()

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
	netgate.ResetCache()
	netgate.SetProber(&mockProber{err: nil})
	defer func() {
		netgate.SetProber(nil)
		netgate.ResetCache()
	}()

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

func TestOpenAIProvider_Offline(t *testing.T) {
	errOffline := errors.New("network unreachable")
	netgate.ResetCache()
	netgate.SetProber(&mockProber{err: errOffline})
	defer func() {
		netgate.SetProber(nil)
		netgate.ResetCache()
	}()

	p := NewOpenAIProvider(OpenAIConfig{
		APIKey:  "test-key",
		BaseURL: "https://api.openai.com/v1",
	})

	events, err := p.Chat(context.Background(), ChatRequest{
		Model: "gpt-4o",
		Messages: []Message{
			{Role: RoleUser, Content: "hi"},
		},
	})
	if err == nil {
		t.Fatal("expected error when offline, got nil")
	}
	if events != nil {
		t.Errorf("expected nil channel on offline error, got %v", events)
	}

	var netErr *netgate.NetworkRequiredError
	if !errors.As(err, &netErr) {
		t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
	}
	if netErr.Feature != "RADAS AI Assistant" {
		t.Errorf("expected Feature 'RADAS AI Assistant', got %q", netErr.Feature)
	}
}

func TestOpenAIProvider_TransportError(t *testing.T) {
	netgate.ResetCache()
	netgate.SetProber(&mockProber{err: nil})
	defer func() {
		netgate.SetProber(nil)
		netgate.ResetCache()
	}()

	p := &openAIProvider{
		config: OpenAIConfig{
			APIKey:  "test-key",
			BaseURL: "http://127.0.0.1:1",
			Model:   "gpt-4o",
		},
		client: &http.Client{
			Timeout: 100 * time.Millisecond,
		},
	}

	events, err := p.Chat(context.Background(), ChatRequest{
		Model: "gpt-4o",
		Messages: []Message{
			{Role: RoleUser, Content: "hi"},
		},
	})
	if err == nil {
		t.Fatal("expected transport error, got nil")
	}
	if events != nil {
		t.Errorf("expected nil channel on transport error, got %v", events)
	}

	var netErr *netgate.NetworkRequiredError
	if !errors.As(err, &netErr) {
		t.Fatalf("expected error to be wrapped in *netgate.NetworkRequiredError, got %T (%v)", err, err)
	}
	if netErr.Feature != "OpenAI API" {
		t.Errorf("expected Feature 'OpenAI API', got %q", netErr.Feature)
	}
}
