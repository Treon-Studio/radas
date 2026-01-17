package infra

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strings"

	"github.com/AlecAivazis/survey/v2"
	"github.com/spf13/cobra"
)

var (
	cleanImages     bool
	cleanContainers bool
	cleanVolumes    bool
	cleanNetworks   bool
	cleanAll        bool
	cleanDangling   bool
	forceClean      bool
)

// DockerCleanCmd scans and cleans Docker resources
var DockerCleanCmd = &cobra.Command{
	Use:   "clean",
	Short: "Scan and clean Docker resources (images, containers, volumes, networks)",
	Long: `Scan Docker resources and interactively select which ones to remove.

By default, scans all resource types. Use flags to filter specific types.

Examples:
  radas infra docker clean                  # Scan all resources interactively
  radas infra docker clean --images         # Scan only images
  radas infra docker clean --containers     # Scan only containers
  radas infra docker clean --dangling       # Show only dangling/unused resources
  radas infra docker clean --all --force    # Remove all unused resources (prune)`,
	Run: runDockerClean,
}

func init() {
	DockerCleanCmd.Flags().BoolVarP(&cleanImages, "images", "i", false, "Scan Docker images only")
	DockerCleanCmd.Flags().BoolVarP(&cleanContainers, "containers", "c", false, "Scan Docker containers only")
	DockerCleanCmd.Flags().BoolVarP(&cleanVolumes, "volumes", "v", false, "Scan Docker volumes only")
	DockerCleanCmd.Flags().BoolVarP(&cleanNetworks, "networks", "n", false, "Scan Docker networks only")
	DockerCleanCmd.Flags().BoolVarP(&cleanAll, "all", "a", false, "Clean all unused resources (docker system prune)")
	DockerCleanCmd.Flags().BoolVar(&cleanDangling, "dangling", false, "Show only dangling/unused resources")
	DockerCleanCmd.Flags().BoolVarP(&forceClean, "force", "f", false, "Skip confirmation prompts")
}

// DockerImage represents a Docker image
type DockerImage struct {
	ID         string `json:"Id"`
	Repository string `json:"Repository"`
	Tag        string `json:"Tag"`
	Size       int64  `json:"Size"`
	Created    int64  `json:"Created"`
	CreatedAt  string `json:"CreatedAt"`
}

// DockerContainer represents a Docker container
type DockerContainer struct {
	ID      string `json:"ID"`
	Names   string `json:"Names"`
	Image   string `json:"Image"`
	Status  string `json:"Status"`
	State   string `json:"State"`
	Size    string `json:"Size"`
	Created int64  `json:"Created"`
}

// DockerVolume represents a Docker volume
type DockerVolume struct {
	Name       string `json:"Name"`
	Driver     string `json:"Driver"`
	Mountpoint string `json:"Mountpoint"`
	Size       string `json:"Size"`
}

// DockerNetwork represents a Docker network
type DockerNetwork struct {
	ID     string `json:"ID"`
	Name   string `json:"Name"`
	Driver string `json:"Driver"`
	Scope  string `json:"Scope"`
}

func runDockerClean(cmd *cobra.Command, args []string) {
	// Check if Docker is available
	if !isDockerAvailable() {
		fmt.Println("Error: Docker is not installed or not running")
		fmt.Println("Please install Docker from https://docs.docker.com/get-docker/")
		return
	}

	// If --all flag, run docker system prune
	if cleanAll {
		runDockerPrune()
		return
	}

	// Determine which resources to scan
	scanAll := !cleanImages && !cleanContainers && !cleanVolumes && !cleanNetworks

	fmt.Println()
	fmt.Println("  🐳 Docker Resource Scanner")
	fmt.Println("  ==========================")
	fmt.Println()

	var totalSize int64

	// Scan Images
	if scanAll || cleanImages {
		images := scanDockerImages()
		if len(images) > 0 {
			totalSize += displayAndCleanImages(images)
		}
	}

	// Scan Containers
	if scanAll || cleanContainers {
		containers := scanDockerContainers()
		if len(containers) > 0 {
			displayAndCleanContainers(containers)
		}
	}

	// Scan Volumes
	if scanAll || cleanVolumes {
		volumes := scanDockerVolumes()
		if len(volumes) > 0 {
			displayAndCleanVolumes(volumes)
		}
	}

	// Scan Networks
	if scanAll || cleanNetworks {
		networks := scanDockerNetworks()
		if len(networks) > 0 {
			displayAndCleanNetworks(networks)
		}
	}

	if totalSize > 0 {
		fmt.Printf("\n  Total reclaimable space from images: %s\n", formatDockerBytes(totalSize))
	}
}

func isDockerAvailable() bool {
	cmd := exec.Command("docker", "version")
	return cmd.Run() == nil
}

