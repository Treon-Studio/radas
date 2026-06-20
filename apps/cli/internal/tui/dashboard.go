package tui

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

type Dashboard struct {
	projects  []string
	templates []string
}

func NewDashboard(projects, templates []string) *Dashboard {
	return &Dashboard{
		projects:  projects,
		templates: templates,
	}
}

func (d *Dashboard) Init() tea.Cmd {
	return nil
}

func (d *Dashboard) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	return d, nil
}

func (d *Dashboard) View() string {
	var b strings.Builder

	b.WriteString(titleStyle.Render("Radas Workspace") + "\n\n")

	if len(d.projects) == 0 {
		b.WriteString("No workspace found.\n")
		b.WriteString("Run `radas workspace init` to create one.\n\n")
	} else {
		b.WriteString(fmt.Sprintf("Projects (%d):\n", len(d.projects)))
		for _, p := range d.projects {
			b.WriteString(fmt.Sprintf("  • %s\n", p))
		}
		b.WriteString("\n")
	}

	if len(d.templates) > 0 {
		b.WriteString(fmt.Sprintf("Templates (%d):\n", len(d.templates)))
		for _, t := range d.templates {
			b.WriteString(fmt.Sprintf("  • %s\n", t))
		}
		b.WriteString("\n")
	}

	return b.String()
}
