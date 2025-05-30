package utils

import (
	"os"
	"strings"

	"github.com/jedib0t/go-pretty/v6/table"
	"github.com/jedib0t/go-pretty/v6/text"
)

// PrettyPrintTable prints a pretty table with custom header colors and optional role column.
// headerColors: must be same length as headers, each is a text.Colors slice (e.g. text.Colors{text.FgHiCyan, text.Bold})
// If roleFunc != nil, it will be called for each row to fill the last column (ROLE)
func PrettyPrintTable(headers []string, headerColors []text.Colors, rows [][]string, roleFunc func([]string) string) {
	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.Style().Options.DrawBorder = true
	t.Style().Options.SeparateRows = true
	t.SetStyle(table.StyleLight)
	t.Style().Box.PaddingLeft = " "; t.Style().Box.PaddingRight = " "

	headerRow := table.Row{}
	for i, h := range headers {
		if i < len(headerColors) && len(headerColors[i]) > 0 {
			headerRow = append(headerRow, headerColors[i].Sprint(h))
		} else {
			headerRow = append(headerRow, h)
		}
	} 
	t.AppendHeader(headerRow)

	for i, row := range rows {
		rowStyle := table.RowConfig{}
		if i%2 == 1 {
			rowStyle.AutoMerge = true
		}
		rowData := make(table.Row, 0, len(row)+1)
		for _, v := range row {
			rowData = append(rowData, v)
		}
		if roleFunc != nil {
			rowData = append(rowData, roleFunc(row))
		}
		t.AppendRow(rowData, rowStyle)
	}
	// Use no background colors
	t.Style().Color.Row = text.Colors{text.FgWhite}
	t.Style().Color.RowAlternate = text.Colors{text.FgWhite}
	t.Style().Color.Header = text.Colors{text.FgHiCyan, text.Bold}
	t.Render()
}

// PrettyPrintTableWithRowColors prints a pretty table with custom header colors and row colors.
// headerColors: must be same length as headers, each is a text.Colors slice (e.g. text.Colors{text.FgHiCyan, text.Bold})
// If roleFunc != nil, it will be called for each row to fill the last column (ROLE)
// If rowColorFunc != nil, it will be called for each row to determine its color
func PrettyPrintTableWithRowColors(headers []string, headerColors []text.Colors, rows [][]string, roleFunc func([]string) string, rowColorFunc func([]string) text.Colors) {
	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.Style().Options.DrawBorder = true
	t.Style().Options.SeparateRows = true
	t.SetStyle(table.StyleLight)
	t.Style().Box.PaddingLeft = " "; t.Style().Box.PaddingRight = " "

	headerRow := table.Row{}
	for i, h := range headers {
		if i < len(headerColors) && len(headerColors[i]) > 0 {
			headerRow = append(headerRow, headerColors[i].Sprint(h))
		} else {
			headerRow = append(headerRow, h)
		}
	} 
	t.AppendHeader(headerRow)

	for _, row := range rows {
		rowStyle := table.RowConfig{}
		
		// Apply row colors if provided
		if rowColorFunc != nil {
			colors := rowColorFunc(row)
			if len(colors) > 0 {
				rowData := make(table.Row, 0, len(row)+1)
				for _, v := range row {
					rowData = append(rowData, colors.Sprint(v))
				}
				if roleFunc != nil {
					rowData = append(rowData, roleFunc(row))
				}
				t.AppendRow(rowData, rowStyle)
				continue
			}
		}
		
		// Default case (no colors)
		rowData := make(table.Row, 0, len(row)+1)
		for _, v := range row {
			rowData = append(rowData, v)
		}
		if roleFunc != nil {
			rowData = append(rowData, roleFunc(row))
		}
		t.AppendRow(rowData, rowStyle)
	}
	
	// Use no background colors
	t.Style().Color.Row = text.Colors{}
	t.Style().Color.RowAlternate = text.Colors{}
	t.Style().Color.Header = text.Colors{text.FgHiCyan, text.Bold}
	t.Render()
}

// Example role function for env variables
func EnvRole(row []string) string {
	if len(row) == 0 {
		return "-"
	}
	key := strings.ToUpper(row[0])
	if strings.Contains(key, "SECRET") {
		return "secret"
	} else if strings.Contains(key, "DB") {
		return "database"
	} else if strings.Contains(key, "URL") {
		return "endpoint"
	}
	return "-"
}
