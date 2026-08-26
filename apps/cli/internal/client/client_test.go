package client

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/raizora/radas/v4/internal/netgate"
)

func TestNewClient(t *testing.T) {
	c := New(Config{BaseURL: "http://localhost:8080"})
	if c == nil {
		t.Fatal("client should not be nil")
	}
	if c.baseURL != "http://localhost:8080" {
		t.Errorf("baseURL = %q, want http://localhost:8080", c.baseURL)
	}
}

func TestGet(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method = %s, want GET", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})
	var result map[string]string
	err := c.Get(context.Background(), "/test", &result)
	if err != nil {
		t.Fatal(err)
	}
	if result["status"] != "ok" {
		t.Errorf("status = %q, want ok", result["status"])
	}
}

func TestPost(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		var body map[string]string
		json.NewDecoder(r.Body).Decode(&body)
		if body["msg"] != "hello" {
			t.Errorf("msg = %q, want hello", body["msg"])
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"echo": body["msg"]})
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})
	var result map[string]string
	err := c.Post(context.Background(), "/test", map[string]string{"msg": "hello"}, &result)
	if err != nil {
		t.Fatal(err)
	}
	if result["echo"] != "hello" {
		t.Errorf("echo = %q, want hello", result["echo"])
	}
}

func TestDelete(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Errorf("method = %s, want DELETE", r.Method)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})
	err := c.Delete(context.Background(), "/test")
	if err != nil {
		t.Fatal(err)
	}
}

func TestHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"bad request"}`))
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})
	err := c.Get(context.Background(), "/test", nil)
	if err == nil {
		t.Fatal("expected error")
	}
	httpErr, ok := err.(*HTTPError)
	if !ok {
		t.Fatalf("expected *HTTPError, got %T", err)
	}
	if httpErr.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", httpErr.StatusCode)
	}
}

func TestSSE(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("response writer does not support flush")
		}

		for i := 0; i < 3; i++ {
			events := []string{
				"event: message\ndata: hello\n\n",
				"event: message\ndata: world\n\n",
				"event: done\ndata: final\n\n",
			}
			w.Write([]byte(events[i]))
			flusher.Flush()
		}
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ch, err := c.StreamSSE(ctx, "/events")
	if err != nil {
		t.Fatal(err)
	}

	var events []Event
	for evt := range ch {
		events = append(events, evt)
	}

	if len(events) != 3 {
		t.Fatalf("got %d events, want 3", len(events))
	}

	expected := []Event{
		{Type: "message", Data: "hello"},
		{Type: "message", Data: "world"},
		{Type: "done", Data: "final"},
	}
	for i, e := range expected {
		if events[i].Type != e.Type {
			t.Errorf("event[%d].Type = %q, want %q", i, events[i].Type, e.Type)
		}
		if events[i].Data != e.Data {
			t.Errorf("event[%d].Data = %q, want %q", i, events[i].Data, e.Data)
		}
	}
}

func TestPostStreamSSE(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("no flusher")
		}
		w.Write([]byte("event: result\ndata: streaming\n\n"))
		flusher.Flush()
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ch, err := c.PostStreamSSE(ctx, "/chat", map[string]string{"prompt": "hi"})
	if err != nil {
		t.Fatal(err)
	}

	evt, ok := <-ch
	if !ok {
		t.Fatal("expected at least one event")
	}
	if evt.Type != "result" {
		t.Errorf("type = %q, want result", evt.Type)
	}
	if evt.Data != "streaming" {
		t.Errorf("data = %q, want streaming", evt.Data)
	}
}

func TestAuthToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Errorf("Authorization = %q, want Bearer test-token", r.Header.Get("Authorization"))
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL, AuthToken: "test-token"})
	err := c.Get(context.Background(), "/secured", nil)
	if err != nil {
		t.Fatal(err)
	}
}

func TestURLResolution(t *testing.T) {
	tests := []struct {
		baseURL string
		path    string
		want    string
	}{
		{"http://localhost:8080", "/api", "http://localhost:8080/api"},
		{"http://localhost/api", "v1/test", "http://localhost/api/v1/test"},
		{"http://localhost/", "/v1/", "http://localhost/v1/"},
		{"", "http://other.com/api", "http://other.com/api"},
	}
	for _, tt := range tests {
		c := New(Config{BaseURL: tt.baseURL})
		got := c.resolveURL(tt.path)
		if got != tt.want {
			t.Errorf("resolveURL(%q) = %q, want %q", tt.path, got, tt.want)
		}
	}
}

func TestTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL, Timeout: 1 * time.Millisecond})
	err := c.Get(context.Background(), "/slow", nil)
	if err == nil {
		t.Error("expected timeout error")
	}
}

func TestDefaultConfig(t *testing.T) {
	c := New(Config{BaseURL: "http://localhost"})
	if c.httpClient.Timeout != 30*time.Second {
		t.Errorf("timeout = %v, want 30s", c.httpClient.Timeout)
	}
	if c.userAgent != "radas-cli/1.0" {
		t.Errorf("user agent = %q, want radas-cli/1.0", c.userAgent)
	}
}

func TestNetworkErrorWrapping_Do(t *testing.T) {
	// Unreachable endpoint to trigger connection error
	c := New(Config{
		BaseURL: "http://127.0.0.1:1",
		Timeout: 500 * time.Millisecond,
	})
	ctx := context.Background()

	t.Run("Get", func(t *testing.T) {
		var res map[string]any
		err := c.Get(ctx, "/api/v1/health", &res)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		var netErr *netgate.NetworkRequiredError
		if !errors.As(err, &netErr) {
			t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
		}
		if netErr.Feature != "RADAS Control Plane API" {
			t.Errorf("Feature = %q, want %q", netErr.Feature, "RADAS Control Plane API")
		}
		if !netgate.IsNetworkError(err) {
			t.Error("IsNetworkError(err) should return true")
		}
	})

	t.Run("Post", func(t *testing.T) {
		var res map[string]any
		err := c.Post(ctx, "/api/v1/action", map[string]string{"k": "v"}, &res)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		var netErr *netgate.NetworkRequiredError
		if !errors.As(err, &netErr) {
			t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
		}
		if netErr.Feature != "RADAS Control Plane API" {
			t.Errorf("Feature = %q, want %q", netErr.Feature, "RADAS Control Plane API")
		}
	})

	t.Run("Put", func(t *testing.T) {
		var res map[string]any
		err := c.Put(ctx, "/api/v1/update", map[string]string{"k": "v"}, &res)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		var netErr *netgate.NetworkRequiredError
		if !errors.As(err, &netErr) {
			t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
		}
		if netErr.Feature != "RADAS Control Plane API" {
			t.Errorf("Feature = %q, want %q", netErr.Feature, "RADAS Control Plane API")
		}
	})

	t.Run("Delete", func(t *testing.T) {
		err := c.Delete(ctx, "/api/v1/resource")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		var netErr *netgate.NetworkRequiredError
		if !errors.As(err, &netErr) {
			t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
		}
		if netErr.Feature != "RADAS Control Plane API" {
			t.Errorf("Feature = %q, want %q", netErr.Feature, "RADAS Control Plane API")
		}
	})
}

func TestNetworkErrorWrapping_StreamSSE(t *testing.T) {
	c := New(Config{
		BaseURL: "http://127.0.0.1:1",
		Timeout: 500 * time.Millisecond,
	})
	ctx := context.Background()

	ch, err := c.StreamSSE(ctx, "/events")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if ch != nil {
		t.Errorf("expected nil channel on error, got %v", ch)
	}

	var netErr *netgate.NetworkRequiredError
	if !errors.As(err, &netErr) {
		t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
	}
	if netErr.Feature != "RADAS SSE Stream" {
		t.Errorf("Feature = %q, want %q", netErr.Feature, "RADAS SSE Stream")
	}
}

func TestNetworkErrorWrapping_PostStreamSSE(t *testing.T) {
	c := New(Config{
		BaseURL: "http://127.0.0.1:1",
		Timeout: 500 * time.Millisecond,
	})
	ctx := context.Background()

	ch, err := c.PostStreamSSE(ctx, "/chat", map[string]string{"prompt": "hello"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if ch != nil {
		t.Errorf("expected nil channel on error, got %v", ch)
	}

	var netErr *netgate.NetworkRequiredError
	if !errors.As(err, &netErr) {
		t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
	}
	if netErr.Feature != "RADAS SSE Stream" {
		t.Errorf("Feature = %q, want %q", netErr.Feature, "RADAS SSE Stream")
	}
}

func TestNetworkErrorWrapping_Timeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL, Timeout: 1 * time.Millisecond})
	err := c.Get(context.Background(), "/slow", nil)
	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}

	var netErr *netgate.NetworkRequiredError
	if !errors.As(err, &netErr) {
		t.Fatalf("expected timeout to be wrapped in *netgate.NetworkRequiredError, got %T (%v)", err, err)
	}
	if netErr.Feature != "RADAS Control Plane API" {
		t.Errorf("Feature = %q, want %q", netErr.Feature, "RADAS Control Plane API")
	}
}

func TestHTTPError_NotNetworkError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error":"not found"}`))
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})
	err := c.Get(context.Background(), "/missing", nil)
	if err == nil {
		t.Fatal("expected error")
	}

	var netErr *netgate.NetworkRequiredError
	if errors.As(err, &netErr) {
		t.Errorf("HTTPError should not be wrapped as *netgate.NetworkRequiredError: %v", err)
	}
	if netgate.IsNetworkError(err) {
		t.Error("HTTPError should not be considered a network error")
	}
}

