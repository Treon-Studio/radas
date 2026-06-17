// Package ignore generates .gitignore (and related) files for the
// fe/be/infra teams. Templates are fetched from a degit repo and
// merged with any existing file so user customizations are preserved.
package ignore

import (
	"fmt"
	"os"
	"strings"
)

const managedHeader = "# radas-managed: do not remove this header.\n" +
	"# Re-running `radas <team> ignore` is safe; it preserves your\n" +
	"# manual additions below.\n"

func MergePatterns(existing, template string, force bool) (string, error) {
	if force {
		return managedHeader + template, nil
	}

	if strings.TrimSpace(existing) == "" {
		if strings.TrimSpace(template) == "" {
			return "", nil
		}
		return managedHeader + template, nil
	}
	if strings.TrimSpace(template) == "" {
		return existing, nil
	}

	existingSet := lineSet(existing)
	newLines := []string{}
	for _, line := range strings.Split(template, "\n") {
		if line == "" {
			continue
		}
		if _, ok := existingSet[line]; !ok {
			newLines = append(newLines, line)
			existingSet[line] = struct{}{}
		}
	}

	if len(newLines) == 0 {
		return existing, nil
	}

	var b strings.Builder
	b.WriteString(existing)
	if !strings.HasSuffix(existing, "\n") {
		b.WriteString("\n")
	}
	b.WriteString("\n# Added by radas:\n")
	for _, l := range newLines {
		b.WriteString(l)
		b.WriteString("\n")
	}
	return b.String(), nil
}

func lineSet(s string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, l := range strings.Split(s, "\n") {
		if l == "" {
			continue
		}
		out[l] = struct{}{}
	}
	return out
}

func IsBinary(path string) (bool, error) {
	f, err := os.Open(path)
	if err != nil {
		return false, fmt.Errorf("open: %w", err)
	}
	defer f.Close()
	buf := make([]byte, 8192)
	n, err := f.Read(buf)
	if err != nil {
		return false, fmt.Errorf("read: %w", err)
	}
	for i := 0; i < n; i++ {
		if buf[i] == 0 {
			return true, nil
		}
	}
	return false, nil
}
