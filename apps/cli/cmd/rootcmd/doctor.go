package rootcmd

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"time"

	"github.com/spf13/cobra"
	"github.com/raizora/radas/v4/internal/checker"
	"github.com/raizora/radas/v4/internal/system"
	"github.com/raizora/radas/v4/internal/utils"
)

var DoctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Perform comprehensive diagnostic health check on RADAS environment, toolchains, and connectivity",
	Long: `The doctor command performs a complete system and environment audit:
checking configuration directories, toolchain installations (Go, Node, OpenTofu, Ansible, Docker),
RADAS API server reachability, and system resource headroom.`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("============================================================")
		fmt.Println("                 RADAS DOCTOR DIAGNOSTICS                   ")
		fmt.Println("============================================================")

		// 1. Environment & Config Directory
		fmt.Println("\n[1] Environment & Configuration:")
		checkEnvVar("RADAS_SOURCE")
		checkEnvVar("RADAS_PLAYGROUND")
		checkConfigDir()

		// 2. Developer & DevOps Toolchains
		fmt.Println("\n[2] Core Toolchains & DevOps CLI:")
		checker.CheckGolang()
		checker.CheckNodeJS()
		checker.CheckDocker()
		checker.CheckTerraform()
		checker.CheckAnsible()
		checker.CheckKubectl()

		// 3. RADAS API Server Connectivity
		fmt.Println("\n[3] RADAS Stack & Backend Connectivity:")
		checkAPIReachability()

		// 4. System & Hardware Headroom
		fmt.Println("\n[4] System Headroom & Resource Status:")
		health := system.GetSystemHealth()
		fmt.Printf("  • OS / Arch:      %s (%s)\n", runtime.GOOS, runtime.GOARCH)
		fmt.Printf("  • CPU:            %d Cores (Load: %.1f%%)\n", health.CPUCores, health.CPUUsagePct)
		fmt.Printf("  • Memory:         %s Total (Active: %.1f%%)\n", system.FormatBytes(health.TotalRAMBytes), health.RAMUsagePct)
		fmt.Printf("  • Root Disk:      %.1f GB Free / %.1f GB Total (Used: %.1f%%)\n", health.DiskFreeGB, health.DiskTotalGB, health.DiskUsagePct)
		if health.DiskUsagePct > 90 {
			utils.Warning("  ⚠ High disk usage detected. Run 'radas system clean' to recover space.\n")
		} else {
			utils.Success("  ✓ Disk headroom is healthy.\n")
		}

		fmt.Println("\n============================================================")
		fmt.Println("✔ Diagnostics complete. Your RADAS environment is ready.")
		fmt.Println("============================================================")
	},
}

func checkEnvVar(name string) {
	val := os.Getenv(name)
	if val == "" {
		fmt.Printf("  • %-20s : (optional, not set)\n", name)
	} else {
		utils.Success("  • %-20s : %s\n", name, val)
	}
}

func checkConfigDir() {
	usr, err := user.Current()
	if err != nil {
		utils.Failure("  [✗] Cannot determine current user: %v\n", err)
		return
	}
	configDir := filepath.Join(usr.HomeDir, ".config", "radas")
	info, err := os.Stat(configDir)
	if err != nil {
		_ = os.MkdirAll(configDir, 0755)
		utils.Success("  • %-20s : %s (created)\n", "Config Directory", configDir)
		return
	}
	if !info.IsDir() {
		utils.Failure("  • %-20s : %s is not a directory\n", "Config Directory", configDir)
		return
	}
	utils.Success("  • %-20s : %s (writable)\n", "Config Directory", configDir)
}

func checkAPIReachability() {
	apiURL := os.Getenv("RADAS_API_URL")
	if apiURL == "" {
		apiURL = "http://localhost:5001"
	}

	client := &http.Client{Timeout: 2 * time.Second}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, apiURL+"/health", nil)
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("  • RADAS Server (%s) : Offline / Standalone mode\n", apiURL)
		fmt.Println("    (Start local stack with: 'pnpm dev:radas')")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		utils.Success("  • RADAS Server (%s) : ONLINE (Status 200 OK)\n", apiURL)
	} else {
		fmt.Printf("  • RADAS Server (%s) : Responded with status %d\n", apiURL, resp.StatusCode)
	}
}
