package rootcmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/AlecAivazis/survey/v2"
	"gopkg.in/yaml.v3"
	"radas/constants"
)

var ConfigCmd = &cobra.Command{
	Use:   "config",
	Short: "Config file utilities (read/set radas.yml)",
}

var ConfigReadCmd = &cobra.Command{
	Use:   "read",
	Short: "Read radas.yml config",
	Run: func(cmd *cobra.Command, args []string) {
		var out map[string]interface{} // generic map to hold YAML
		if err := loadRadasConfig(&out); err != nil {
			fmt.Println(err)
			os.Exit(1)
		}
		configPath := findRadasConfig()
		fmt.Printf("Found config: %s\n", configPath)

		// Pretty print YAML
		yamlPretty, err := yaml.Marshal(out)
		if err != nil {
			fmt.Println("Error pretty-printing YAML:", err)
			os.Exit(1)
		}
		fmt.Println(string(yamlPretty))

		// Simple structure validation
		missing := []string{}
		if _, ok := out["metadata"]; !ok {
			missing = append(missing, "metadata")
		}
		if _, ok := out["sync"]; !ok {
			missing = append(missing, "sync")
		}
		if len(missing) > 0 {
			fmt.Printf("[Warning] Missing sections: %v\n", missing)
		} else {
			fmt.Println("Config structure: OK")
		}
	},
}

// loadRadasConfig reads and parses radas.yml into the provided struct pointer
func loadRadasConfig(out interface{}) error {
	configPath := findRadasConfig()
	if configPath == "" {
		return fmt.Errorf("radas.yml not found in current directory or any parent (up to 10 levels)")
	}
	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("could not read %s: %w", configPath, err)
	}
	if err := yaml.Unmarshal(data, out); err != nil {
		return fmt.Errorf("could not parse %s: %w", configPath, err)
	}
	return nil
}

var ConfigSetCmd = &cobra.Command{
	Use:   "set",
	Short: "Set value in radas.yml (not implemented)",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Config set is not implemented yet.")
	},
}

var ConfigInitCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize a radas.yml config file in the current directory",
	Run: func(cmd *cobra.Command, args []string) {
		filename := constants.ConfigFileName
		if _, err := os.Stat(filename); err == nil {
			fmt.Printf("%s already exists. Initialization aborted.\n", filename)
			os.Exit(1)
		}

		projectTypes := constants.ProjectTypes
		var selectedType string
		ptPrompt := &survey.Select{
			Message: "Select project type:",
			Options: projectTypes,
		}
		err := survey.AskOne(ptPrompt, &selectedType)
		if err != nil {
			fmt.Println("Prompt cancelled.")
			os.Exit(1)
		}

		// Get default name from current folder
		cwd, err := os.Getwd()
		if err != nil {
			fmt.Println("Failed to get current directory.")
			os.Exit(1)
		}
		defaultName := filepath.Base(cwd)
		var name string
		namePrompt := &survey.Input{
			Message: "Project name:",
			Default: defaultName,
		}
		err = survey.AskOne(namePrompt, &name)
		if err != nil {
			fmt.Println("Prompt cancelled.")
			os.Exit(1)
		}

		var description string
		descPrompt := &survey.Input{
			Message: "Project description (optional):",
		}
		_ = survey.AskOne(descPrompt, &description) // Allow empty, no exit on error

		template := `# Last updated: 2025-05-02
# Version: 1.0.0

---
# Repository metadata
metadata:
  name: "%s"
  description: "%s"
  version: "0.1.2y"
  maintained_by: "Engineering Team"
  documentation: "https://tech.raizora.com"

# Repository type
type: %s
`
		content := fmt.Sprintf(template, name, description, selectedType)
		err = os.WriteFile(filename, []byte(content), 0644)
		if err != nil {
			fmt.Printf("Failed to write %s: %v\n", filename, err)
			os.Exit(1)
		}
		fmt.Printf("%s created successfully!\n", filename)
	},
}

func init() {
	ConfigCmd.AddCommand(ConfigReadCmd)
	ConfigCmd.AddCommand(ConfigSetCmd)
	ConfigCmd.AddCommand(ConfigInitCmd)
}





func findRadasConfig() string {
	maxDepth := 10
	dir, _ := os.Getwd()
	for i := 0; i < maxDepth; i++ {
		configPath := filepath.Join(dir, "radas.yml")
		if _, err := os.Stat(configPath); err == nil {
			return configPath
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break // reached root
		}
		dir = parent
	}
	return ""
}

