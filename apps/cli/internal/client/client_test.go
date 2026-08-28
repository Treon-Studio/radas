package client

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
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

// --- Task 1.1: request context propagation (tenant/correlation headers) ---

func TestRequestContextHeadersFromConfig(t *testing.T) {
	var got http.Header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))
	defer srv.Close()

	c := New(Config{
		BaseURL:        srv.URL,
		AuthToken:      "ctx-token",
		ProjectID:      "proj-123",
		OrganizationID: "org-456",
		RequestID:      "req-fixed",
		TraceID:        "trace-789",
	})
	var result map[string]string
	if err := c.Get(context.Background(), "/test", &result); err != nil {
		t.Fatal(err)
	}

	if auth := got.Get("Authorization"); auth != "Bearer ctx-token" {
		t.Errorf("Authorization = %q, want %q", auth, "Bearer ctx-token")
	}
	if v := got.Get("X-Project-Id"); v != "proj-123" {
		t.Errorf("X-Project-Id = %q, want %q", v, "proj-123")
	}
	if v := got.Get("X-Org-Id"); v != "org-456" {
		t.Errorf("X-Org-Id = %q, want %q", v, "org-456")
	}
	if v := got.Get("X-Request-Id"); v != "req-fixed" {
		t.Errorf("X-Request-Id = %q, want %q", v, "req-fixed")
	}
	if v := got.Get("X-Trace-Id"); v != "trace-789" {
		t.Errorf("X-Trace-Id = %q, want %q", v, "trace-789")
	}
}

func TestRequestContextHeadersFromOptions(t *testing.T) {
	var got http.Header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))
	defer srv.Close()

	c := New(Config{
		BaseURL:        srv.URL,
		ProjectID:      "proj-default",
		OrganizationID: "org-default",
		RequestID:      "req-default",
		TraceID:        "trace-default",
	})
	resp, err := c.Do(context.Background(), http.MethodPost, "/test", map[string]string{"k": "v"}, RequestOptions{
		ProjectID:      "proj-override",
		OrganizationID: "org-override",
		RequestID:      "req-override",
		TraceID:        "trace-override",
		IdempotencyKey: "idem-001",
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp == nil {
		t.Fatal("expected non-nil response")
	}

	if v := got.Get("X-Project-Id"); v != "proj-override" {
		t.Errorf("X-Project-Id = %q, want %q (opts must override config)", v, "proj-override")
	}
	if v := got.Get("X-Org-Id"); v != "org-override" {
		t.Errorf("X-Org-Id = %q, want %q (opts must override config)", v, "org-override")
	}
	if v := got.Get("X-Request-Id"); v != "req-override" {
		t.Errorf("X-Request-Id = %q, want %q (opts must override config)", v, "req-override")
	}
	if v := got.Get("X-Trace-Id"); v != "trace-override" {
		t.Errorf("X-Trace-Id = %q, want %q (opts must override config)", v, "trace-override")
	}
	if v := got.Get("Idempotency-Key"); v != "idem-001" {
		t.Errorf("Idempotency-Key = %q, want %q", v, "idem-001")
	}
}

func TestRequestContextGeneratedRequestID(t *testing.T) {
	var ids []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ids = append(ids, r.Header.Get("X-Request-Id"))
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})
	if err := c.Get(context.Background(), "/a", nil); err != nil {
		t.Fatal(err)
	}
	if err := c.Get(context.Background(), "/b", nil); err != nil {
		t.Fatal(err)
	}

	if len(ids) != 2 {
		t.Fatalf("captured %d requests, want 2", len(ids))
	}
	for i, id := range ids {
		if id == "" {
			t.Errorf("request %d: X-Request-Id must be generated when absent", i)
			continue
		}
		if !strings.HasPrefix(id, "req-") {
			t.Errorf("request %d: X-Request-Id = %q, want prefix %q", i, id, "req-")
		}
	}
	if ids[0] == ids[1] {
		t.Errorf("generated request IDs must be unique per request, got %q twice", ids[0])
	}
}

