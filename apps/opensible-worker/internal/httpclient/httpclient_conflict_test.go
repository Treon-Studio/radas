package httpclient

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClaimMapsConflictToTypedHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "2")
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"claim_conflict"}`))
	}))
	defer srv.Close()

	_, err := New(srv.URL).Claim("project", 1, nil)
	if err == nil {
		t.Fatal("expected claim conflict error")
	}
	httpErr, ok := err.(*HTTPError)
	if !ok || httpErr.Status != http.StatusConflict {
		t.Fatalf("error=%T %#v, want HTTPError 409", err, err)
	}
}
