package sidebar

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/raizora/radas/v4/internal/tui/theme"
)

type Model struct {
	width   int
	height  int
	focused bool

	projects []string
}

func New(projects []string) Model {
	if len(projects) == 0 {
		projects = []string{"Default Workspace"}
	}
	return Model{
		projects: projects,
	}
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	return m, nil
}

func (m Model) SetWidth(w int) Model {
	m.width = w
	return m
}

func (m Model) SetHeight(h int) Model {
	m.height = h
	return m
}

func (m Model) SetFocused(v bool) Model {
	m.focused = v
	return m
}

func (m Model) View() string {
	t := theme.OpenCode

	panelStyle := lipgloss.NewStyle().
		Width(m.width).
		Height(m.height).
		Border(lipgloss.NormalBorder()).
		BorderForeground(t.Border).
		Padding(1, 1)

	if m.focused {
		panelStyle = panelStyle.BorderForeground(t.BorderFocus)
	}

	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(t.Accent).
		MarginBottom(1)

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		titleStyle.Render("EXPLORER"),
		m.renderSection("WORKSPACES", m.projects, t),
		"",
		m.renderSection("RECENT CHATS", []string{"New Chat"}, t),
	)

	return panelStyle.Render(content)
}

func (m Model) renderSection(title string, items []string, t theme.Theme) string {
	header := lipgloss.NewStyle().Bold(true).Foreground(t.TextPrimary).Render(title)
	
	var body strings.Builder
	for i, item := range items {
		prefix := "  "
		if i == 0 {
			prefix = "▶ "
		}
		
		itemStyle := lipgloss.NewStyle().Foreground(t.TextSecondary)
		if i == 0 {
			itemStyle = lipgloss.NewStyle().Foreground(t.TextPrimary).Bold(true)
		}
		
		body.WriteString(prefix + itemStyle.Render(item) + "\n")
	}

	return header + "\n" + body.String()
}
