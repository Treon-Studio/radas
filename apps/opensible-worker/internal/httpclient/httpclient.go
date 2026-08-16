// Package httpclient talks to the OpenSible backend Worker API.
// Mirrors worker/http_client.py.
package httpclient

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/opensible/worker-go/internal/config"
	"github.com/opensible/worker-go/internal/logging"
	"github.com/opensible/worker-go/internal/redaction"
)

// Client is the worker's HTTP client for the backend.
type Client struct {
	ServerURL   string
	WorkerToken string
	WorkerID    string
	TokenFile   string
	HTTP        *http.Client
	mu          sync.Mutex
}

// New creates a Client, loading the token from env/disk if present.
func New(serverURL string) *Client {
	c := &Client{
		ServerURL: strings.TrimRight(serverURL, "/"),
		HTTP:      &http.Client{Timeout: 30 * time.Second},
	}
	if tf := os.Getenv("WORKER_TOKEN_FILE"); tf != "" {
		c.TokenFile = tf
	} else {
		c.TokenFile = filepath.Join(config.DataDir, "worker.token")
	}
	c.loadToken()
	return c
}

func (c *Client) loadToken() {
	if envTok := os.Getenv("WORKER_TOKEN"); envTok != "" {
		c.WorkerToken = envTok
		logging.L().Info("Loaded worker token from WORKER_TOKEN env")
		return
	}
	b, err := os.ReadFile(c.TokenFile)
	if err != nil {
		return
	}
	parts := strings.Split(strings.TrimSpace(string(b)), "\n")
	if len(parts) >= 2 {
		c.WorkerID = strings.TrimSpace(parts[0])
		c.WorkerToken = strings.TrimSpace(parts[1])
	} else if len(parts) == 1 {
		c.WorkerToken = strings.TrimSpace(parts[0])
	}
	logging.L().Info("Loaded worker token from file", "path", c.TokenFile)
}

func (c *Client) saveToken(workerID, workerToken string) {
	if err := os.MkdirAll(filepath.Dir(c.TokenFile), 0o755); err != nil {
		logging.L().Error("Failed to create token dir", "err", err)
		return
	}
	body := fmt.Sprintf("%s\n%s\n", workerID, workerToken)
	if err := os.WriteFile(c.TokenFile, []byte(body), 0o600); err != nil {
		logging.L().Error("Failed to save token", "err", err)
		return
	}
	c.WorkerID = workerID
	c.WorkerToken = workerToken
	logging.L().Info("Saved worker token", "path", c.TokenFile)
}

func (c *Client) doJSON(method, url string, in any, headers map[string]string, timeout time.Duration) (*http.Response, []byte, error) {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(redaction.Value(in))
		if err != nil {
			return nil, nil, err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.WorkerToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.WorkerToken)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := c.HTTP
	if timeout > 0 {
		client = &http.Client{Timeout: timeout}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	return resp, respBody, nil
}

// WaitUntilReady blocks until the backend health endpoint responds. This keeps
// Docker restarts from racing worker startup against Flask initialization.
func (c *Client) WaitUntilReady(timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	url := c.ServerURL + "/api/health"
	for time.Now().Before(deadline) {
		resp, err := c.HTTP.Get(url)
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 500 {
				return true
			}
		}
		time.Sleep(2 * time.Second)
	}
	return false
}

// HTTPError carries a status-code marker for higher-level retry logic.
type HTTPError struct {
	Status  int
	Message string
}

func (e *HTTPError) Error() string { return fmt.Sprintf("%d: %s", e.Status, redaction.Text(e.Message)) }

// Register self-registers this worker.
func (c *Client) Register(name string, capabilities map[string]any) (map[string]any, error) {
	url := c.ServerURL + "/api/worker/register"
	payload := map[string]any{"name": name, "capabilities": capabilities}
	if capabilities == nil {
		payload["capabilities"] = map[string]any{}
	}
	headers := map[string]string{}
	if s := strings.TrimSpace(os.Getenv("WORKER_REGISTRATION_SECRET")); s != "" {
		headers["X-Worker-Registration-Secret"] = s
	}
	resp, body, err := c.doJSON("POST", url, payload, headers, 10*time.Second)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, &HTTPError{Status: resp.StatusCode, Message: redaction.Text(string(body))}
	}
	var result map[string]any
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, errors.New("invalid backend response")
	}
	ok, _ := result["success"].(bool)
	if !ok {
		msg, _ := result["error"].(string)
		return nil, errors.New("registration failed: " + msg)
	}
	wid, _ := result["workerId"].(string)
	wtok, _ := result["workerToken"].(string)
	if wid != "" && wtok != "" {
		c.saveToken(wid, wtok)
	}
	return result, nil
}