func runDockerPrune() {
	fmt.Println()
	fmt.Println("  🐳 Docker System Prune")
	fmt.Println("  ======================")
	fmt.Println()

	// Show what will be removed
	fmt.Println("  This will remove:")
	fmt.Println("    - All stopped containers")
	fmt.Println("    - All networks not used by at least one container")
	fmt.Println("    - All dangling images")
	fmt.Println("    - All build cache")
	fmt.Println()

	if !forceClean {
		var confirm bool
		prompt := &survey.Confirm{
			Message: "Are you sure you want to continue?",
			Default: false,
		}
		if err := survey.AskOne(prompt, &confirm); err != nil || !confirm {
			fmt.Println("  Aborted.")
			return
		}
	}

	fmt.Println()
	fmt.Println("  Running docker system prune...")

	cmd := exec.Command("docker", "system", "prune", "-f")
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("  Error: %v\n", err)
		return
	}

	fmt.Println(string(output))
	fmt.Println("  ✓ Docker cleanup completed!")
}

func scanDockerImages() []DockerImage {
	args := []string{"images", "--format", "{{json .}}"}
	if cleanDangling {
		args = append(args, "--filter", "dangling=true")
	}

	cmd := exec.Command("docker", args...)
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	var images []DockerImage
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		var img DockerImage
		if err := json.Unmarshal([]byte(line), &img); err == nil {
			images = append(images, img)
		}
	}

	// Sort by size descending
	sort.Slice(images, func(i, j int) bool {
		return images[i].Size > images[j].Size
	})

	return images
}

func displayAndCleanImages(images []DockerImage) int64 {
	fmt.Println("  📦 Docker Images")
	fmt.Println("  ----------------")

	var totalSize int64
	for _, img := range images {
		name := img.Repository
		if img.Tag != "" && img.Tag != "<none>" {
			name += ":" + img.Tag
		}
		if name == ":<none>" || name == "<none>:<none>" {
			name = "<none> (dangling)"
		}

		size := img.Size
		totalSize += size

		fmt.Printf("  %s\n", img.ID[:12])
		fmt.Printf("    Name: %s\n", name)
		fmt.Printf("    Size: %s\n", formatDockerBytes(size))
		fmt.Printf("    Created: %s\n", img.CreatedAt)
		fmt.Println()
	}

	fmt.Printf("  Total: %d images, %s\n\n", len(images), formatDockerBytes(totalSize))

	if !forceClean {
		var wantDelete bool
		prompt := &survey.Confirm{
			Message: "Do you want to remove any images?",
			Default: false,
		}
		if err := survey.AskOne(prompt, &wantDelete); err != nil || !wantDelete {
			return totalSize
		}

		options := make([]string, len(images))
		for i, img := range images {
			name := img.Repository
			if img.Tag != "" && img.Tag != "<none>" {
				name += ":" + img.Tag
			}
			if name == ":<none>" || name == "<none>:<none>" {
				name = "<dangling>"
			}
			options[i] = fmt.Sprintf("%s - %s (%s)", img.ID[:12], name, formatDockerBytes(img.Size))
		}

		var selected []string
		selectPrompt := &survey.MultiSelect{
			Message: "Select images to remove:",
			Options: options,
		}
		if err := survey.AskOne(selectPrompt, &selected); err != nil || len(selected) == 0 {
			return totalSize
		}

		for _, sel := range selected {
			id := strings.Split(sel, " - ")[0]
			fmt.Printf("  Removing image %s... ", id)
			cmd := exec.Command("docker", "rmi", "-f", id)
			if err := cmd.Run(); err != nil {
				fmt.Printf("ERROR: %v\n", err)
			} else {
				fmt.Println("OK")
			}
		}
	}

	return totalSize
}

func scanDockerContainers() []DockerContainer {
	args := []string{"ps", "-a", "--format", "{{json .}}"}
	if cleanDangling {
		args = []string{"ps", "-a", "--filter", "status=exited", "--format", "{{json .}}"}
	}

	cmd := exec.Command("docker", args...)
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	var containers []DockerContainer
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		var c DockerContainer
		if err := json.Unmarshal([]byte(line), &c); err == nil {
			containers = append(containers, c)
		}
	}

	return containers
}

func displayAndCleanContainers(containers []DockerContainer) {
	fmt.Println("  📦 Docker Containers")
	fmt.Println("  --------------------")

	running := 0
	stopped := 0
	for _, c := range containers {
		status := "🔴 stopped"
		if c.State == "running" {
			status = "🟢 running"
			running++
		} else {
			stopped++
		}

		fmt.Printf("  %s\n", c.ID[:12])
		fmt.Printf("    Name: %s\n", c.Names)
		fmt.Printf("    Image: %s\n", c.Image)
		fmt.Printf("    Status: %s (%s)\n", status, c.Status)
		fmt.Println()
	}

	fmt.Printf("  Total: %d containers (%d running, %d stopped)\n\n", len(containers), running, stopped)

	stoppedContainers := make([]DockerContainer, 0)
	for _, c := range containers {
		if c.State != "running" {
			stoppedContainers = append(stoppedContainers, c)
		}
	}

	if len(stoppedContainers) == 0 {
		return
	}

	if !forceClean {
		var wantDelete bool
		prompt := &survey.Confirm{
			Message: fmt.Sprintf("Do you want to remove any stopped containers? (%d available)", len(stoppedContainers)),
			Default: false,
		}
		if err := survey.AskOne(prompt, &wantDelete); err != nil || !wantDelete {
			return
		}

		options := make([]string, len(stoppedContainers))
		for i, c := range stoppedContainers {
			options[i] = fmt.Sprintf("%s - %s (%s)", c.ID[:12], c.Names, c.Image)
		}

		var selected []string
		selectPrompt := &survey.MultiSelect{
			Message: "Select containers to remove:",
			Options: options,
		}
		if err := survey.AskOne(selectPrompt, &selected); err != nil || len(selected) == 0 {
			return
		}

		for _, sel := range selected {
			id := strings.Split(sel, " - ")[0]
			fmt.Printf("  Removing container %s... ", id)
			cmd := exec.Command("docker", "rm", "-f", id)
			if err := cmd.Run(); err != nil {
				fmt.Printf("ERROR: %v\n", err)
			} else {
				fmt.Println("OK")
			}
		}
	}
}

