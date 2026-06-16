package utils

import "testing"

func TestPrintTable(t *testing.T) {
	header := []string{"Name", "Value"}
	rows := [][]string{
		{"KEY1", "VAL1"},
		{"LONGER_KEY", "SHORT"},
	}
	// Just verify it doesn't crash
	PrintTable(header, rows)
}
