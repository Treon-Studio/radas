package logging

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
)

func TestRedactingHandlerRedactsStructuredSecrets(t *testing.T) {
	var output bytes.Buffer
	base := slog.NewTextHandler(&output, nil)
	logger := slog.New(&redactingHandler{next: base})
	logger.ErrorContext(context.Background(), `provider password="message-secret" Bearer message-token`,
		slog.String("password", "field-secret"),
		slog.String("details", `token: "nested-secret"`),
		slog.Any("payload", map[string]any{
			"api_key": "map-secret",
			"nested":  map[string]any{"private_key": "private-secret", "safe": "ok"},
		}),
		slog.Any("err", map[string]any{"authorization": "auth-secret"}),
	)
	got := output.String()
	for _, secret := range []string{"message-secret", "message-token", "field-secret", "nested-secret", "map-secret", "private-secret", "auth-secret"} {
		if strings.Contains(got, secret) {
			t.Fatalf("secret %q leaked in log: %s", secret, got)
		}
	}
	for _, marker := range []string{"[REDACTED]", "password", "details", "payload"} {
		if !strings.Contains(got, marker) {
			t.Fatalf("expected %q in redacted log: %s", marker, got)
		}
	}
}