func TestRequestContextIdempotencyKey(t *testing.T) {
	var got http.Header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})

	if _, err := c.Do(context.Background(), http.MethodPost, "/mutate", map[string]string{"k": "v"}, RequestOptions{
		IdempotencyKey: "idem-abc",
	}); err != nil {
		t.Fatal(err)
	}
	if v := got.Get("Idempotency-Key"); v != "idem-abc" {
		t.Errorf("Idempotency-Key = %q, want %q", v, "idem-abc")
	}

	if _, err := c.Do(context.Background(), http.MethodPost, "/mutate", map[string]string{"k": "v"}, RequestOptions{}); err != nil {
		t.Fatal(err)
	}
	if v := got.Get("Idempotency-Key"); v != "" {
		t.Errorf("Idempotency-Key = %q, want empty when no key is provided", v)
	}
}

func TestRequestContextAllMethodsCarryHeaders(t *testing.T) {
	var got http.Header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	c := New(Config{
		BaseURL:        srv.URL,
		AuthToken:      "shared-token",
		ProjectID:      "proj-shared",
		OrganizationID: "org-shared",
	})
	ctx := context.Background()

	ops := []struct {
		name string
		run  func() error
	}{
		{"Get", func() error { return c.Get(ctx, "/x", nil) }},
		{"Post", func() error { return c.Post(ctx, "/x", map[string]string{"a": "b"}, nil) }},
		{"Put", func() error { return c.Put(ctx, "/x", map[string]string{"a": "b"}, nil) }},
		{"Delete", func() error { return c.Delete(ctx, "/x") }},
		{"Do", func() error {
			_, err := c.Do(ctx, http.MethodPatch, "/x", nil, RequestOptions{})
			return err
		}},
	}

	for _, op := range ops {
		if err := op.run(); err != nil {
			t.Fatalf("%s: unexpected error: %v", op.name, err)
		}
		if v := got.Get("Authorization"); v != "Bearer shared-token" {
			t.Errorf("%s: Authorization = %q, want %q", op.name, v, "Bearer shared-token")
		}
		if v := got.Get("X-Project-Id"); v != "proj-shared" {
			t.Errorf("%s: X-Project-Id = %q, want %q", op.name, v, "proj-shared")
		}
		if v := got.Get("X-Org-Id"); v != "org-shared" {
			t.Errorf("%s: X-Org-Id = %q, want %q", op.name, v, "org-shared")
		}
		if v := got.Get("X-Request-Id"); v == "" {
			t.Errorf("%s: X-Request-Id must always be present", op.name)
		}
	}
}

func TestRequestContextSSEHeaders(t *testing.T) {
	cases := []struct {
		name string
		use  func(t *testing.T, c *Client) error
	}{
		{"StreamSSE", func(t *testing.T, c *Client) error {
			ch, err := c.StreamSSE(context.Background(), "/events")
			if err != nil {
				return err
			}
			for range ch {
			}
			return nil
		}},
		{"PostStreamSSE", func(t *testing.T, c *Client) error {
			ch, err := c.PostStreamSSE(context.Background(), "/chat", map[string]string{"prompt": "hi"})
			if err != nil {
				return err
			}
			for range ch {
			}
			return nil
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var got http.Header
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				got = r.Header.Clone()
				w.Header().Set("Content-Type", "text/event-stream")
				flusher := w.(http.Flusher)
				w.Write([]byte("event: message\ndata: hello\n\n"))
				flusher.Flush()
			}))
			defer srv.Close()

			c := New(Config{
				BaseURL:        srv.URL,
				AuthToken:      "sse-token",
				ProjectID:      "proj-sse",
				OrganizationID: "org-sse",
			})
			if err := tc.use(t, c); err != nil {
				t.Fatal(err)
			}

			if v := got.Get("Authorization"); v != "Bearer sse-token" {
				t.Errorf("Authorization = %q, want %q", v, "Bearer sse-token")
			}
			if v := got.Get("X-Project-Id"); v != "proj-sse" {
				t.Errorf("X-Project-Id = %q, want %q", v, "proj-sse")
			}
			if v := got.Get("X-Org-Id"); v != "org-sse" {
				t.Errorf("X-Org-Id = %q, want %q", v, "org-sse")
			}
			if v := got.Get("X-Request-Id"); v == "" {
				t.Error("X-Request-Id must always be present")
			}
		})
	}
}

func TestClientDoSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Request-Id", "server-echo")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})
	resp, err := c.Do(context.Background(), http.MethodGet, "/test", nil, RequestOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("StatusCode = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	if resp.Status != "200 OK" {
		t.Errorf("Status = %q, want %q", resp.Status, "200 OK")
	}
	if v := resp.Header.Get("X-Request-Id"); v != "server-echo" {
		t.Errorf("response header X-Request-Id = %q, want %q", v, "server-echo")
	}

	var result map[string]string
	if err := resp.JSON(&result); err != nil {
		t.Fatal(err)
	}
	if result["status"] != "ok" {
		t.Errorf("status = %q, want ok", result["status"])
	}
}

