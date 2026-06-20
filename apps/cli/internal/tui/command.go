package tui

import "strings"

func parseCommand(input string) (string, []string) {
	if !strings.HasPrefix(input, ":") {
		return "", nil
	}

	trimmed := strings.TrimSpace(strings.TrimPrefix(input, ":"))
	if trimmed == "" {
		return "", nil
	}

	parts := strings.Fields(trimmed)
	return parts[0], parts[1:]
}
