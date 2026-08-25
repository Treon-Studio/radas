// Package logging provides a structured logger with rotating file output.
// Mirrors worker/logging_setup.py.
package logging

import (
	"context"
	"log/slog"
	"strings"

	"github.com/opensible/worker-go/internal/redaction"
)

// redactingHandler wraps another handler and redacts sensitive information
// from log attributes and messages before they're written.
type redactingHandler struct {
	next slog.Handler
}

// Handle processes a log record, redacting sensitive information before
// passing it to the underlying handler.
func (h *redactingHandler) Handle(ctx context.Context, r slog.Record) error {
	// Create a new record with redacted attributes
	redacted := slog.NewRecord(r.Time, r.Level, redaction.Text(r.Message), r.PC)
	r.Attrs(func(a slog.Attr) bool {
		redacted.AddAttrs(h.redactAttr(a))
		return true
	})
	return h.next.Handle(ctx, redacted)
}

// redactAttr recursively redacts sensitive information from an attribute.
func (h *redactingHandler) redactAttr(a slog.Attr) slog.Attr {
	if sensitiveLogKey(a.Key) {
		return slog.String(a.Key, redaction.Redacted)
	}
	switch a.Value.Kind() {
	case slog.KindString:
		// Redact sensitive information in string values
		return slog.String(a.Key, redaction.Text(a.Value.String()))
	case slog.KindAny:
		// For complex types, apply deep redaction
		return slog.Any(a.Key, redaction.Value(a.Value.Any()))
	default:
		// For simple types that can't contain secrets, return as-is
		return a
	}
}

func sensitiveLogKey(key string) bool {
	compact := strings.ToLower(strings.NewReplacer("-", "", "_", "", ".", "", " ", "").Replace(key))
	for _, candidate := range []string{"password", "credential", "token", "secret", "apikey", "accesskey", "privatekey", "authorization", "bearer"} {
		if strings.Contains(compact, candidate) {
			return true
		}
	}
	return false
}

// WithAttrs returns a new handler with additional attributes, with redaction applied.
func (h *redactingHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	redactedAttrs := make([]slog.Attr, len(attrs))
	for i, a := range attrs {
		redactedAttrs[i] = h.redactAttr(a)
	}
	return &redactingHandler{next: h.next.WithAttrs(redactedAttrs)}
}

// WithGroup returns a new handler with an additional group, without redaction (groups aren't sensitive).
func (h *redactingHandler) WithGroup(name string) slog.Handler {
	return &redactingHandler{next: h.next.WithGroup(name)}
}

// Enabled checks if the handler is enabled for the given level.
func (h *redactingHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.next.Enabled(ctx, level)
}
