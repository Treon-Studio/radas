package execute

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/opensible/worker-go/internal/httpclient"
)

func TestMutationFlagEvaluation(t *testing.T) {
	tests := []struct {
		name       string
		status     int
		body       string
		wantEnable bool
		wantErr    bool
	}{
		{"allows", http.StatusOK, `{"enabled":false,"reason":"globally_disabled"}`, false, false},
		{"blocks", http.StatusOK, `{"enabled":true,"reason":"kill_switch"}`, true, false},
		{"malformed", http.StatusOK, `{`, false, true},
		{"server error", http.StatusServiceUnavailable, `{}`, false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/flags/evaluate" {
					t.Fatalf("unexpected path: %s", r.URL.Path)
				}
				w.WriteHeader(tt.status)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer srv.Close()
			client := httpclient.New(srv.URL)
			enabled, _, err := client.EvaluateFeatureFlag("block_apply", "project-1", "prod")
			if enabled != tt.wantEnable {
				t.Fatalf("enabled=%v, want %v", enabled, tt.wantEnable)
			}
			if (err != nil) != tt.wantErr {
				t.Fatalf("err=%v, wantErr=%v", err, tt.wantErr)
			}
		})
	}
}

func TestMutationFlagTransportFailureFailsClosed(t *testing.T) {
	client := httpclient.New("http://127.0.0.1:1")
	enabled, reason, err := client.EvaluateFeatureFlag("block_destroy", "project-1", "prod")
	if enabled {
		t.Fatal("transport failure must not allow mutation")
	}
	if reason != "flag_evaluation_error" || err == nil {
		t.Fatalf("reason=%q err=%v, want fail-closed error", reason, err)
	}
}
