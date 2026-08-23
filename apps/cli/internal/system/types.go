// Package system provides system optimization, developer cache cleaning,
// disk analysis, macOS status diagnosis, and deep app uninstallation.
package system

import "time"

// CleanTarget defines a category of cleanable developer or system cache.
type CleanTarget struct {
	Name        string
	Category    string // "developer", "browser", "system", "logs"
	Paths       []string
	Command     string // Optional shell command (e.g., "brew cleanup -s", "go clean -cache")
	SizeBytes   int64
	ItemCount   int
	Description string
}

// CleanReport summarizes a cleanup or dry-run execution.
type CleanReport struct {
	TotalCleanedBytes int64
	TotalItemsRemoved int
	Targets           []CleanTarget
	Duration          time.Duration
	DryRun            bool
}

// DiskItem represents a heavy directory or file found during disk analysis.
type DiskItem struct {
	Path      string `json:"path"`
	SizeBytes int64  `json:"size_bytes"`
	HumanSize string `json:"human_size"`
	IsDir     bool   `json:"is_dir"`
	ItemCount int    `json:"item_count,omitempty"`
}

// SystemHealth reports CPU, RAM, thermal, battery, and disk status on macOS.
type SystemHealth struct {
	OSVersion     string  `json:"os_version"`
	Arch          string  `json:"arch"`
	CPUUsagePct   float64 `json:"cpu_usage_pct"`
	CPUCores      int     `json:"cpu_cores"`
	TotalRAMBytes int64   `json:"total_ram_bytes"`
	FreeRAMBytes  int64   `json:"free_ram_bytes"`
	RAMUsagePct   float64 `json:"ram_usage_pct"`
	DiskTotalGB   float64 `json:"disk_total_gb"`
	DiskFreeGB    float64 `json:"disk_free_gb"`
	DiskUsagePct  float64 `json:"disk_usage_pct"`
	ThermalState  string  `json:"thermal_state"`
	BatteryPct    int     `json:"battery_pct,omitempty"`
	BatteryHealth string  `json:"battery_health,omitempty"`
	Uptime        string  `json:"uptime"`
}

// AppLeftover represents files and directories associated with an application.
type AppLeftover struct {
	AppPath    string   `json:"app_path"`
	AppName    string   `json:"app_name"`
	TotalBytes int64    `json:"total_bytes"`
	Leftovers  []string `json:"leftovers"`
}
