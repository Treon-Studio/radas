package tui

import (
	"github.com/charmbracelet/lipgloss"
	"github.com/raizora/radas/v4/internal/tui/theme"
)

func renderHelpOverlay() string {
	t := theme.OpenCode
	title := lipgloss.NewStyle().Bold(true).Foreground(t.Accent).Render("Help")
	return lipgloss.NewStyle().
		Foreground(t.TextPrimary).
		Background(t.BGPrimary).
		Padding(2, 4).
		Render(title + "\n\n" + helpBody())
}

func helpBody() string {
	return `Keybindings:
  Ctrl+Q          Quit
  Ctrl+M          Focus main content
  Ctrl+Shift+I    Toggle info panel
  Enter           Send message
  Shift+Enter     New line in input
  :               Focus input bar
  Esc             Cancel / blur input
  Ctrl+K          Clear chat
  Ctrl+N          New session
  ?               Toggle this help
  r               Refresh info panel

Commands (type : then command):
  :run <project> <task>        Run a task
  :generate <template> <name>  Generate code
  :template list               List templates
  :template add <url>          Install template
  :graph                       Show dependency graph
  :refresh                     Reload workspace context
  :help                        Show this help`
}
