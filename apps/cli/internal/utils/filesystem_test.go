package utils

import (
	"os"
	"testing"
)

func TestFileExists(t *testing.T) {
	tmpFile, _ := os.CreateTemp("", "test-file")
	defer os.Remove(tmpFile.Name())
	
	if !FileExists(tmpFile.Name()) {
		t.Errorf("FileExists returned false for existing file")
	}
	
	if FileExists("non-existent-file-123") {
		t.Errorf("FileExists returned true for non-existent file")
	}
}
