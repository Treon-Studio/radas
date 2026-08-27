package auth

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testCredentials() Credentials {
	return Credentials{
		APIURL:       "http://localhost:5001",
		AccessToken:  "access-token-for-tests",
		RefreshToken: "refresh-token-for-tests",
		Username:     "alice",
		SavedAt:      time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC),
	}
}

func TestSaveAndLoadRoundTrip(t *testing.T) {
	store := NewStoreAt(t.TempDir())

	if err := store.Save(testCredentials()); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := store.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	want := testCredentials()
	if got != want {
		t.Errorf("Load() = %+v, want %+v", got, want)
	}
}

func TestSaveUsesRestrictivePermissions(t *testing.T) {
	dir := t.TempDir()
	store := NewStoreAt(dir)

	if err := store.Save(testCredentials()); err != nil {
		t.Fatalf("Save: %v", err)
	}

	info, err := os.Stat(store.Path())
	if err != nil {
		t.Fatalf("stat credentials file: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("credentials file mode = %o, want 600", perm)
	}

}

func TestSaveCreatesMissingDirRestrictively(t *testing.T) {
	// The store creates its own directory 0700 when it does not exist yet.
	// (A pre-existing directory — e.g. the shared ~/.config/radas — is left
	// alone; only the credential file itself is always tightened to 0600.)
	dir := filepath.Join(t.TempDir(), "radas-created")
	store := NewStoreAt(dir)

	if err := store.Save(testCredentials()); err != nil {
		t.Fatalf("Save: %v", err)
	}

	info, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("stat config dir: %v", err)
	}
	if perm := info.Mode().Perm(); perm&0o077 != 0 {
		t.Errorf("created config dir mode = %o, want no group/other access", perm)
	}
}

func TestSaveTightensExistingFilePermissions(t *testing.T) {
	dir := t.TempDir()
	store := NewStoreAt(dir)

	// Pre-create the file world-readable, as a previous insecure version
	// might have. Saving must not leave it permissive.
	if err := os.WriteFile(store.Path(), []byte("{}"), 0o644); err != nil {
		t.Fatalf("pre-create: %v", err)
	}

	if err := store.Save(testCredentials()); err != nil {
		t.Fatalf("Save: %v", err)
	}

	info, err := os.Stat(store.Path())
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("credentials file mode = %o, want 600", perm)
	}
}

func TestLoadMissingCredentials(t *testing.T) {
	store := NewStoreAt(t.TempDir())

	_, err := store.Load()
	if !errors.Is(err, ErrNoCredentials) {
		t.Errorf("Load() error = %v, want ErrNoCredentials", err)
	}
}

func TestLoadCorruptCredentials(t *testing.T) {
	dir := t.TempDir()
	store := NewStoreAt(dir)

	// The corrupt file contains what looks like a bearer token; the load
	// error must never echo file content back (no-token-logging guarantee).
	corrupt := "not-json-at-all access-token-for-tests"
	if err := os.WriteFile(store.Path(), []byte(corrupt), 0o600); err != nil {
		t.Fatalf("write corrupt file: %v", err)
	}

	_, err := store.Load()
	if !errors.Is(err, ErrCorruptCredentials) {
		t.Errorf("Load() error = %v, want ErrCorruptCredentials", err)
	}
	if strings.Contains(err.Error(), "access-token-for-tests") {
		t.Errorf("Load() error leaked token content: %q", err.Error())
	}
}

func TestSavePermissionFailureNeverLeaksToken(t *testing.T) {
	dir := t.TempDir()
	store := NewStoreAt(dir)

	// Occupying the credentials path with a directory makes the write fail.
	if err := os.MkdirAll(store.Path(), 0o755); err != nil {
		t.Fatalf("mkdir at credentials path: %v", err)
	}

	err := store.Save(testCredentials())
	if err == nil {
		t.Fatal("Save into a directory path should fail")
	}
	if strings.Contains(err.Error(), "access-token-for-tests") || strings.Contains(err.Error(), "refresh-token-for-tests") {
		t.Errorf("Save() error leaked token content: %q", err.Error())
	}
}

func TestClearRemovesAndIsIdempotent(t *testing.T) {
	store := NewStoreAt(t.TempDir())

	if err := store.Save(testCredentials()); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := store.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	if _, err := store.Load(); !errors.Is(err, ErrNoCredentials) {
		t.Errorf("Load after Clear: %v, want ErrNoCredentials", err)
	}
	if err := store.Clear(); err != nil {
		t.Errorf("second Clear should be a no-op, got %v", err)
	}
}

func TestCredentialsEmpty(t *testing.T) {
	if !(Credentials{}.Empty()) {
		t.Error("zero Credentials should be Empty")
	}
	if (Credentials{AccessToken: "x"}).Empty() {
		t.Error("Credentials with a token should not be Empty")
	}
	if (Credentials{RefreshToken: "x"}).Empty() {
		t.Error("Credentials with a refresh token should not be Empty")
	}
}

func TestNewStoreHonorsConfigDirEnv(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)

	store := NewStore()
	if store.Path() != filepath.Join(dir, FileName) {
		t.Errorf("Path() = %s, want %s", store.Path(), filepath.Join(dir, FileName))
	}

	if err := store.Save(testCredentials()); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := store.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.Username != "alice" {
		t.Errorf("Username = %q, want alice", got.Username)
	}
}
