package utils

import (
	"testing"
	"github.com/jedib0t/go-pretty/v6/text"
)

func TestEnvRole(t *testing.T) {
	cases := []struct {
		row  []string
		want string
	}{
		{[]string{"MY_SECRET_KEY"}, "secret"},
		{[]string{"DB_HOST"}, "database"},
		{[]string{"API_URL"}, "endpoint"},
		{[]string{"OTHER"}, "-"},
		{[]string{}, "-"},
	}
	for _, c := range cases {
		got := EnvRole(c.row)
		if got != c.want {
			t.Errorf("EnvRole(%v) = %s, want %s", c.row, got, c.want)
		}
	}
}

func TestPrettyPrintTable(t *testing.T) {
	headers := []string{"A", "B"}
	headerColors := []text.Colors{{text.FgCyan}, {text.FgGreen}}
	rows := [][]string{{"1", "2"}, {"3", "4"}}
	
	// Test with roleFunc
	PrettyPrintTable(headers, headerColors, rows, func(r []string) string { return "role" })
	
	// Test without roleFunc and without some header colors
	PrettyPrintTable(headers, nil, rows, nil)
}
