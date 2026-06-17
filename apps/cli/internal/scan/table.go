package scan

import (
	"fmt"
	"strings"

	"github.com/raizora/radas/v4/internal/utils"
)

func ToTable(findings []Finding) string {
	if len(findings) == 0 {
		return "✓ no secrets found."
	}
	rows := make([][]string, 0, len(findings))
	for _, f := range findings {
		rows = append(rows, []string{f.File, fmt.Sprintf("%d", f.Line), f.Rule, f.Secret})
	}
	var sb strings.Builder
	utils.PrintTableTo(&sb, []string{"File", "Line", "Rule", "Secret"}, rows)
	return sb.String()
}
