package utils

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDirExists(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "test-dir")
	defer os.RemoveAll(tmpDir)
	
	if !DirExists(tmpDir) {
		t.Errorf("DirExists returned false for existing directory")
	}
	
	tmpFile, _ := os.CreateTemp("", "test-file")
	defer os.Remove(tmpFile.Name())
	if DirExists(tmpFile.Name()) {
		t.Errorf("DirExists returned true for a file")
	}
	
	if DirExists("non-existent-dir-123") {
		t.Errorf("DirExists returned true for non-existent directory")
	}
}

func TestReadPackageJSON(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "test-pkg")
	defer os.RemoveAll(tmpDir)
	
	pkgPath := filepath.Join(tmpDir, "package.json")
	content := `{
		"name": "test-app",
		"version": "1.0.0",
		"scripts": {"start": "node index.js"}
	}`
	os.WriteFile(pkgPath, []byte(content), 0644)
	
	pkg, err := ReadPackageJSON(pkgPath)
	if err != nil {
		t.Fatalf("ReadPackageJSON failed: %v", err)
	}
	if pkg.Name != "test-app" {
		t.Errorf("Expected name test-app, got %s", pkg.Name)
	}
	
	// Test error cases
	_, err = ReadPackageJSON("non-existent.json")
	if err == nil {
		t.Error("Expected error for non-existent package.json")
	}
	
	os.WriteFile(pkgPath, []byte("invalid json"), 0644)
	_, err = ReadPackageJSON(pkgPath)
	if err == nil {
		t.Error("Expected error for invalid JSON")
	}
}

func TestGetAppsList(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "test-apps")
	defer os.RemoveAll(tmpDir)
	
	t.Run("Monorepo", func(t *testing.T) {
		appsDir := filepath.Join(tmpDir, "apps")
		os.MkdirAll(filepath.Join(appsDir, "app1"), 0755)
		os.MkdirAll(filepath.Join(appsDir, "app2"), 0755)
		os.MkdirAll(filepath.Join(appsDir, "app3"), 0755)
		
		os.WriteFile(filepath.Join(appsDir, "app1", "package.json"), []byte(`{"name": "app-one"}`), 0644)
		os.WriteFile(filepath.Join(appsDir, "app2", "package.json"), []byte(`{"version": "1.0.0"}`), 0644) // no name
		os.WriteFile(filepath.Join(appsDir, "app3", "package.json"), []byte(`invalid json`), 0644) // invalid json
		
		apps, err := GetAppsList(tmpDir)
		if err != nil {
			t.Fatalf("GetAppsList failed: %v", err)
		}
		
		if apps["app-one"] == "" {
			t.Errorf("Expected app-one to be found")
		}
		if apps["app2"] == "" {
			t.Errorf("Expected app2 (dir name) to be found as fallback")
		}
		if apps["app3"] == "" {
			t.Errorf("Expected app3 to be found even with invalid package.json")
		}
	})

	t.Run("SingleApp", func(t *testing.T) {
		singleDir, _ := os.MkdirTemp("", "single-app")
		defer os.RemoveAll(singleDir)
		os.WriteFile(filepath.Join(singleDir, "package.json"), []byte(`{"name": "single"}`), 0644)
		
		apps, err := GetAppsList(singleDir)
		if err != nil {
			t.Fatalf("GetAppsList failed: %v", err)
		}
		if len(apps) != 1 {
			t.Errorf("Expected 1 app, got %d", len(apps))
		}
	})
}
