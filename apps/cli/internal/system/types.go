// Package system provides system optimization, developer cache cleaning,
// disk analysis, macOS status diagnosis, and deep app uninstallation.
package system

import "time"

// CleanTarget defines a category of cleanable developer or system cache.
type CleanTarget struct {
	Name        string   `json:"name"`
	Category    string   `json:"category"` // "developer", "ai", "browser", "system", "firmware", "logs"
	Paths       []string `json:"paths"`
	Command     string   `json:"command,omitempty"`
	SizeBytes   int64    `json:"size_bytes"`
	ItemCount   int      `json:"item_count"`
	Description string   `json:"description"`
}

// CleanReport summarizes a cleanup or dry-run execution.
type CleanReport struct {
	TotalCleanedBytes int64         `json:"total_cleaned_bytes"`
	TotalItemsRemoved int           `json:"total_items_removed"`
	Targets           []CleanTarget `json:"targets"`
	Duration          time.Duration `json:"duration"`
	DryRun            bool          `json:"dry_run"`
	Timestamp         string        `json:"timestamp"`
}

// DiskItem represents a heavy directory or file found during disk analysis.
type DiskItem struct {
	Path      string `json:"path"`
	SizeBytes int64  `json:"size_bytes"`
	HumanSize string `json:"human_size"`
	IsDir     bool   `json:"is_dir"`
	ItemCount int    `json:"item_count,omitempty"`
	Category  string `json:"category,omitempty"`
}

// StorageInsight provides actionable recommendations for freeing disk space.
type StorageInsight struct {
	Type        string `json:"type"` // "installer", "node_modules", "stale_venv", "large_log"
	Path        string `json:"path"`
	SizeBytes   int64  `json:"size_bytes"`
	HumanSize   string `json:"human_size"`
	Description string `json:"description"`
}

// SystemHealth reports CPU, RAM, thermal, battery, disk, network, and bluetooth status on macOS.
type SystemHealth struct {
	OSVersion      string            `json:"os_version"`
	Arch           string            `json:"arch"`
	ModelName      string            `json:"model_name"`
	CPUUsagePct    float64           `json:"cpu_usage_pct"`
	CPUCores       int               `json:"cpu_cores"`
	TotalRAMBytes  int64             `json:"total_ram_bytes"`
	FreeRAMBytes   int64             `json:"free_ram_bytes"`
	UsedRAMBytes   int64             `json:"used_ram_bytes"`
	RAMUsagePct    float64           `json:"ram_usage_pct"`
	SwapUsedBytes  int64             `json:"swap_used_bytes"`
	DiskTotalGB    float64           `json:"disk_total_gb"`
	DiskFreeGB     float64           `json:"disk_free_gb"`
	DiskUsagePct   float64           `json:"disk_usage_pct"`
	ThermalState   string            `json:"thermal_state"`
	BatteryPct     int               `json:"battery_pct,omitempty"`
	BatteryHealth  string            `json:"battery_health,omitempty"`
	BatteryCycles  int               `json:"battery_cycles,omitempty"`
	NetworkIP      string            `json:"network_ip,omitempty"`
	NetworkSSID    string            `json:"network_ssid,omitempty"`
	ConnectedBT    []string          `json:"connected_bt,omitempty"`
	TopProcesses   []ProcessItem     `json:"top_processes,omitempty"`
	Uptime         string            `json:"uptime"`
}

// ProcessItem describes a resource-intensive running process.
type ProcessItem struct {
	PID     int     `json:"pid"`
	Name    string  `json:"name"`
	CPUPct  float64 `json:"cpu_pct"`
	MemMB   float64 `json:"mem_mb"`
}

// AppLeftover represents files and directories associated with an application.
type AppLeftover struct {
	AppPath    string   `json:"app_path"`
	AppName    string   `json:"app_name"`
	TotalBytes int64    `json:"total_bytes"`
	Leftovers  []string `json:"leftovers"`
}

// CleanupHistoryRecord logs a single historical cleanup run.
type CleanupHistoryRecord struct {
	Timestamp    string `json:"timestamp"`
	CleanedBytes int64  `json:"cleaned_bytes"`
	ItemCount    int    `json:"item_count"`
	TargetCount  int    `json:"target_count"`
	DurationMs   int64  `json:"duration_ms"`
}
