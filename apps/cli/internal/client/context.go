package client

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Header names used to propagate tenant and correlation context to the server.
const (
	HeaderProjectID      = "X-Project-Id"
	HeaderOrganizationID = "X-Org-Id"
	HeaderRequestID      = "X-Request-Id"
	HeaderTraceID        = "X-Trace-Id"
	HeaderIdempotencyKey = "Idempotency-Key"
)

// RequestOptions carries per-request tenant and correlation context. Non-empty
// fields override the corresponding client-level Config values for a single
// request. The zero value is valid and means "inherit Config, generate a
// request ID".
type RequestOptions struct {
	// IdempotencyKey, when set, is sent as the Idempotency-Key header so the
	// server can safely deduplicate or replay the mutation.
	IdempotencyKey string
	// ProjectID scopes the request to a project (X-Project-Id).
	ProjectID string
	// OrganizationID scopes the request to an organization (X-Org-Id).
	OrganizationID string
	// RequestID correlates the request across logs (X-Request-Id). When empty
	// — both here and on Config — a random ID is generated per request.
	RequestID string
	// TraceID propagates a distributed trace identifier (X-Trace-Id).
	TraceID string
}

// Response is the outcome of a successful (2xx) Do request. The body is fully
// buffered so headers and status can be inspected after the connection closes.
type Response struct {
	StatusCode int
	Status     string
	Header     http.Header
	Body       []byte
}

// JSON decodes the response body into v. It is a no-op when v is nil or when
// the body is empty (e.g. 204 No Content), so empty successful responses never
// surface as decode errors.
func (r *Response) JSON(v any) error {
	if v == nil {
		return nil
	}
	if len(bytes.TrimSpace(r.Body)) == 0 {
		return nil
	}
	if err := json.Unmarshal(r.Body, v); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

// String returns the raw response body as a string.
func (r *Response) String() string {
	return string(r.Body)
}

// applyContextHeaders sets tenant/correlation headers on an outgoing request.
// Precedence is per-request opts over client-level config. A request ID is
// generated when neither source provides one, so every request is correlated.
// Auth token values are only ever written to the Authorization header and are
// never copied into other headers, errors, or logs.
func (c *Client) applyContextHeaders(h http.Header, opts RequestOptions) {
	if v := firstNonEmpty(opts.ProjectID, c.projectID); v != "" {
		h.Set(HeaderProjectID, v)
	}
	if v := firstNonEmpty(opts.OrganizationID, c.organizationID); v != "" {
		h.Set(HeaderOrganizationID, v)
	}
	if v := firstNonEmpty(opts.RequestID, c.requestID); v != "" {
		h.Set(HeaderRequestID, v)
	} else {
		h.Set(HeaderRequestID, newRequestID())
	}
	if v := firstNonEmpty(opts.TraceID, c.traceID); v != "" {
		h.Set(HeaderTraceID, v)
	}
	if opts.IdempotencyKey != "" {
		h.Set(HeaderIdempotencyKey, opts.IdempotencyKey)
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// NewRequestID generates a random correlation ID for callers that need the
// request identifier up front — for example to include it in error messages
// while passing the same value via RequestOptions.RequestID. It contains no
// user, credential, or payload data.
func NewRequestID() string {
	return newRequestID()
}

// newRequestID generates a random correlation ID for requests that lack an
// explicit one. It contains no user, credential, or payload data.
func newRequestID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand failure is exceptional; fall back to a timestamp-based
		// ID rather than dropping request correlation entirely.
		return fmt.Sprintf("req-%016x", time.Now().UnixNano())
	}
	return "req-" + hex.EncodeToString(b[:])
}
