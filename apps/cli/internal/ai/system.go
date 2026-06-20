package ai

import (
	"fmt"
	"strings"
)

type SystemContext struct {
	Tools     []ToolDef
	Projects  []string
	Templates []string
}

func BuildSystemPrompt(ctx SystemContext) string {
	var b strings.Builder

	b.WriteString("You are Radas AI, a workspace assistant for the Radas monorepo tool.\n")
	b.WriteString("You help developers manage projects, run tasks, generate code, and explore the workspace.\n\n")
	b.WriteString("Capabilities:\n")
	b.WriteString("- Run tasks (test, build, lint, format) on specific projects or all projects\n")
	b.WriteString("- Generate code from templates\n")
	b.WriteString("- List available templates and their variables\n")
	b.WriteString("- Show the workspace dependency graph\n")
	b.WriteString("- Read files for context\n\n")
	b.WriteString("Rules:\n")
	b.WriteString("- Always explain what you're doing before executing a tool\n")
	b.WriteString("- When a tool returns results, summarize them for the user\n")
	b.WriteString("- If you're unsure, ask clarifying questions\n")
	b.WriteString("- Keep responses concise\n\n")

	if len(ctx.Tools) > 0 {
		b.WriteString("Available tools:\n")
		for _, t := range ctx.Tools {
			b.WriteString(fmt.Sprintf("- %s: %s\n", t.Name, t.Description))
		}
		b.WriteString("\n")
	}

	if len(ctx.Projects) > 0 {
		b.WriteString(fmt.Sprintf("Workspace projects: %s\n\n", strings.Join(ctx.Projects, ", ")))
	}

	if len(ctx.Templates) > 0 {
		b.WriteString(fmt.Sprintf("Available templates: %s\n", strings.Join(ctx.Templates, ", ")))
	}

	return b.String()
}
