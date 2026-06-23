package tui

import (
	"github.com/charmbracelet/lipgloss"

	"github.com/raizora/radas/v4/internal/tui/theme"
)

func renderLayout(m Model) string {
	if m.quitting {
		return ""
	}

	if m.showHelp {
		return renderHelpOverlay()
	}

	t := theme.OpenCode

	mainContent := m.renderMainContent(t)

	var panels []string

	// Left Sidebar
	if m.showSidebar {
		panels = append(panels, m.sidebar.View())
	}

	// Main Content
	panels = append(panels, mainContent)

	// Right Info Panel
	if m.showInfo {
		panels = append(panels, m.infoPanel.View())
	}

	content := lipgloss.JoinHorizontal(lipgloss.Top, panels...)

	statusView := m.statusBar.View()

	return lipgloss.JoinVertical(
		lipgloss.Left,
		content,
		statusView,
	) + "\n"
}

func (m Model) renderMainContent(t theme.Theme) string {
	var content string
	if m.chatView != nil {
		content = m.chatView.View()
	} else {
		content = "No chat session"
	}

	mainStyle := lipgloss.NewStyle().
		Width(m.dimensions.MainContentWidth).
		Height(m.dimensions.MainContentHeight).
		Border(lipgloss.NormalBorder()).
		BorderForeground(t.Border).
		Padding(1, 1)

	if m.focus == focusMain {
		mainStyle = mainStyle.BorderForeground(t.BorderFocus)
	}

	return mainStyle.Render(content)
}