func scanDockerVolumes() []DockerVolume {
	cmd := exec.Command("docker", "volume", "ls", "--format", "{{json .}}")
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	var volumes []DockerVolume
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		var v DockerVolume
		if err := json.Unmarshal([]byte(line), &v); err == nil {
			volumes = append(volumes, v)
		}
	}

	return volumes
}

func displayAndCleanVolumes(volumes []DockerVolume) {
	fmt.Println("  💾 Docker Volumes")
	fmt.Println("  -----------------")

	for _, v := range volumes {
		fmt.Printf("  %s\n", v.Name)
		fmt.Printf("    Driver: %s\n", v.Driver)
		fmt.Println()
	}

	fmt.Printf("  Total: %d volumes\n\n", len(volumes))

	cmd := exec.Command("docker", "volume", "ls", "-q", "--filter", "dangling=true")
	output, _ := cmd.Output()
	danglingVolumes := strings.Split(strings.TrimSpace(string(output)), "\n")
	danglingCount := 0
	for _, v := range danglingVolumes {
		if v != "" {
			danglingCount++
		}
	}

	if danglingCount == 0 {
		return
	}

	if !forceClean {
		var wantDelete bool
		prompt := &survey.Confirm{
			Message: fmt.Sprintf("Do you want to remove dangling volumes? (%d available)", danglingCount),
			Default: false,
		}
		if err := survey.AskOne(prompt, &wantDelete); err != nil || !wantDelete {
			return
		}

		fmt.Println("  Removing dangling volumes...")
		cmd := exec.Command("docker", "volume", "prune", "-f")
		if output, err := cmd.CombinedOutput(); err != nil {
			fmt.Printf("  ERROR: %v\n", err)
		} else {
			fmt.Println(string(output))
			fmt.Println("  ✓ Dangling volumes removed!")
		}
	}
}

func scanDockerNetworks() []DockerNetwork {
	cmd := exec.Command("docker", "network", "ls", "--format", "{{json .}}")
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	var networks []DockerNetwork
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		var n DockerNetwork
		if err := json.Unmarshal([]byte(line), &n); err == nil {
			if n.Name != "bridge" && n.Name != "host" && n.Name != "none" {
				networks = append(networks, n)
			}
		}
	}

	return networks
}

func displayAndCleanNetworks(networks []DockerNetwork) {
	if len(networks) == 0 {
		fmt.Println("  🌐 Docker Networks")
		fmt.Println("  ------------------")
		fmt.Println("  No custom networks found (only default bridge, host, none)")
		fmt.Println()
		return
	}

	fmt.Println("  🌐 Docker Networks")
	fmt.Println("  ------------------")

	for _, n := range networks {
		fmt.Printf("  %s\n", n.ID[:12])
		fmt.Printf("    Name: %s\n", n.Name)
		fmt.Printf("    Driver: %s\n", n.Driver)
		fmt.Printf("    Scope: %s\n", n.Scope)
		fmt.Println()
	}

	fmt.Printf("  Total: %d custom networks\n\n", len(networks))

	if !forceClean {
		var wantDelete bool
		prompt := &survey.Confirm{
			Message: "Do you want to remove any networks?",
			Default: false,
		}
		if err := survey.AskOne(prompt, &wantDelete); err != nil || !wantDelete {
			return
		}

		options := make([]string, len(networks))
		for i, n := range networks {
			options[i] = fmt.Sprintf("%s - %s (%s)", n.ID[:12], n.Name, n.Driver)
		}

		var selected []string
		selectPrompt := &survey.MultiSelect{
			Message: "Select networks to remove:",
			Options: options,
		}
		if err := survey.AskOne(selectPrompt, &selected); err != nil || len(selected) == 0 {
			return
		}

		for _, sel := range selected {
			id := strings.Split(sel, " - ")[0]
			fmt.Printf("  Removing network %s... ", id)
			cmd := exec.Command("docker", "network", "rm", id)
			if err := cmd.Run(); err != nil {
				fmt.Printf("ERROR: %v\n", err)
			} else {
				fmt.Println("OK")
			}
		}
	}
}

func formatDockerBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
