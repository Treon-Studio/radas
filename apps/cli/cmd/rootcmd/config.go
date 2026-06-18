package rootcmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"github.com/AlecAivazis/survey/v2"
	"gopkg.in/yaml.v3"
	"github.com/raizora/radas/v4/constants"
	"github.com/raizora/radas/v4/internal/config"
)

// dbDriver describes a selectable database driver in config init.
type dbDriver struct {
	Label string // display label (e.g. "Supabase (Postgres platform)")
	Name  string // yaml value (e.g. "supabase")
	DSN   string // default DSN hint
	Stack string // extra stack name, if any
}

var dbDrivers = []dbDriver{
	{Label: "PostgreSQL", Name: "postgres", DSN: "postgres://user:pass@localhost:5432/dbname?sslmode=disable"},
	{Label: "Supabase (Postgres platform)", Name: "supabase", DSN: "postgres://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"},
	{Label: "Turso (Edge SQLite)", Name: "turso", DSN: "libsql://[DB-NAME]-[ORG].turso.io?authToken=[TOKEN]", Stack: "libsql"},
	{Label: "MySQL", Name: "mysql", DSN: "user:pass@tcp(localhost:3306)/dbname?parseTime=true"},
	{Label: "SQLite", Name: "sqlite", DSN: "./data.db"},
	{Label: "MongoDB", Name: "mongodb", DSN: "mongodb://localhost:27017/dbname"},
	{Label: "None", Name: "none"},
}

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
		configPath, _ := config.FindConfig()
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
	configPath, err := config.FindConfig()
	if err != nil {
		return err
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

		// For backend types, ask which database driver to use
		var selectedDriver dbDriver
		isBackend := selectedType == "backend-api" || selectedType == "monorepo-backend" || strings.HasPrefix(selectedType, "fullstack-")
		if isBackend {
			labels := make([]string, len(dbDrivers))
			for i, d := range dbDrivers {
				labels[i] = d.Label
			}
			var dbLabel string
			dbPrompt := &survey.Select{
				Message: "Select database driver:",
				Options: labels,
				Default: "PostgreSQL",
			}
			err = survey.AskOne(dbPrompt, &dbLabel)
			if err != nil {
				fmt.Println("Prompt cancelled.")
				os.Exit(1)
			}
			for _, d := range dbDrivers {
				if d.Label == dbLabel {
					selectedDriver = d
					break
				}
			}
		}

		if selectedType == "backend-api" {
			var content string
			if selectedDriver.Name == "none" {
				content = fmt.Sprintf(`name: "%s"
description: "%s"
type: backend-api
stacks: [go]

build:
  main: ./cmd/server
  output: ./bin/app

gen:
  handler:
    template: templates/handler.gotpl
    output: internal/handler
  service:
    template: templates/service.gotpl
    output: internal/service
  model:
    template: templates/model.gotpl
    output: internal/model

server:
  port: 8080

run:
  command: go run ./cmd/server
  watch: true
  watch_tool: air

test:
  cover_threshold: 80
  flags: -race -count=1
`, name, description)
			} else {
				stacks := "[go]"
				if selectedDriver.Stack != "" {
					stacks = fmt.Sprintf("[go, %s]", selectedDriver.Stack)
				}
				content = fmt.Sprintf(`name: "%s"
description: "%s"
type: backend-api
stacks: %s

build:
  main: ./cmd/server
  output: ./bin/app

db:
  driver: %s
  default_dsn: %s
  migrations: ./migrations
  seeds: ./seeds

gen:
  handler:
    template: templates/handler.gotpl
    output: internal/handler
  service:
    template: templates/service.gotpl
    output: internal/service
  model:
    template: templates/model.gotpl
    output: internal/model

server:
  port: 8080

run:
  command: go run ./cmd/server
  watch: true
  watch_tool: air

test:
  cover_threshold: 80
  flags: -race -count=1
`, name, description, stacks, selectedDriver.Name, selectedDriver.DSN)
			}
			err = os.WriteFile(filename, []byte(content), 0644)
			if err != nil {
				fmt.Printf("Failed to write %s: %v\n", filename, err)
				os.Exit(1)
			}
			fmt.Printf("%s created successfully!\n", filename)
			return
		}

		if selectedType == "monorepo-backend" {
			var content string
			if selectedDriver.Name != "none" {
				stacks := "[go, proto]"
				if selectedDriver.Stack != "" {
					stacks = fmt.Sprintf("[go, proto, %s]", selectedDriver.Stack)
				}
				content = fmt.Sprintf(`name: "%s"
description: "%s"
type: monorepo-backend
stacks: %s

build:
  main: ./cmd/server
  output: ./bin

db:
  driver: %s
  default_dsn: %s
  migrations: ./migrations
  seeds: ./seeds

gen:
  handler:
    template: templates/handler.gotpl
    output: internal/handler
  service:
    template: templates/service.gotpl
    output: internal/service

server:
  port: 8080

run:
  command: go run ./cmd/server
  watch: true
  watch_tool: air

test:
  cover_threshold: 80
`, name, description, stacks, selectedDriver.Name, selectedDriver.DSN)
			} else {
				content = fmt.Sprintf(`name: "%s"
description: "%s"
type: monorepo-backend
stacks: [go, proto]

build:
  main: ./cmd/server
  output: ./bin

gen:
  handler:
    template: templates/handler.gotpl
    output: internal/handler
  service:
    template: templates/service.gotpl
    output: internal/service

server:
  port: 8080

run:
  command: go run ./cmd/server
  watch: true
  watch_tool: air

test:
  cover_threshold: 80
`, name, description)
			}
			err = os.WriteFile(filename, []byte(content), 0644)
			if err != nil {
				fmt.Printf("Failed to write %s: %v\n", filename, err)
				os.Exit(1)
			}
			fmt.Printf("%s created successfully!\n", filename)
			return
		}

		if selectedType == "frontend-web" {
			content := fmt.Sprintf(`name: "%s"
description: "%s"
type: frontend-web
stacks: [react, typescript]

contract:
  design:
    - path: tokens
      type: figma
  api:
    - path: spec/openapi.yaml
      type: openapi3
`, name, description)
			err = os.WriteFile(filename, []byte(content), 0644)
			if err != nil {
				fmt.Printf("Failed to write %s: %v\n", filename, err)
				os.Exit(1)
			}
			fmt.Printf("%s created successfully!\n", filename)
			return
		}

		if selectedType == "frontend-app" {
			content := fmt.Sprintf(`name: "%s"
description: "%s"
type: frontend-app
stacks: [react-native, typescript]

contract:
  api:
    - path: spec/openapi.yaml
      type: openapi3
`, name, description)
			err = os.WriteFile(filename, []byte(content), 0644)
			if err != nil {
				fmt.Printf("Failed to write %s: %v\n", filename, err)
				os.Exit(1)
			}
			fmt.Printf("%s created successfully!\n", filename)
			return
		}

		if selectedType == "frontend-desktop" {
			content := fmt.Sprintf(`name: "%s"
description: "%s"
type: frontend-desktop
stacks: [electron, typescript]

contract:
  api:
    - path: spec/openapi.yaml
      type: openapi3
`, name, description)
			err = os.WriteFile(filename, []byte(content), 0644)
			if err != nil {
				fmt.Printf("Failed to write %s: %v\n", filename, err)
				os.Exit(1)
			}
			fmt.Printf("%s created successfully!\n", filename)
			return
		}

		if selectedType == "monorepo-frontend" {
			content := fmt.Sprintf(`name: "%s"
description: "%s"
type: monorepo-frontend
stacks: [react, typescript, nextjs]

contract:
  design:
    - path: tokens
      type: figma
  api:
    - path: spec/openapi.yaml
      type: openapi3
`, name, description)
			err = os.WriteFile(filename, []byte(content), 0644)
			if err != nil {
				fmt.Printf("Failed to write %s: %v\n", filename, err)
				os.Exit(1)
			}
			fmt.Printf("%s created successfully!\n", filename)
			return
		}

		if selectedType == "fullstack-web" {
			content := fmt.Sprintf(`name: "%s"
description: "%s"
type: fullstack-web
stacks: [react, hono, drizzle, supabase, cloudflare]

frontend:
  framework: react
  bundler: vite
  port: 5173
  package_manager: pnpm

backend:
  framework: hono
  runtime: cloudflare-workers
  entry: src/server.ts

database:
  orm: drizzle
  config: drizzle.config.ts
  provider: supabase

deploy:
  target: cloudflare
  wrangler: wrangler.jsonc

contract:
  design:
    - path: tokens
      type: figma
  api:
    - path: spec/openapi.yaml
      type: openapi3

cloudflare:
  api_token: ${CF_API_TOKEN}
  account_id: ${CF_ACCOUNT_ID}
`, name, description)
			err = os.WriteFile(filename, []byte(content), 0644)
			if err != nil {
				fmt.Printf("Failed to write %s: %v\n", filename, err)
				os.Exit(1)
			}
			fmt.Printf("%s created successfully!\n", filename)
			return
		}

		if selectedType == "fullstack-app" {
			content := fmt.Sprintf(`name: "%s"
description: "%s"
type: fullstack-app
stacks: [react-native, expo, hono, drizzle, supabase]

frontend:
  framework: react-native
  bundler: expo
  port: 8081
  package_manager: pnpm

backend:
  framework: hono
  runtime: cloudflare-workers
  entry: src/server.ts

database:
  orm: drizzle
  config: drizzle.config.ts
  provider: supabase

deploy:
  target: cloudflare
  wrangler: wrangler.jsonc

contract:
  api:
    - path: spec/openapi.yaml
      type: openapi3

cloudflare:
  api_token: ${CF_API_TOKEN}
  account_id: ${CF_ACCOUNT_ID}
`, name, description)
			err = os.WriteFile(filename, []byte(content), 0644)
			if err != nil {
				fmt.Printf("Failed to write %s: %v\n", filename, err)
				os.Exit(1)
			}
			fmt.Printf("%s created successfully!\n", filename)
			return
		}

		if selectedType == "docs" {
			content := fmt.Sprintf(`name: "%s"
description: "%s"
type: docs
stacks: [markdown]
`, name, description)
			err = os.WriteFile(filename, []byte(content), 0644)
			if err != nil {
				fmt.Printf("Failed to write %s: %v\n", filename, err)
				os.Exit(1)
			}
			fmt.Printf("%s created successfully!\n", filename)
			return
		}

		// Fallback for unknown types
		content := fmt.Sprintf(`name: "%s"
description: "%s"
type: %s
`, name, description, selectedType)
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

