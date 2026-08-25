package system

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// HistoryLedger maintains a history of past cleanup runs.
type HistoryLedger struct {
	TotalAllTimeCleanedBytes int64                  `json:"total_all_time_cleaned_bytes"`
	TotalRuns                int                    `json:"total_runs"`
	Records                  []CleanupHistoryRecord `json:"records"`
}

func getHistoryPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".config/radas")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "cleanup_history.json"), nil
}

// LoadHistory reads the cleanup ledger from disk.
func LoadHistory() HistoryLedger {
	ledger := HistoryLedger{}
	path, err := getHistoryPath()
	if err != nil {
		return ledger
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return ledger
	}

	_ = json.Unmarshal(data, &ledger)
	return ledger
}

// RecordCleanupAppended saves a new cleanup execution to the ledger.
func RecordCleanupAppended(report CleanReport) error {
	if report.DryRun || report.TotalCleanedBytes == 0 {
		return nil
	}

	ledger := LoadHistory()
	rec := CleanupHistoryRecord{
		Timestamp:    report.Timestamp,
		CleanedBytes: report.TotalCleanedBytes,
		ItemCount:    report.TotalItemsRemoved,
		TargetCount:  len(report.Targets),
		DurationMs:   report.Duration.Milliseconds(),
	}

	ledger.Records = append(ledger.Records, rec)
	ledger.TotalAllTimeCleanedBytes += report.TotalCleanedBytes
	ledger.TotalRuns++

	path, err := getHistoryPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(ledger, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}
