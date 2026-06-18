package backend

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/db"
)

var dbSteps int
var dbDryRun bool
var dbSeedFile string

var DbCmd = &cobra.Command{
	Use:   "db <subcommand>",
	Short: "Database operations (migrate, seed, push)",
	Long: `Manage database migrations and seed data. Supports:
  - golang-migrate (migrate CLI)
  - goose
  - Supabase CLI
  - psql (fallback)

Config is read from radas.yml 'db' section. Override DSN via DB_URL,
SUPABASE_DB_URL, or DATABASE_URL env vars.`,
}

var dbUpCmd = &cobra.Command{
	Use:   "up [steps]",
	Short: "Run pending migrations",
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		steps := 0
		if len(args) > 0 {
			n, err := strconv.Atoi(args[0])
			if err != nil || n < 0 {
				fmt.Fprintf(os.Stderr, "Error: invalid step count %q (must be a non-negative integer)\n", args[0])
				os.Exit(1)
			}
			steps = n
		}
		dir, cfg := loadConfig()
		out, err := db.MigrateUp(dir, cfg, steps)
		if err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
		fmt.Println(out)
	},
}

var dbDownCmd = &cobra.Command{
	Use:   "down [steps]",
	Short: "Roll back migrations (default: 1)",
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		steps := 1
		if len(args) > 0 {
			n, err := strconv.Atoi(args[0])
			if err != nil || n < 0 {
				fmt.Fprintf(os.Stderr, "Error: invalid step count %q (must be a positive integer)\n", args[0])
				os.Exit(1)
			}
			steps = n
		}
		dir, cfg := loadConfig()
		out, err := db.MigrateDown(dir, cfg, steps)
		if err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
		fmt.Println(out)
	},
}

var dbCreateCmd = &cobra.Command{
	Use:   "create <name>",
	Short: "Create a new migration file",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		dir, cfg := loadConfig()
		out, err := db.MigrateCreate(dir, cfg, args[0])
		if err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
		fmt.Println(out)
	},
}

var dbListCmd = &cobra.Command{
	Use:   "list",
	Short: "Show migration status",
	Run: func(cmd *cobra.Command, args []string) {
		dir, cfg := loadConfig()
		out, err := db.MigrateList(dir, cfg)
		if err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
		fmt.Println(out)
	},
}

var dbPushCmd = &cobra.Command{
	Use:   "push",
	Short: "Push migrations to remote DB (Supabase)",
	Run: func(cmd *cobra.Command, args []string) {
		dir, cfg := loadConfig()
		out, err := db.MigratePush(dir, cfg, dbDryRun)
		if err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
		fmt.Println(out)
	},
}

var dbSeedCmd = &cobra.Command{
	Use:   "seed [file]",
	Short: "Run seed data against database",
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		dir, cfg := loadConfig()
		file := ""
		if len(args) > 0 {
			file = args[0]
		}
		out, err := db.SeedRun(dir, cfg, file)
		if err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
		fmt.Println(out)
	},
}

func loadConfig() (string, *config.DBConfig) {
	cfgPath, err := config.FindConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, "radas.yml not found. Run 'radas config init' first.")
		os.Exit(1)
	}
	cfg, err := config.ParseConfig(cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse config: %v\n", err)
		os.Exit(1)
	}
	return fileDir(cfgPath), &cfg.DB
}

func fileDir(path string) string {
	return filepath.Dir(path)
}

func init() {
	dbPushCmd.Flags().BoolVar(&dbDryRun, "dry-run", false, "show pending migrations without applying")

	DbCmd.AddCommand(dbUpCmd)
	DbCmd.AddCommand(dbDownCmd)
	DbCmd.AddCommand(dbCreateCmd)
	DbCmd.AddCommand(dbListCmd)
	DbCmd.AddCommand(dbPushCmd)
	DbCmd.AddCommand(dbSeedCmd)
}