func TestClientDoMalformedURL(t *testing.T) {
	c := New(Config{
		BaseURL:   "http://bad url with spaces",
		AuthToken: "secret-token-value",
	})
	_, err := c.Do(context.Background(), http.MethodGet, "/test", nil, RequestOptions{})
	if err == nil {
		t.Fatal("expected error for malformed URL")
	}
	if strings.Contains(err.Error(), "secret-token-value") {
		t.Errorf("error must never contain the token value: %v", err)
	}

	// Legacy methods share the same builder and must behave identically.
	err = c.Get(context.Background(), "/test", nil)
	if err == nil {
		t.Fatal("expected error for malformed URL via Get")
	}
	if strings.Contains(err.Error(), "secret-token-value") {
		t.Errorf("error must never contain the token value: %v", err)
	}
}

func TestClientDoTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL, AuthToken: "secret-token-value", Timeout: 1 * time.Millisecond})
	_, err := c.Do(context.Background(), http.MethodGet, "/slow", nil, RequestOptions{})
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if strings.Contains(err.Error(), "secret-token-value") {
		t.Errorf("error must never contain the token value: %v", err)
	}
	var netErr *netgate.NetworkRequiredError
	if !errors.As(err, &netErr) {
		t.Errorf("expected timeout to be wrapped in *netgate.NetworkRequiredError, got %T (%v)", err, err)
	}
}

func TestClientDoNonJSONError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("<html>Internal Server Error</html>"))
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})
	_, err := c.Do(context.Background(), http.MethodGet, "/boom", nil, RequestOptions{})
	if err == nil {
		t.Fatal("expected error for non-JSON 500 response")
	}

	httpErr, ok := err.(*HTTPError)
	if !ok {
		t.Fatalf("expected *HTTPError, got %T", err)
	}
	if httpErr.StatusCode != http.StatusInternalServerError {
		t.Errorf("StatusCode = %d, want %d", httpErr.StatusCode, http.StatusInternalServerError)
	}
	if !strings.Contains(httpErr.Body, "Internal Server Error") {
		t.Errorf("Body = %q, want raw non-JSON body preserved", httpErr.Body)
	}
}

func TestClientDoEmptyBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})

	resp, err := c.Do(context.Background(), http.MethodDelete, "/gone", nil, RequestOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("StatusCode = %d, want %d", resp.StatusCode, http.StatusNoContent)
	}

	// A 2xx with an empty body and a non-nil decode target must not error.
	var result map[string]string
	if err := c.Get(context.Background(), "/empty", &result); err != nil {
		t.Errorf("empty 2xx body should not produce a decode error, got: %v", err)
	}
}

func TestClientErrorNeverContainsToken(t *testing.T) {
	const token = "super-secret-token-do-not-leak"

	scenarios := []struct {
		name string
		run  func(c *Client) error
	}{
		{"malformed URL", func(c *Client) error {
			_, err := c.Do(context.Background(), http.MethodGet, "/x", nil, RequestOptions{})
			return err
		}},
		{"legacy Get malformed URL", func(c *Client) error {
			return c.Get(context.Background(), "/x", nil)
		}},
		{"HTTP 500 body", func(c *Client) error {
			_, err := c.Do(context.Background(), http.MethodGet, "/x", nil, RequestOptions{})
			return err
		}},
	}

	// Malformed URL scenario.
	malformed := New(Config{BaseURL: "http://bad url with spaces", AuthToken: token})
	for _, s := range scenarios[:2] {
		if err := s.run(malformed); err == nil {
			t.Errorf("%s: expected error", s.name)
		} else if strings.Contains(err.Error(), token) {
			t.Errorf("%s: error must never contain the token value: %v", s.name, err)
		}
	}

	// Server error scenario.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":{"message":"boom"}}`))
	}))
	defer srv.Close()
	serverErr := New(Config{BaseURL: srv.URL, AuthToken: token})
	if err := scenarios[2].run(serverErr); err == nil {
		t.Error("HTTP 500: expected error")
	} else if strings.Contains(err.Error(), token) {
		t.Errorf("HTTP 500: error must never contain the token value: %v", err)
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
