package backend

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/db"
	"github.com/raizora/radas/v4/internal/utils"
)

var schemaModelDirs []string

var dbSchemaCmd = &cobra.Command{
	Use:   "schema",
	Short: "Show database schema from migrations and Go structs",
	Long: `Parse migration SQL files for CREATE TABLE statements and optionally
scan Go model structs to cross-reference columns with struct fields.

Tables are extracted from migration .sql files in the migrations directory.
When --models is provided, Go structs in those directories are scanned for
db/gorm/json tags and matched to table columns by name.

Examples:
  be db schema                    # tables from SQL migrations only
  be db schema --models ./...     # SQL + Go structs in all subdirs
  be db schema --models internal/model,internal/entity
`,
	Run: func(cmd *cobra.Command, args []string) {
		dir, cfg := loadConfig()

		tables, err := db.ScanSchemaSQL(dir, cfg)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		if len(tables) == 0 {
			fmt.Println("No tables found in migrations.")
			os.Exit(0)
		}

		// Optionally scan Go structs
		var structs []db.StructInfo
		if len(schemaModelDirs) > 0 {
			structs, err = db.ScanGoStructs(schemaModelDirs...)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Warning: struct scan failed: %v\n", err)
			}
		}

		// Build table index for struct lookup
		structByTable := map[string]db.StructInfo{}
		for _, s := range structs {
			structByTable[s.TableName] = s
		}
		structByStruct := map[string]db.StructInfo{}
		for _, s := range structs {
			structByStruct[s.StructName] = s
		}

		// Print per-table output
		for i, table := range tables {
			if i > 0 {
				fmt.Println()
			}
			printTableSchema(table, structByTable[table.Table])
		}

		// Show structs with no matching SQL table
		var orphanStructs []db.StructInfo
		for _, s := range structs {
			found := false
			for _, t := range tables {
				if t.Table == s.TableName {
					found = true
					break
				}
			}
			if !found {
				orphanStructs = append(orphanStructs, s)
			}
		}
		if len(orphanStructs) > 0 {
			fmt.Println()
			fmt.Println("--- Go structs without matching SQL table ---")
			for _, s := range orphanStructs {
				fmt.Printf("  %s → %s (in %s)\n", s.StructName, s.TableName, s.Source)
			}
		}
	},
}

func printTableSchema(table db.TableInfo, struc db.StructInfo) {
	fmt.Printf("Table: %s  [%s]\n", table.Table, strings.TrimSuffix(table.Source, ".sql"))

	// Column headers
	header := []string{"COLUMN", "TYPE", "NULLABLE", "PK", "DEFAULT"}
	hasStructs := struc.StructName != ""
	if hasStructs {
		header = append(header, "GO FIELD")
	}

	var rows [][]string
	for _, col := range table.Columns {
		nullable := "YES"
		if !col.Nullable {
			nullable = "NO"
		}
		pk := ""
		if col.IsPK {
			pk = "PK"
		}
		def := col.Default
		if len(def) > 30 {
			def = def[:27] + "..."
		}

		row := []string{col.Name, col.Type, nullable, pk, def}

		if hasStructs {
			// Find matching struct field
			goField := findGoField(struc, col.Name)
			row = append(row, goField)
		}

		rows = append(rows, row)
	}

	utils.PrintTable(header, rows)

	if hasStructs {
		if struc.StructName != "" {
			fmt.Printf("  Go struct: %s (%s)\n", struc.StructName, struc.Source)
			for _, f := range struc.Fields {
				if f.Column == "" {
					continue
				}
				// Show fields with no matching column
				found := false
				for _, c := range table.Columns {
					if c.Name == f.Column {
						found = true
						break
					}
				}
				if !found {
					fmt.Printf("  ⚠ struct field %s (%s) tagged %q has no matching column\n",
						f.FieldName, f.FieldType, f.Column)
				}
			}
		}
	}
}

func findGoField(s db.StructInfo, column string) string {
	for _, f := range s.Fields {
		if f.Column == column {
			return fmt.Sprintf("%s %s", f.FieldName, f.FieldType)
		}
	}
	return ""
}

func init() {
	dbSchemaCmd.Flags().StringArrayVar(&schemaModelDirs, "models", nil,
		"comma-separated Go model directories to scan (e.g. internal/model)")
	DbCmd.AddCommand(dbSchemaCmd)
}