// Claim asks the backend for the next execution to run.
// Returns nil, nil for HTTP 204 (no work).
func (c *Client) Claim(projectID string, maxConcurrency int, tags []string) (map[string]any, error) {
	url := c.ServerURL + "/api/worker/claim"
	payload := map[string]any{"maxConcurrency": maxConcurrency}
	if projectID != "" {
		payload["projectId"] = projectID
	}
	if len(tags) > 0 {
		payload["tags"] = tags
	}
	resp, body, err := c.doJSON("POST", url, payload, nil, 10*time.Second)
	if err != nil {
		return nil, err
	}
	switch {
	case resp.StatusCode == 204:
		return nil, nil
	case resp.StatusCode == 401:
		return nil, &HTTPError{Status: 401, Message: "UNAUTHORIZED - Invalid token"}
	case resp.StatusCode == 429:
		return nil, &HTTPError{Status: 429, Message: "TOO MANY REQUESTS"}
	case resp.StatusCode >= 400:
		return nil, &HTTPError{Status: resp.StatusCode, Message: redaction.Text(string(body))}
	}
	var result map[string]any
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, errors.New("invalid backend response")
	}
	ok, _ := result["success"].(bool)
	if !ok {
		msg, _ := result["error"].(string)
		return nil, errors.New("claim failed: " + msg)
	}
	return result, nil
}

// SendLog streams a chunk of log text for the legacy execution protocol.
func (c *Client) SendLog(executionID, text string, ts float64) bool {
	return c.SendServiceLog(executionID, "", text, ts)
}

// SendServiceLog streams a chunk of log text for a leased service operation.
func (c *Client) SendServiceLog(executionID, leaseToken, text string, ts float64) bool {
	url := fmt.Sprintf("%s/api/worker/executions/%s/log", c.ServerURL, executionID)
	payload := map[string]any{"text": redaction.Text(text)}
	if leaseToken != "" {
		payload["leaseToken"] = leaseToken
	}
	if ts > 0 {
		payload["ts"] = ts
	}
	resp, _, err := c.doJSON("POST", url, payload, nil, 10*time.Second)
	if err != nil {
		logging.L().Warn("send_log failed", "err", err)
		return false
	}
	return resp.StatusCode < 400
}

// FinishExecution marks a legacy execution as complete.
func (c *Client) FinishExecution(executionID, status string, finishedAt float64, duration int, returnCode *int, errStr string, result map[string]any) bool {
	return c.FinishServiceExecution(executionID, "", status, finishedAt, duration, returnCode, errStr, result)
}

// FinishServiceExecution marks a leased service operation as complete.
func (c *Client) FinishServiceExecution(executionID, leaseToken, status string, finishedAt float64, duration int, returnCode *int, errStr string, result map[string]any) bool {
	url := fmt.Sprintf("%s/api/worker/executions/%s/finish", c.ServerURL, executionID)
	if finishedAt == 0 {
		finishedAt = float64(time.Now().Unix())
	}
	payload := map[string]any{
		"status":     status,
		"finishedAt": finishedAt,
		"duration":   duration,
	}
	if leaseToken != "" {
		payload["leaseToken"] = leaseToken
	}
	if returnCode != nil {
		payload["returnCode"] = *returnCode
	}
	if errStr != "" {
		payload["error"] = redaction.Text(errStr)
	}
	if result != nil {
		payload["result"] = redaction.Value(result)
		if code, ok := result["error_code"].(string); ok && code != "" {
			payload["errorCode"] = safeErrorCode(code)
		}
		if code, ok := result["code"].(string); ok && code != "" {
			payload["errorCode"] = safeErrorCode(code)
		}
		if nested, ok := result["error"].(map[string]any); ok {
			if code, ok := nested["code"].(string); ok && code != "" {
				payload["errorCode"] = safeErrorCode(code)
			}
		}
	}
	// Service-operation failures must always carry a stable, allowlisted code,
	// including decode failures and providers that return a nil/malformed result.
	if status == "FAILED" && leaseToken != "" {
		if code, ok := payload["errorCode"].(string); !ok || code == "" {
			payload["errorCode"] = "OPERATION_FAILED"
		}
	}
	resp, _, err := c.doJSON("POST", url, payload, nil, 15*time.Second)
	if err != nil {
		logging.L().Error("finish_execution failed", "err", err)
		return false
	}
	return resp.StatusCode < 400
}

