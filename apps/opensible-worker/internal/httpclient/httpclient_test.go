package httpclient

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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
