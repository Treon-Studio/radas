package utils

import (
	"fmt"
	"strings"
)

// PrintTable prints a 2D string slice as a pretty table
type Table struct {
	Header []string
	Rows   [][]string
}

func PrintTable(header []string, rows [][]string) {
	colWidths := make([]int, len(header))
	for i, h := range header {
		colWidths[i] = len(h)
	}
	for _, row := range rows {
		for i, cell := range row {
			if len(cell) > colWidths[i] {
				colWidths[i] = len(cell)
			}
		}
	}
	border := "+"
	for _, w := range colWidths {
		border += strings.Repeat("-", w+2) + "+"
	}
	fmt.Println(border)
	fmt.Print("|")
	for i, h := range header {
		fmt.Printf(" %-*s |", colWidths[i], h)
	}
	fmt.Println()
	fmt.Println(border)
	for _, row := range rows {
		fmt.Print("|")
		for i, cell := range row {
			fmt.Printf(" %-*s |", colWidths[i], cell)
		}
		fmt.Println()
	}
	fmt.Println(border)
}
