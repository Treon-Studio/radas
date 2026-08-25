package system

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSystemCleanerAndAnalyzer(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "radas_system_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create dummy test cache file
	cacheDir := filepath.Join(tempDir, "Library/Developer/Xcode/DerivedData")
	_ = os.MkdirAll(cacheDir, 0755)
	testFile := filepath.Join(cacheDir, "build.log")
	_ = os.WriteFile(testFile, []byte("large dummy build log content"), 0644)

	// Test FormatBytes
	if FormatBytes(1024*1024) != "1.00 MB" {
		t.Errorf("unexpected FormatBytes result: %s", FormatBytes(1024*1024))
	}

	// Test GetCleanTargets
	targets := GetCleanTargets(tempDir)
	if len(targets) == 0 {
		t.Fatalf("expected clean targets, got 0")
	}

	// Test RunCleanup (Dry Run)
	report := RunCleanup(targets, true)
	if report.TotalCleanedBytes == 0 {
		t.Errorf("expected clean bytes > 0 in test directory, got 0")
	}

	// Test CleanDSStore
	dsFile := filepath.Join(tempDir, ".DS_Store")
	_ = os.WriteFile(dsFile, []byte("ds_store"), 0644)
	sz, cnt, err := CleanDSStore(tempDir, false)
	if err != nil || cnt != 1 || sz == 0 {
		t.Errorf("failed CleanDSStore: %v, count: %d", err, cnt)
	}

	// Test AnalyzeDisk
	items, err := AnalyzeDisk(tempDir, 1, 2)
	if err != nil || len(items) == 0 {
		t.Errorf("AnalyzeDisk failed or returned 0 items: %v", err)
	}

	// Test SystemHealth
	health := GetSystemHealth()
	if health.CPUCores <= 0 {
		t.Errorf("invalid CPU cores: %d", health.CPUCores)
	}

	// Test Optimization
	opt := RunOptimization()
	if len(opt.Messages) == 0 {
		t.Errorf("expected optimization messages")
	}

	// Test FindAppLeftovers & DeepUninstall
	appDir := filepath.Join(tempDir, "Library/Application Support/TestApp")
	_ = os.MkdirAll(appDir, 0755)
	_ = os.WriteFile(filepath.Join(appDir, "config.json"), []byte("{}"), 0644)

	leftovers := FindAppLeftovers("TestApp", tempDir)
	if len(leftovers.Leftovers) == 0 {
		t.Errorf("expected to find TestApp leftovers")
	}

	cleanedBytes, cleanedCount, err := DeepUninstall(leftovers, true)
	if err != nil || cleanedCount == 0 || cleanedBytes == 0 {
		t.Errorf("DeepUninstall dry-run failed: %v", err)
	}
}
