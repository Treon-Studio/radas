package client

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/raizora/radas/v4/internal/netgate"
)

type Config struct {
	BaseURL   string
	Timeout   time.Duration
	AuthToken string
	UserAgent string

	// Default tenant/correlation context applied to every request. Per-request
	// RequestOptions values override these for a single call.
	ProjectID      string
	OrganizationID string
	RequestID      string
	TraceID        string
}

type Client struct {
	httpClient *http.Client
	baseURL    string
	authToken  string
	userAgent  string

	projectID      string
	organizationID string
	requestID      string
	traceID        string
}

func New(cfg Config) *Client {
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	if cfg.UserAgent == "" {
		cfg.UserAgent = "radas-cli/1.0"
	}

	return &Client{
		httpClient:     &http.Client{Timeout: cfg.Timeout},
		baseURL:        strings.TrimRight(cfg.BaseURL, "/"),
		authToken:      cfg.AuthToken,
		userAgent:      cfg.UserAgent,
		projectID:      cfg.ProjectID,
		organizationID: cfg.OrganizationID,
		requestID:      cfg.RequestID,
		traceID:        cfg.TraceID,
	}
}

func (c *Client) Get(ctx context.Context, path string, result any) error {
	req, err := c.newRequest(ctx, http.MethodGet, path, nil, RequestOptions{})
	if err != nil {
		return err
	}
	return c.do(req, result)
}

func (c *Client) Post(ctx context.Context, path string, body, result any) error {
	req, err := c.newJSONRequest(ctx, http.MethodPost, path, body, RequestOptions{})
	if err != nil {
		return err
	}
	return c.do(req, result)
}

func (c *Client) Put(ctx context.Context, path string, body, result any) error {
	req, err := c.newJSONRequest(ctx, http.MethodPut, path, body, RequestOptions{})
	if err != nil {
		return err
	}
	return c.do(req, result)
}

func (c *Client) Delete(ctx context.Context, path string) error {
	req, err := c.newRequest(ctx, http.MethodDelete, path, nil, RequestOptions{})
	if err != nil {
		return err
	}
	return c.do(req, nil)
}

// Do performs an arbitrary request with full per-request context control via
// RequestOptions, returning a buffered *Response for successful (2xx) calls.
// Non-2xx responses are returned as *HTTPError; transport failures are wrapped
// by netgate. body is JSON-encoded when non-nil.
func (c *Client) Do(ctx context.Context, method, path string, body any, opts RequestOptions) (*Response, error) {
	req, err := c.newJSONRequest(ctx, method, path, body, opts)
	if err != nil {
		return nil, err
	}
	return c.execute(req)
}

func (c *Client) StreamSSE(ctx context.Context, path string) (<-chan Event, error) {
	req, err := c.newRequest(ctx, http.MethodGet, path, nil, RequestOptions{})
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Connection", "keep-alive")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sse request failed: %w", netgate.WrapError("RADAS SSE Stream", err))
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("sse request returned status %d", resp.StatusCode)
	}

	ch := make(chan Event)
	go c.readSSE(ctx, resp.Body, ch)
	return ch, nil
}

func (c *Client) PostStreamSSE(ctx context.Context, path string, body any) (<-chan Event, error) {
	req, err := c.newJSONRequest(ctx, http.MethodPost, path, body, RequestOptions{})
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Connection", "keep-alive")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sse post request failed: %w", netgate.WrapError("RADAS SSE Stream", err))
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("sse post request returned status %d", resp.StatusCode)
	}

	ch := make(chan Event)
	go c.readSSE(ctx, resp.Body, ch)
	return ch, nil
}

// newRequest is the single request builder for every outgoing call (GET, POST,
// PUT, DELETE, SSE, Do). It resolves the URL, applies auth and user-agent
// headers, and propagates tenant/correlation context headers.
func (c *Client) newRequest(ctx context.Context, method, path string, body io.Reader, opts RequestOptions) (*http.Request, error) {
	url := c.resolveURL(path)
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}
	req.Header.Set("User-Agent", c.userAgent)
	c.applyContextHeaders(req.Header, opts)
	return req, nil
}

func (c *Client) newJSONRequest(ctx context.Context, method, path string, body any, opts RequestOptions) (*http.Request, error) {
	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	req, err := c.newRequest(ctx, method, path, reqBody, opts)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return req, nil
}

// execute sends the request and returns a buffered *Response on 2xx, a
// *HTTPError on non-2xx, and a netgate-wrapped error on transport failure.
func (c *Client) execute(req *http.Request) (*Response, error) {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", netgate.WrapError("RADAS Control Plane API", err))
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", netgate.WrapError("RADAS Control Plane API", err))
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &HTTPError{
			Status:     resp.Status,
			StatusCode: resp.StatusCode,
			Body:       string(data),
		}
	}

	return &Response{
		StatusCode: resp.StatusCode,
		Status:     resp.Status,
		Header:     resp.Header,
		Body:       data,
	}, nil
}

func (c *Client) do(req *http.Request, result any) error {
	resp, err := c.execute(req)
	if err != nil {
		return err
	}
	return resp.JSON(result)
}

func (c *Client) resolveURL(path string) string {
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	return c.baseURL + "/" + strings.TrimLeft(path, "/")
}

func (c *Client) readSSE(ctx context.Context, body io.ReadCloser, ch chan<- Event) {
	defer body.Close()
	defer close(ch)

	scanner := bufio.NewScanner(body)
	var event Event

	for scanner.Scan() {
		line := scanner.Text()

		if strings.HasPrefix(line, "event:") {
			event.Type = strings.TrimSpace(line[6:])
		} else if strings.HasPrefix(line, "data:") {
			event.Data += strings.TrimSpace(line[5:])
		} else if line == "" {
			select {
			case ch <- event:
			case <-ctx.Done():
				return
			}
			event = Event{}
		}
	}
}

type Event struct {
	Type string
	Data string
}

type HTTPError struct {
	Status     string
	StatusCode int
	Body       string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("%s: %s", e.Status, e.Body)
}
