package checker

import (
	"fmt"
	"strings"

	"radas/internal/utils"
)

// CheckDocker checks the Docker installation
func CheckDocker() bool {
	fmt.Print("Checking Docker: ")

	if !utils.CheckIfCommandExists("docker") {
		utils.Failure("✘ Docker not found\n")
		fmt.Println("  Please install Docker from https://docs.docker.com/get-docker/")
		return false
	}

	output, err := utils.ExecuteCommand("docker", "--version")
	if err != nil {
		utils.Failure("✘ Failed to get Docker version\n")
		return false
	}

	version := strings.TrimSpace(output)
	utils.Success("✓ Installed (%s)\n", version)
	return true
}

// CheckKubectl checks the kubectl installation
func CheckKubectl() bool {
	fmt.Print("Checking kubectl: ")

	if !utils.CheckIfCommandExists("kubectl") {
		utils.Failure("✘ kubectl not found\n")
		fmt.Println("  Please install kubectl from https://kubernetes.io/docs/tasks/tools/")
		return false
	}

	output, err := utils.ExecuteCommand("kubectl", "version", "--client")
	if err != nil {
		// Some versions might still return partial version with error
		if output != "" {
			utils.Success("✓ Installed (partial version: %s)\n", strings.Split(output, "\n")[0])
			return true
		}
		
		utils.Failure("✘ Failed to get kubectl version\n")
		return false
	}

	version := strings.Split(output, "\n")[0]
	utils.Success("✓ Installed (%s)\n", version)
	return true
}

// CheckTerraform checks the Terraform installation
func CheckTerraform() bool {
	fmt.Print("Checking Terraform: ")

	if !utils.CheckIfCommandExists("terraform") {
		utils.Failure("✘ Terraform not found\n")
		fmt.Println("  Please install Terraform from https://www.terraform.io/downloads")
		return false
	}

	output, err := utils.ExecuteCommand("terraform", "version")
	if err != nil {
		utils.Failure("✘ Failed to get Terraform version\n")
		return false
	}

	version := strings.Split(output, "\n")[0]
	utils.Success("✓ Installed (%s)\n", version)
	return true
}

// CheckAnsible checks the Ansible installation
func CheckAnsible() bool {
	fmt.Print("Checking Ansible: ")

	if !utils.CheckIfCommandExists("ansible") {
		utils.Failure("✘ Ansible not found\n")
		fmt.Println("  Please install Ansible from https://docs.ansible.com/ansible/latest/installation_guide/")
		return false
	}

	output, err := utils.ExecuteCommand("ansible", "--version")
	if err != nil {
		utils.Failure("✘ Failed to get Ansible version\n")
		return false
	}

	versionLine := strings.Split(output, "\n")[0]
	utils.Success("✓ Installed (%s)\n", versionLine)
	return true
}

// CheckHelm checks the Helm installation
func CheckHelm() bool {
	fmt.Print("Checking Helm: ")

	if !utils.CheckIfCommandExists("helm") {
		utils.Failure("✘ Helm not found\n")
		fmt.Println("  Please install Helm from https://helm.sh/docs/intro/install/")
		return false
	}

	output, err := utils.ExecuteCommand("helm", "version")
	if err != nil {
		utils.Failure("✘ Failed to get Helm version\n")
		return false
	}

	version := strings.TrimSpace(output)
	utils.Success("✓ Installed (%s)\n", version)
	return true
}