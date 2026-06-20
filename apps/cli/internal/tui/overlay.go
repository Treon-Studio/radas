package tui

import "strings"

func renderHelpOverlay() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("Help") + "\n\n")
	b.WriteString("Keybindings:\n")
	b.WriteString("  Tab        Switch Dashboard / Chat\n")
	b.WriteString("  :          Command mode (type :command)\n")
	b.WriteString("  Enter      Send message or execute command\n")
	b.WriteString("  ?          Toggle help\n")
	b.WriteString("  q / Ctrl+C Quit\n\n")
	b.WriteString("Commands:\n")
	b.WriteString("  :run <project> <task>        Run a task\n")
	b.WriteString("  :generate <template> <name>  Generate code\n")
	b.WriteString("  :template list               List templates\n")
	b.WriteString("  :template add <url>          Install template\n")
	b.WriteString("  :graph                       Show dependency graph\n")
	b.WriteString("  :refresh                     Reload workspace context\n")
	b.WriteString("  :help                        Show this help\n")
	return b.String()
}
