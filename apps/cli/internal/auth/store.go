// Package auth implements the CLI-side persistence of control-plane
// credentials: the API URL, the access and refresh bearer tokens, and the
// username of the logged-in user.
//
// Storage decision: no pure-Go OS keychain library is present in go.mod, so
// credentials live in a restrictive (0600) JSON file inside the existing
// RADAS config directory (honoring RADAS_CONFIG_DIR). Tokens are never
// logged, never printed, and never accepted as command-line arguments —
// error messages deliberately omit file contents and underlying parse
// errors, because encoding/json diagnostics can quote input fragments and
// this file contains bearer tokens.
package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// FileName is the name of the credential file inside the RADAS config
// directory.
const FileName = "credentials.json"

// ErrNoCredentials is returned when no credential file exists (the user has
// not run `radas auth login`). Callers should match with errors.Is.
var ErrNoCredentials = errors.New("no stored RADAS credentials (run 'radas auth login' first)")

// ErrCorruptCredentials is returned when the credential file exists but is
// not valid JSON. The error deliberately excludes the underlying parse
// error: encoding/json diagnostics can quote input fragments and the file
// contains bearer tokens. Callers should suggest `radas auth logout` (which
// clears the local file) as the reset path.
var ErrCorruptCredentials = errors.New("stored RADAS credentials are corrupt (run 'radas auth logout' to reset them)")

// Credentials is the persisted credential set. It holds secrets — never
// print or log a Credentials value; the zero-value and field access are the
// only sanctioned ways to inspect individual fields.
type Credentials struct {
	APIURL       string    `json:"api_url,omitempty"`
	AccessToken  string    `json:"access_token,omitempty"`
	RefreshToken string    `json:"refresh_token,omitempty"`
	Username     string    `json:"username,omitempty"`
	SavedAt      time.Time `json:"saved_at,omitempty"`
}

// Empty reports whether the credentials carry no token at all.
func (c Credentials) Empty() bool {
	return c.AccessToken == "" && c.RefreshToken == ""
}

// Store reads and writes the credential file in a fixed directory.
type Store struct {
	dir string
}

// NewStore returns the store rooted at the RADAS config directory:
// RADAS_CONFIG_DIR when set, otherwise ~/.config/radas (the same directory
// the runtime selector uses).
func NewStore() *Store {
	dir := os.Getenv("RADAS_CONFIG_DIR")
	if dir == "" {
		// os.UserHomeDir failure is deferred to Path()/Save so constructing
		// the store never panics; the error surfaces on first use.
		home, err := os.UserHomeDir()
		if err != nil {
			home = "" // Path() will produce a relative path and Save will fail loudly.
		}
		dir = filepath.Join(home, ".config", "radas")
	}
	return &Store{dir: dir}
}

// NewStoreAt returns a store rooted at an explicit directory. Intended for
// tests and sandboxed environments.
func NewStoreAt(dir string) *Store {
	return &Store{dir: dir}
}

// Path is the absolute location of the credential file.
func (s *Store) Path() string {
	return filepath.Join(s.dir, FileName)
}

// Load reads the stored credentials. A missing file yields ErrNoCredentials;
// an unparseable file yields ErrCorruptCredentials (never embedding the file
// content, which contains bearer tokens).
func (s *Store) Load() (Credentials, error) {
	data, err := os.ReadFile(s.Path())
	if err != nil {
		if os.IsNotExist(err) {
			return Credentials{}, ErrNoCredentials
		}
		return Credentials{}, fmt.Errorf("read credentials file: %w", err)
	}

	var c Credentials
	// Note: err is intentionally not wrapped into the message — json errors
	// can quote input fragments and the file holds bearer tokens.
	if err := json.Unmarshal(data, &c); err != nil {
		return Credentials{}, fmt.Errorf("%w: parse failed", ErrCorruptCredentials)
	}
	return c, nil
}

// Save persists the credentials with restrictive permissions: the directory
// is created 0700 and the file is written (and re-chmodded) 0600, so a
// pre-existing permissive file is tightened on every save.
func (s *Store) Save(c Credentials) error {
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return fmt.Errorf("create credentials directory: %w", err)
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return fmt.Errorf("encode credentials: %w", err)
	}

	path := s.Path()
	if err := os.WriteFile(path, append(data, '\n'), 0o600); err != nil {
		return fmt.Errorf("write credentials file: %w", err)
	}
	// os.WriteFile only applies the mode on creation; enforce 0600 on every
	// save so an existing world-readable file never stays permissive.
	if err := os.Chmod(path, 0o600); err != nil {
		return fmt.Errorf("restrict credentials file permissions: %w", err)
	}
	return nil
}

// Clear removes the credential file. Removing a file that does not exist is
// a no-op (logout stays idempotent).
func (s *Store) Clear() error {
	if err := os.Remove(s.Path()); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove credentials file: %w", err)
	}
	return nil
}
