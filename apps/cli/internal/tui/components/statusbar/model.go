package statusbar

import (
	"fmt"
	"strings"
	"runtime/debug"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/raizora/radas/v4/constants"
	"github.com/raizora/radas/v4/internal/tui/theme"
)

type Model struct {
	width       int
	mode        string
	connected   bool
	connectedWC bool
	filepath    string
	branch      string
}

func New() Model {
	return Model{
		mode:        "CHAT",
		connected:   false,
		connectedWC: false,
	}
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	return m, nil
}

func (m Model) SetMode(mode string) Model {
	m.mode = mode
	return m
}

func (m Model) SetConnected(v bool) Model {
	m.connected = v
	return m
}

func (m Model) SetWidth(w int) Model {
	m.width = w
	return m
}

func (m Model) View() string {
	t := theme.OpenCode

	modeStyle := lipgloss.NewStyle().
		Background(t.Accent).
		Foreground(t.TextInverse).
		Bold(true).
		Padding(0, 2)

	connIcon := "○"
	connFg := t.Error
	switch {
	case m.connectedWC:
		connIcon = "●"
		connFg = t.Success
	case m.connected:
		connIcon = "◐"
		connFg = t.Warning
	}

	bg := lipgloss.NewStyle().Background(t.BGSecondary)

	left := modeStyle.Render(m.mode)

	middle := ""
	if m.branch != "" {
		infoStyle := lipgloss.NewStyle().
			Background(t.BGTertiary).
			Foreground(t.TextSecondary).
			Padding(0, 1)
		middle = infoStyle.Render(" " + m.branch + " ")
	}

	rightBg := t.BGTertiary
	rightTextFg := t.TextMuted

	if m.connected {
		rightTextFg = connFg
	}

	right := lipgloss.NewStyle().
		Background(rightBg).
		Foreground(rightTextFg).
		Padding(0, 1).
		Render(fmt.Sprintf("%s Radas - %s (%s)", connIcon, constants.Version, getCommitHash()))

	bar := lipgloss.JoinHorizontal(lipgloss.Top, left, middle)
	fill := m.width - lipgloss.Width(bar) - lipgloss.Width(right)
	if fill < 0 {
		fill = 0
	}
	bar = lipgloss.JoinHorizontal(lipgloss.Top, left, strings.Repeat(" ", fill), right)

	return bg.Render(bar)
}

func getCommitHash() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, setting := range info.Settings {
			if setting.Key == "vcs.revision" {
				if len(setting.Value) > 7 {
					return setting.Value[:7]
				}
				return setting.Value
			}
		}
	}
	return "dev"
}
