package tui

import (
	"regexp"
	"strings"
)

// ParseResult is the output of the offline interpreter.
// It's the same as a parsed :command — (cmd, args).
type ParseResult struct {
	Cmd  string
	Args []string
}

// InterpretChatInput converts a natural language chat message into a
// parsed :command. It returns (nil, "") if no command can be inferred.
func InterpretChatInput(input string) (*ParseResult, string) {
	msg := strings.TrimSpace(strings.ToLower(input))
	if msg == "" {
		return nil, ""
	}

	if matchesAny(msg, []string{"exit", "quit", "bye", "q"}) {
		return &ParseResult{Cmd: "q"}, "Goodbye!"
	}

	if matchesAny(msg, []string{"help", "what can you do", "commands", "?"}) {
		return &ParseResult{Cmd: "help"}, "Showing help..."
	}

	if cmd, args, ok := matchRun(msg); ok {
		return &ParseResult{Cmd: cmd, Args: args}, "Running task..."
	}

	if cmd, args, ok := matchAddTemplate(msg); ok {
		return &ParseResult{Cmd: cmd, Args: args}, "Adding template..."
	}

	if cmd, args, ok := matchCreateTemplate(msg); ok {
		return &ParseResult{Cmd: cmd, Args: args}, "Creating template..."
	}

	if matchesAny(msg, []string{"list templates", "show templates", "templates", "available templates"}) {
		return &ParseResult{Cmd: "template", Args: []string{"list"}}, "Listing templates..."
	}

	if cmd, args, ok := matchGenerate(msg); ok {
		return &ParseResult{Cmd: cmd, Args: args}, "Generating code..."
	}

	if matchesAny(msg, []string{"graph", "show graph", "show dependencies", "project graph"}) {
		return &ParseResult{Cmd: "graph"}, "Loading graph..."
	}

	if matchesAny(msg, []string{"refresh", "reload"}) {
		return &ParseResult{Cmd: "refresh"}, "Refreshing..."
	}

	return nil, ""
}

func matchRun(msg string) (string, []string, bool) {
	runRe := regexp.MustCompile(`^(?:run|execute|do)\s+(\S+)\s+(\S+)$`)
	if m := runRe.FindStringSubmatch(msg); m != nil {
		return "run", []string{m[1], m[2]}, true
	}

	forRe := regexp.MustCompile(`^(?:run|execute|do)\s+(\S+)\s+(?:for|on|in)\s+(\S+)$`)
	if m := forRe.FindStringSubmatch(msg); m != nil {
		return "run", []string{m[2], m[1]}, true
	}

	return "", nil, false
}

func matchGenerate(msg string) (string, []string, bool) {
	genRe := regexp.MustCompile(`^(?:generate|create|scaffold|make)\s+(?:a\s+)?(\S+)\s+(\S+)$`)
	if m := genRe.FindStringSubmatch(msg); m != nil {
		return "generate", []string{m[1], m[2]}, true
	}

	forRe := regexp.MustCompile(`^(?:generate|create|scaffold|make)\s+(?:a\s+)?(\S+)\s+for\s+(\S+)$`)
	if m := forRe.FindStringSubmatch(msg); m != nil {
		return "generate", []string{m[1], m[2]}, true
	}

	return "", nil, false
}

func matchAddTemplate(msg string) (string, []string, bool) {
	addRe := regexp.MustCompile(`^(?:add|install|fetch)\s+template\s+(\S+)$`)
	if m := addRe.FindStringSubmatch(msg); m != nil {
		return "template", []string{"add", m[1]}, true
	}

	return "", nil, false
}

func matchCreateTemplate(msg string) (string, []string, bool) {
	createRe := regexp.MustCompile(`^(?:create|scaffold|new)\s+template\s+(\S+)$`)
	if m := createRe.FindStringSubmatch(msg); m != nil {
		return "template", []string{"create", m[1]}, true
	}

	return "", nil, false
}

func matchesAny(msg string, patterns []string) bool {
	for _, p := range patterns {
		if msg == p {
			return true
		}
	}
	return false
}
