package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"radas/constants"
)

// Release represents the GitHub release information
type Release struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	CreatedAt   time.Time `json:"created_at"`
	PublishedAt time.Time `json:"published_at"`
	Assets      []Asset   `json:"assets"`
}

// Asset represents a GitHub release asset
type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	ContentType        string `json:"content_type"`
	Size               int    `json:"size"`
}

// CheckForUpdate checks if a new version is available
func CheckForUpdate() (*Release, bool, error) {
	// Get current version
	currentVersion := constants.Version

	// Get latest release from GitHub
	release, err := getLatestRelease()
	if err != nil {
		return nil, false, err
	}

	// Tag name usually starts with 'v', remove it if present
	latestVersion := strings.TrimPrefix(release.TagName, "v")

	// Compare versions (simple string comparison for now)
	// In a production app, you might want to use a proper semver comparison
	hasUpdate := latestVersion > currentVersion

	return release, hasUpdate, nil
}

// getLatestRelease gets the latest release information from GitHub
func getLatestRelease() (*Release, error) {
	// Create HTTP request
	req, err := http.NewRequest("GET", constants.VersionCheckURL, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}

	// Set headers
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Radas-CLI")

	// Send request
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error making request: %v", err)
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("received non-200 response: %d", resp.StatusCode)
	}

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response body: %v", err)
	}

	// Parse JSON
	var release Release
	if err := json.Unmarshal(body, &release); err != nil {
		return nil, fmt.Errorf("error parsing JSON: %v", err)
	}

	return &release, nil
}

// DownloadRelease downloads a new version of the binary
func DownloadRelease(release *Release) ([]byte, error) {
	// Determine which asset to download based on OS and architecture
	assetURL := ""
	for _, asset := range release.Assets {
		// Look for assets with naming pattern like "radas_linux_amd64" or "radas_darwin_arm64"
		nameParts := strings.Split(asset.Name, "_")
		if len(nameParts) >= 3 {
			isCurrentOS := strings.Contains(strings.ToLower(asset.Name), strings.ToLower(runtime.GOOS))
			isCurrentArch := strings.Contains(strings.ToLower(asset.Name), strings.ToLower(runtime.GOARCH))
			
			if isCurrentOS && isCurrentArch {
				assetURL = asset.BrowserDownloadURL
				break
			}
		}
	}

	if assetURL == "" {
		return nil, errors.New("no suitable binary found for current platform")
	}

	// Download the asset
	req, err := http.NewRequest("GET", assetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating download request: %v", err)
	}

	req.Header.Set("User-Agent", "Radas-CLI")

	client := &http.Client{Timeout: 5 * time.Minute} // Longer timeout for large downloads
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error downloading binary: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("received non-200 response when downloading: %d", resp.StatusCode)
	}

	// Read the response body
	binary, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading download response: %v", err)
	}

	return binary, nil
}

// PerformUpdate replaces the current executable with the new one
func PerformUpdate(newBinary []byte) error {
	// Get the path to the current executable
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("error getting executable path: %v", err)
	}

	// Get absolute path to executable
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("error resolving symlinks: %v", err)
	}

	// Calculate SHA-256 checksum of the new binary for verification
	hash := sha256.Sum256(newBinary)
	checksum := hex.EncodeToString(hash[:])
	
	// Create a temporary file
	tempFile := execPath + ".new"
	if err := os.WriteFile(tempFile, newBinary, 0755); err != nil {
		return fmt.Errorf("error writing new executable: %v", err)
	}

	// Calculate and verify checksum of the written file
	writtenData, err := os.ReadFile(tempFile)
	if err != nil {
		os.Remove(tempFile)
		return fmt.Errorf("error reading temporary file: %v", err)
	}
	
	writtenHash := sha256.Sum256(writtenData)
	writtenChecksum := hex.EncodeToString(writtenHash[:])
	
	if checksum != writtenChecksum {
		os.Remove(tempFile)
		return errors.New("checksum verification failed")
	}
	
	// On Windows, we can't replace a running executable, so we need
	// to rename the current executable and then rename the new one
	if runtime.GOOS == "windows" {
		oldPath := execPath + ".old"
		
		// Delete old backup if it exists
		_ = os.Remove(oldPath)
		
		// Rename current executable to .old
		if err := os.Rename(execPath, oldPath); err != nil {
			os.Remove(tempFile)
			return fmt.Errorf("error backing up current executable: %v", err)
		}
		
		// Rename new executable to original name
		if err := os.Rename(tempFile, execPath); err != nil {
			// Try to recover by restoring the old executable
			_ = os.Rename(oldPath, execPath)
			os.Remove(tempFile)
			return fmt.Errorf("error replacing executable: %v", err)
		}
		
		// Success, now we can remove the old executable
		_ = os.Remove(oldPath)
	} else {
		// On Unix-like systems, we can replace the executable directly
		if err := os.Rename(tempFile, execPath); err != nil {
			os.Remove(tempFile)
			return fmt.Errorf("error replacing executable: %v", err)
		}
	}
	
	return nil
} 