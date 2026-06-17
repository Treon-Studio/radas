package utils

import (
	"fmt"
	"io"
	"os"
	"strings"
)

type Table struct {
	Header []string
	Rows   [][]string
}

func PrintTable(header []string, rows [][]string) {
	PrintTableTo(os.Stdout, header, rows)
}

func PrintTableTo(w io.Writer, header []string, rows [][]string) {
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
	fmt.Fprintln(w, border)
	fmt.Fprint(w, "|")
	for i, h := range header {
		fmt.Fprintf(w, " %-*s |", colWidths[i], h)
	}
	fmt.Fprintln(w)
	fmt.Fprintln(w, border)
	for _, row := range rows {
		fmt.Fprint(w, "|")
		for i, cell := range row {
			fmt.Fprintf(w, " %-*s |", colWidths[i], cell)
		}
		fmt.Fprintln(w)
	}
	fmt.Fprintln(w, border)
}
