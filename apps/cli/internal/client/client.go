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
)

type Config struct {
	BaseURL    string
	Timeout    time.Duration
	AuthToken  string
	UserAgent  string
}

type Client struct {
	httpClient *http.Client
	baseURL    string
	authToken  string
	userAgent  string
}

func New(cfg Config) *Client {
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	if cfg.UserAgent == "" {
		cfg.UserAgent = "radas-cli/1.0"
	}

	return &Client{
		httpClient: &http.Client{Timeout: cfg.Timeout},
		baseURL:    strings.TrimRight(cfg.BaseURL, "/"),
		authToken:  cfg.AuthToken,
		userAgent:  cfg.UserAgent,
	}
}

func (c *Client) Get(ctx context.Context, path string, result any) error {
	req, err := c.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	return c.do(req, result)
}

func (c *Client) Post(ctx context.Context, path string, body, result any) error {
	req, err := c.newJSONRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return err
	}
	return c.do(req, result)
}

func (c *Client) Put(ctx context.Context, path string, body, result any) error {
	req, err := c.newJSONRequest(ctx, http.MethodPut, path, body)
	if err != nil {
		return err
	}
	return c.do(req, result)
}

func (c *Client) Delete(ctx context.Context, path string) error {
	req, err := c.newRequest(ctx, http.MethodDelete, path, nil)
	if err != nil {
		return err
	}
	return c.do(req, nil)
}

func (c *Client) StreamSSE(ctx context.Context, path string) (<-chan Event, error) {
	req, err := c.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Connection", "keep-alive")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sse request failed: %w", err)
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
	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal sse body: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	req, err := c.newRequest(ctx, http.MethodPost, path, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Connection", "keep-alive")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sse post request failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("sse post request returned status %d", resp.StatusCode)
	}

	ch := make(chan Event)
	go c.readSSE(ctx, resp.Body, ch)
	return ch, nil
}

func (c *Client) newRequest(ctx context.Context, method, path string, body io.Reader) (*http.Request, error) {
	url := c.resolveURL(path)
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}
	req.Header.Set("User-Agent", c.userAgent)
	return req, nil
}

func (c *Client) newJSONRequest(ctx context.Context, method, path string, body any) (*http.Request, error) {
	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	req, err := c.newRequest(ctx, method, path, reqBody)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return req, nil
}

func (c *Client) do(req *http.Request, result any) error {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return &HTTPError{
			Status:     resp.Status,
			StatusCode: resp.StatusCode,
			Body:       string(body),
		}
	}

	if result == nil {
		return nil
	}

	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
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
