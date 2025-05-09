package rootcmd

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"github.com/AlecAivazis/survey/v2"
	"github.com/spf13/cobra"
)

type ConfigItem struct {
	Name      string
	Target    string
}

type ToolingConfig map[string][]interface{}

type ConfigRoot struct {
	Configs struct {
		Tooling ToolingConfig `yaml:"tooling"`
	} `yaml:"configs"`
}

var SyncConfigCmd = &cobra.Command{
	Use:   "sync-config",
	Short: "Sync config directories/files from degit template based on radas.yml config list",
	Run: func(cmd *cobra.Command, args []string) {
		cfg := ConfigRoot{}
		if err := loadRadasConfig(&cfg); err != nil {
			fmt.Println(err)
			os.Exit(1)
		}
		categories := make([]string, 0, len(cfg.Configs.Tooling))
		for cat := range cfg.Configs.Tooling {
			categories = append(categories, cat)
		}
		if len(categories) == 0 {
			fmt.Println("No configs.tooling categories found in radas.yml")
			os.Exit(1)
		}
		// Prompt user to pick category
		var selectedCat string
		if len(categories) == 1 {
			selectedCat = categories[0]
		} else {
			prompt := &survey.Select{
				Message: "Select config category:",
				Options: categories,
			}
			_ = survey.AskOne(prompt, &selectedCat)
		}
		// Load default config map
		jsonMap := make(map[string]string)
		jsonPath := filepath.Join(filepath.Dir(os.Args[0]), "cmd/rootcmd/config_map.json")
		jsonF, err := os.Open(jsonPath)
		if err == nil {
			defer jsonF.Close()
			_ = json.NewDecoder(jsonF).Decode(&jsonMap)
		}
		items := cfg.Configs.Tooling[selectedCat]
		if len(items) == 0 {
			fmt.Println("No items found in selected category.")
			return
		}
		var configItems []ConfigItem
		for _, raw := range items {
			switch v := raw.(type) {
			case string:
				target := v
				if jsonMap[v] != "" {
					target = jsonMap[v]
				}
				configItems = append(configItems, ConfigItem{Name: v, Target: target})
			case map[interface{}]interface{}:
				for k, val := range v {
					name, _ := k.(string)
					target, _ := val.(string)
					if target == "" {
						if jsonMap[name] != "" {
							target = jsonMap[name]
						} else {
							target = name
						}
					}
					configItems = append(configItems, ConfigItem{Name: name, Target: target})
				}
			}
		}
		if len(configItems) == 0 {
			fmt.Println("No valid config items found in selected category.")
			return
		}
		// Prompt for which config(s) to sync
		var options []string
		itemMap := make(map[string]ConfigItem)
		for _, ci := range configItems {
			opt := ci.Name
			if ci.Target != ci.Name {
				opt = fmt.Sprintf("%s → %s", ci.Name, ci.Target)
			}
			options = append(options, opt)
			itemMap[opt] = ci
		}
		var selectedOpts []string
		if len(options) == 1 {
			selectedOpts = options
		} else {
			prompt := &survey.MultiSelect{
				Message: "Select config(s) to sync:",
				Options: options,
				Default: options,
			}
			_ = survey.AskOne(prompt, &selectedOpts)
			if len(selectedOpts) == 0 {
				fmt.Println("No config selected. Exiting.")
				return
			}
		}
		configPath := findRadasConfig()
		projectRoot := filepath.Dir(configPath)
		for _, opt := range selectedOpts {
			ci := itemMap[opt]
			templatePath := "raizora-id/wadah-templates/" + ci.Name
			targetPath := filepath.Join(projectRoot, ci.Target)
			fmt.Printf("Syncing config: %s -> %s\n", templatePath, targetPath)
			if _, err := exec.LookPath("npx"); err != nil {
				fmt.Println("npx is not installed or not found in PATH. Please install Node.js and npx.")
				os.Exit(1)
			}
			cmd := exec.Command("npx", "degit", templatePath, targetPath, "--force")
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			err := cmd.Run()
			if err != nil {
				fmt.Printf("Failed to sync %s: %v\n", ci.Name, err)
			} else {
				fmt.Printf("%s synced successfully!\n", ci.Name)
			}
		}
	},
}

// runGitClone clones a git repo to a directory
func runGitClone(repo, dir string) error {
	return runCmd("git", "clone", "--depth=1", repo, dir)
}

// runCmd runs a command and waits for it to finish
func runCmd(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func init() {
	// Register in root.go or main.go
}
