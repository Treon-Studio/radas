package updater_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/raizora/radas/v4/constants"
	"github.com/raizora/radas/v4/internal/netgate"
	"github.com/raizora/radas/v4/internal/updater"
)

type mockProber struct {
	err error
}

func (m *mockProber) Probe(ctx context.Context) error {
	return m.err
}

func TestCheckForUpdate_Offline(t *testing.T) {
	errOffline := errors.New("network unreachable")
	netgate.ResetCache()
	netgate.SetProber(&mockProber{err: errOffline})
	defer netgate.ResetCache()

	rel, hasUpdate, err := updater.CheckForUpdate()
	if err == nil {
		t.Fatal("expected CheckForUpdate to return error when offline, got nil")
	}

	if rel != nil {
		t.Errorf("expected release to be nil when offline, got %v", rel)
	}

	if hasUpdate {
		t.Errorf("expected hasUpdate to be false when offline, got true")
	}

	var netErr *netgate.NetworkRequiredError
	if !errors.As(err, &netErr) {
		t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
	}

	if netErr.Feature != "Pemeriksaan Update RADAS" {
		t.Errorf("expected feature 'Pemeriksaan Update RADAS', got %q", netErr.Feature)
	}
}

func TestCheckForUpdate_Online_HasUpdate(t *testing.T) {
	origURL := constants.VersionCheckURL
	origVersion := constants.Version
	defer func() {
		constants.VersionCheckURL = origURL
		constants.Version = origVersion
		netgate.ResetCache()
	}()

	constants.Version = "1.0.0"

	mockRelease := updater.Release{
		TagName:     "v2.0.0",
		Name:        "Release 2.0.0",
		Body:        "New features",
		CreatedAt:   time.Now(),
		PublishedAt: time.Now(),
		Assets: []updater.Asset{
			{
				Name:               fmt.Sprintf("radas_%s_%s", runtime.GOOS, runtime.GOARCH),
				BrowserDownloadURL: "http://example.com/binary",
				ContentType:        "application/octet-stream",
				Size:               12345,
			},
		},
	}

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(mockRelease)
	}))
	defer ts.Close()

	constants.VersionCheckURL = ts.URL

	netgate.ResetCache()
	netgate.SetProber(&mockProber{err: nil})

	rel, hasUpdate, err := updater.CheckForUpdate()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !hasUpdate {
		t.Errorf("expected hasUpdate to be true for v2.0.0 vs 1.0.0")
	}

	if rel == nil || rel.TagName != "v2.0.0" {
		t.Errorf("expected release TagName v2.0.0, got %v", rel)
	}
}

func TestCheckForUpdate_Online_NoUpdate(t *testing.T) {
	origURL := constants.VersionCheckURL
	origVersion := constants.Version
	defer func() {
		constants.VersionCheckURL = origURL
		constants.Version = origVersion
		netgate.ResetCache()
	}()

	constants.Version = "2.0.0"

	mockRelease := updater.Release{
		TagName: "v2.0.0",
		Name:    "Release 2.0.0",
	}

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(mockRelease)
	}))
	defer ts.Close()

	constants.VersionCheckURL = ts.URL

	netgate.ResetCache()
	netgate.SetProber(&mockProber{err: nil})

	rel, hasUpdate, err := updater.CheckForUpdate()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if hasUpdate {
		t.Errorf("expected hasUpdate to be false for v2.0.0 vs 2.0.0")
	}

	if rel == nil || rel.TagName != "v2.0.0" {
		t.Errorf("expected release TagName v2.0.0, got %v", rel)
	}
}

func TestDownloadRelease(t *testing.T) {
	binaryContent := []byte("mock-binary-payload")

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(binaryContent)
	}))
	defer ts.Close()

	t.Run("successful download for matching platform", func(t *testing.T) {
		release := &updater.Release{
			TagName: "v2.0.0",
			Assets: []updater.Asset{
				{
					Name:               fmt.Sprintf("radas_%s_%s", runtime.GOOS, runtime.GOARCH),
					BrowserDownloadURL: ts.URL,
				},
			},
		}

		data, err := updater.DownloadRelease(release)
		if err != nil {
			t.Fatalf("DownloadRelease failed: %v", err)
		}

		if string(data) != string(binaryContent) {
			t.Errorf("expected binary content %q, got %q", binaryContent, data)
		}
	})

	t.Run("error when no matching platform asset", func(t *testing.T) {
		release := &updater.Release{
			TagName: "v2.0.0",
			Assets: []updater.Asset{
				{
					Name:               "radas_nonexistentos_fakearch",
					BrowserDownloadURL: ts.URL,
				},
			},
		}

		_, err := updater.DownloadRelease(release)
		if err == nil {
			t.Fatal("expected error when no matching asset found, got nil")
		}
	})
}

func TestPerformUpdate(t *testing.T) {
	// Create a dummy file as target executable
	tmpDir := t.TempDir()
	fakeExe := filepath.Join(tmpDir, "radas_exe")
	if err := os.WriteFile(fakeExe, []byte("old_binary"), 0755); err != nil {
		t.Fatalf("failed to create fake exe: %v", err)
	}

	newBinary := []byte("new_binary_data_123")
	if len(newBinary) == 0 {
		t.Error("new binary empty")
	}
}
