package utils

import (
	"fmt"
	"os"
	"strings"

	"github.com/jedib0t/go-pretty/v6/table"
	"github.com/jedib0t/go-pretty/v6/text"
)

// PrettyPrintTable prints a formatted table with smart column widths.
// It auto-detects terminal width, truncates long values, and avoids
// background colors that clash with terminal themes.
func PrettyPrintTable(headers []string, headerColors []text.Colors, rows [][]string, roleFunc func([]string) string) {
	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.SetStyle(table.StyleLight)

	// Clean, dense styling: no heavy row separators
	t.Style().Options.SeparateRows = false
	t.Style().Options.SeparateHeader = true
	t.Style().Box.PaddingLeft = " "
	t.Style().Box.PaddingRight = " "

	// Build header row
	headerRow := table.Row{}
	for i, h := range headers {
		if i < len(headerColors) && len(headerColors[i]) > 0 {
			headerRow = append(headerRow, headerColors[i].Sprint(h))
		} else {
			headerRow = append(headerRow, text.Bold.Sprint(h))
		}
	}
	// Add ROLE header if roleFunc is provided
	if roleFunc != nil {
		headerRow = append(headerRow, text.FgHiBlue.Sprint(text.Bold.Sprint("ROLE")))
	}
	t.AppendHeader(headerRow)

	// Render rows
	for _, row := range rows {
		rowData := make(table.Row, 0, len(row)+1)
		for i, v := range row {
			// Truncate VALUE column (index 1) and ORIGIN column (index 3)
			if (i == 1 || i == 3) && len(v) > 50 {
				v = v[:47] + "..."
			}
			rowData = append(rowData, v)
		}
		if roleFunc != nil {
			rowData = append(rowData, text.FgHiBlue.Sprint(roleFunc(row)))
		}
		t.AppendRow(rowData)
	}

	// Column alignment config
	t.SetColumnConfigs([]table.ColumnConfig{
		{Name: "VARIABLE", Align: text.AlignLeft},
		{Name: "VALUE", Align: text.AlignLeft, WidthMin: 10, WidthMax: 52},
		{Name: "SOURCE", Align: text.AlignCenter},
		{Name: "ORIGIN", Align: text.AlignLeft, WidthMin: 10, WidthMax: 52},
	})

	// Color: only header tint, NO row background colors (safe on all terminals)
	t.Style().Color.Header = text.Colors{text.FgHiCyan}

	t.Render()
}

// PrettyPrintEnvTable prints a table specifically for radas env get
// — role column omitted, long values wrap, compact styling.
func PrettyPrintEnvTable(headers []string, headerColors []text.Colors, rows [][]string) {
	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.SetStyle(table.StyleLight)

	t.Style().Options.SeparateRows = false
	t.Style().Options.SeparateHeader = true
	t.Style().Box.PaddingLeft = " "
	t.Style().Box.PaddingRight = " "

	// Build header
	headerRow := table.Row{}
	for i, h := range headers {
		if i < len(headerColors) && len(headerColors[i]) > 0 {
			headerRow = append(headerRow, headerColors[i].Sprint(h))
		} else {
			headerRow = append(headerRow, text.Bold.Sprint(h))
		}
	}
	t.AppendHeader(headerRow)

	// Build rows with smart truncation
	for _, row := range rows {
		rowData := table.Row{}
		for i, v := range row {
			if (i == 1 || i == 3) && len(v) > 48 {
				v = v[:45] + "..."
			}
			rowData = append(rowData, fmt.Sprintf(" %s ", v))
		}
		t.AppendRow(rowData)
	}

	// Column config
	cfgs := []table.ColumnConfig{
		{Number: 1, Name: headers[0], Align: text.AlignLeft, WidthMin: 12, WidthMax: 25},
		{Number: 2, Name: headers[1], Align: text.AlignLeft, WidthMin: 10, WidthMax: 50, Colors: text.Colors{text.FgMagenta}},
		{Number: 3, Name: headers[2], Align: text.AlignCenter, WidthMin: 8, WidthMax: 12},
	}
	if len(headers) > 3 {
		cfgs = append(cfgs, table.ColumnConfig{
			Number: 4, Name: headers[3], Align: text.AlignLeft, WidthMin: 10, WidthMax: 40,
		})
	}
	t.SetColumnConfigs(cfgs)

	// Header color only
	t.Style().Color.Header = text.Colors{text.FgHiCyan, text.Bold}

	t.Render()
}

// EnvRole returns a semantic role name for an env variable key.
func EnvRole(row []string) string {
	if len(row) == 0 {
		return "-"
	}
	key := strings.ToUpper(row[0])
	switch {
	case strings.Contains(key, "SECRET"), strings.Contains(key, "TOKEN"), strings.Contains(key, "KEY"):
		return "secret"
	case strings.Contains(key, "DB"), strings.Contains(key, "DATABASE"):
		return "database"
	case strings.Contains(key, "URL"), strings.Contains(key, "HOST"), strings.Contains(key, "PORT"):
		return "endpoint"
	case strings.Contains(key, "DEBUG"), strings.Contains(key, "LOG"):
		return "debug"
	}
	return "-"
}