func safeErrorCode(value string) string {
	candidate := strings.ToUpper(strings.TrimSpace(value))
	allowed := map[string]bool{"PROVIDER_ERROR": true, "PROVIDER_TIMEOUT": true, "PROVIDER_DISABLED": true, "INVALID_RUNTIME": true, "UNSUPPORTED_CAPABILITY": true, "UNSUPPORTED_TIMEOUT": true, "UNSUPPORTED_IDEMPOTENCY": true, "IDEMPOTENCY_MISMATCH": true, "INVALID_PROVIDER_RESULT": true, "INVALID_PROVIDER_LOG": true, "INVALID_PROVIDER_VALIDATION": true, "INVALID_SPEC": true, "PROVIDER_VALIDATION_ERROR": true, "REMOTE_ERROR": true, "BAD_SPEC": true, "MISSING_DETAILS": true, "OPERATION_FAILED": true, "OPERATION_CANCELED": true}
	if allowed[candidate] {
		return candidate
	}
	return "OPERATION_FAILED"
}

// Heartbeat pings the backend using the legacy worker protocol.
func (c *Client) Heartbeat(currentExecutionID string) (ok bool, requestSystemInfo bool) {
	return c.HeartbeatWithLease(currentExecutionID, "")
}

// HeartbeatWithLease renews a service operation lease with its claim token.
// If the response contains requestSystemInfo=true the caller should re-send system info.
func (c *Client) HeartbeatWithLease(currentExecutionID, leaseToken string) (ok bool, requestSystemInfo bool) {
	url := c.ServerURL + "/api/worker/heartbeat"
	payload := map[string]any{"ts": float64(time.Now().Unix())}
	if c.WorkerID != "" {
		payload["workerId"] = c.WorkerID
	}
	if currentExecutionID != "" {
		payload["currentExecutionId"] = currentExecutionID
	}
	if leaseToken != "" {
		payload["leaseToken"] = leaseToken
	}
	resp, body, err := c.doJSON("POST", url, payload, nil, 5*time.Second)
	if err != nil {
		logging.L().Warn("heartbeat failed", "err", err)
		return false, false
	}
	if resp.StatusCode == 401 {
		logging.L().Warn("heartbeat 401 - invalid token")
		return false, false
	}
	if resp.StatusCode >= 400 {
		return false, false
	}
	var result map[string]any
	_ = json.Unmarshal(body, &result)
	if wid, _ := result["workerId"].(string); wid != "" && c.WorkerID == "" {
		c.WorkerID = wid
	}
	rsi, _ := result["requestSystemInfo"].(bool)
	success, _ := result["success"].(bool)
	return success, rsi
}

// GetExecutionStatus returns the current status of an execution.
func (c *Client) GetExecutionStatus(executionID, projectID string) string {
	url := fmt.Sprintf("%s/api/executions/%s", c.ServerURL, executionID)
	if projectID != "" {
		url += "?projectId=" + projectID
	}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return ""
	}
	if c.WorkerToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.WorkerToken)
	}
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return ""
	}
	body, _ := io.ReadAll(resp.Body)
	var result map[string]any
	if err := json.Unmarshal(body, &result); err != nil {
		return ""
	}
	if ok, _ := result["success"].(bool); ok {
		if execution, _ := result["execution"].(map[string]any); execution != nil {
			s, _ := execution["status"].(string)
			return s
		}
	}
	return ""
}

// SendSystemInfo publishes the current system info payload.
func (c *Client) SendSystemInfo(info map[string]any) bool {
	url := c.ServerURL + "/api/worker/system-info"
	resp, _, err := c.doJSON("POST", url, map[string]any{"systemInfo": info}, nil, 10*time.Second)
	if err != nil {
		logging.L().Warn("send_system_info failed", "err", err)
		return false
	}
	return resp.StatusCode < 400
}
