package httpclient

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestServiceFailureTransmissionRedactsNaturalLanguageNestedValues(t *testing.T) {
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := New(srv.URL)
	if !client.FinishServiceExecution("op", "lease", "FAILED", 0, 0, nil,
		`provider password: "raw-password" Bearer raw-bearer`,
		map[string]any{"nested": []any{map[string]any{"api_key": "raw-key", "message": "secret is 'raw-secret'"}}},
	) {
		t.Fatal("finish request failed")
	}
	encoded, _ := json.Marshal(body)
	got := string(encoded)
	for _, secret := range []string{"raw-password", "raw-bearer", "raw-key", "raw-secret"} {
		if strings.Contains(got, secret) {
			t.Fatalf("secret %q leaked in HTTP payload %s", secret, got)
		}
	}
}

func TestRegisterAndClaimErrorsRedactBackendMessages(t *testing.T) {
	const (
		natural = "provider password is raw-password"
		bearer  = "Bearer raw-bearer"
		nested  = "api_key: raw-key"
	)

	tests := []struct {
		name       string
		path       string
		status     int
		wantStatus string
		call       func(*Client) error
	}{
		{
			name:       "register HTTP error",
			path:       "/api/worker/register",
			status:     http.StatusBadGateway,
			wantStatus: "502",
			call: func(client *Client) error {
				_, err := client.Register("worker", nil)
				return err
			},
		},
		{
			name:       "claim HTTP error",
			path:       "/api/worker/claim",
			status:     http.StatusBadGateway,
			wantStatus: "502",
			call: func(client *Client) error {
				_, err := client.Claim("project", 1, nil)
				return err
			},
		},
		{
			name:       "register backend failure",
			path:       "/api/worker/register",
			status:     http.StatusOK,
			wantStatus: "PROVIDER_ERROR",
			call: func(client *Client) error {
				_, err := client.Register("worker", nil)
				return err
			},
		},
		{
			name:       "claim backend failure",
			path:       "/api/worker/claim",
			status:     http.StatusOK,
			wantStatus: "PROVIDER_ERROR",
			call: func(client *Client) error {
				_, err := client.Claim("project", 1, nil)
				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != tt.path {
					t.Fatalf("path=%q, want %q", r.URL.Path, tt.path)
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tt.status)
				if tt.status == http.StatusOK {
					_, _ = w.Write([]byte(`{"success":false,"code":"PROVIDER_ERROR","error":{"message":"` + natural + `; ` + bearer + `; details={\"api_key\":\"` + nested + `\"}"}}`))
					return
				}
				_, _ = w.Write([]byte(`{"success":false,"error":"` + natural + `; ` + bearer + `; ` + nested + `"}`))
			}))
			defer srv.Close()

			err := tt.call(New(srv.URL))
			if err == nil {
				t.Fatal("expected backend error")
			}
			got := err.Error()
			for _, secret := range []string{"raw-password", "raw-bearer", "raw-key"} {
				if strings.Contains(got, secret) {
					t.Fatalf("backend secret %q leaked in %q", secret, got)
				}
			}
			if !strings.Contains(got, tt.wantStatus) {
				t.Fatalf("status/code missing from error %q", got)
			}
		})
	}
}

func TestTransportErrorsAreRedactedBeforeHTTPClientPathsLogOrReturn(t *testing.T) {
	const transportError = `dial failed: password=raw-transport-password Bearer raw-transport-bearer api_key=raw-transport-key`

	client := New("http://worker.invalid")
	client.HTTP = &http.Client{Transport: roundTripperFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New(transportError)
	})}

	if _, _, err := client.doJSON("POST", client.ServerURL, nil, nil, time.Second); err == nil {
		t.Fatal("expected transport error")
	} else if strings.Contains(err.Error(), "raw-transport-") {
		t.Fatalf("transport secret leaked from doJSON error: %q", err)
	}
	if client.SendServiceLog("op", "lease", "safe", 0) {
		t.Fatal("send service log unexpectedly succeeded")
	}
	if client.FinishServiceExecution("op", "lease", "FAILED", 0, 0, nil, "safe", nil) {
		t.Fatal("finish service execution unexpectedly succeeded")
	}
	if ok, _ := client.HeartbeatWithLease("op", "lease"); ok {
		t.Fatal("heartbeat unexpectedly succeeded")
	}
	if client.SendSystemInfo(map[string]any{"platform": "test"}) {
		t.Fatal("send system info unexpectedly succeeded")
	}
}

// roundTripperFunc makes a deterministic transport failure without opening a socket.
type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSendServiceLogRedactsNaturalLanguage(t *testing.T) {
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	client := New(srv.URL)
	if !client.SendServiceLog("op", "lease", `credential = "raw-log-secret"`, 0) {
		t.Fatal("log request failed")
	}
	if strings.Contains(body["text"].(string), "raw-log-secret") {
		t.Fatal("raw secret was transmitted")
	}
}
