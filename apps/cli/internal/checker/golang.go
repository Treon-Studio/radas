package checker

import (
	"fmt"
	"strings"

	"radas/internal/utils"
)

// CheckGolang checks the Go installation
func CheckGolang() bool {
	fmt.Print("Checking Go: ")

	if !utils.CheckIfCommandExists("go") {
		utils.Failure("✘ Go not found\n")
		fmt.Println("  Please install Go from https://golang.org/dl/")
		return false
	}

	output, err := utils.ExecuteCommand("go", "version")
	if err != nil {
		utils.Failure("✘ Failed to get Go version\n")
		return false
	}

	version := strings.TrimSpace(output)
	utils.Success("✓ Installed (%s)\n", version)
	return true
}

// CheckElixir checks the Elixir installation
func CheckElixir() bool {
	fmt.Print("Checking Elixir: ")

	if !utils.CheckIfCommandExists("elixir") {
		utils.Failure("✘ Elixir not found\n")
		fmt.Println("  Please install Elixir from https://elixir-lang.org/install.html")
		return false
	}

	output, err := utils.ExecuteCommand("elixir", "--version")
	if err != nil {
		utils.Failure("✘ Failed to get Elixir version\n")
		return false
	}

	versionLine := strings.Split(output, "\n")[0]
	utils.Success("✓ Installed (%s)\n", versionLine)
	return true
}

// CheckRust checks the Rust installation
func CheckRust() bool {
	fmt.Print("Checking Rust: ")

	if !utils.CheckIfCommandExists("rustc") {
		utils.Failure("✘ Rust not found\n")
		fmt.Println("  Please install Rust from https://www.rust-lang.org/tools/install")
		return false
	}

	output, err := utils.ExecuteCommand("rustc", "--version")
	if err != nil {
		utils.Failure("✘ Failed to get Rust version\n")
		return false
	}

	version := strings.TrimSpace(output)
	utils.Success("✓ Installed (%s)\n", version)
	return true
}

// CheckMaven checks the Maven installation
func CheckMaven() bool {
	fmt.Print("Checking Maven: ")

	if !utils.CheckIfCommandExists("mvn") {
		utils.Failure("✘ Maven not found\n")
		fmt.Println("  Please install Maven from https://maven.apache.org/download.cgi")
		return false
	}

	output, err := utils.ExecuteCommand("mvn", "--version")
	if err != nil {
		utils.Failure("✘ Failed to get Maven version\n")
		return false
	}

	versionLine := strings.Split(output, "\n")[0]
	utils.Success("✓ Installed (%s)\n", versionLine)
	return true
}