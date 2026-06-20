package tui

import (
	"github.com/charmbracelet/bubbles/key"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/raizora/radas/v4/internal/ai"
)

type state int

const (
	stateDashboard state = iota
	stateChat
	stateHelp
)

type Model struct {
	state       state
	width       int
	height      int
	chatSession *ai.ChatSession
	quitting    bool
	dashboard   *Dashboard
	chatView    *ChatView
}

func NewModel(projects, templates []string, chatSession *ai.ChatSession) Model {
	return Model{
		state:       stateDashboard,
		dashboard:   NewDashboard(projects, templates),
		chatView:    NewChatView(chatSession),
		chatSession: chatSession,
	}
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case tea.KeyMsg:
		switch {
		case key.Matches(msg, keys.Quit):
			m.quitting = true
			return m, tea.Quit
		case key.Matches(msg, keys.Tab):
			if m.state == stateDashboard {
				m.state = stateChat
			} else {
				m.state = stateDashboard
			}
			return m, nil
		case key.Matches(msg, keys.Help):
			if m.state == stateHelp {
				m.state = stateDashboard
			} else {
				m.state = stateHelp
			}
			return m, nil
		}
	}

	return m, nil
}

func (m Model) View() string {
	if m.quitting {
		return ""
	}

	var tabs, content string

	switch m.state {
	case stateDashboard:
		tabs = renderTabs("Dashboard", "Chat")
		content = m.dashboard.View()
	case stateChat:
		tabs = renderTabs("Dashboard", "Chat")
		content = m.chatView.View()
	case stateHelp:
		tabs = renderTabs("Help", "Help")
		content = renderHelp()
	}

	return appStyle.Render(tabs + "\n" + content + "\n\n" + renderFooter(m.state))
}

func renderTabs(active, inactive string) string {
	return activeTabStyle.Render(active) + " " + inactiveTabStyle.Render(inactive)
}

func renderFooter(s state) string {
	return helpStyle.Render("[Tab] Switch  [?] Help  [q] Quit")
}

func renderHelp() string {
	return `Keybindings:
  Tab        Switch between Dashboard and Chat
  ?          Toggle this help
  q / Ctrl+C Quit
  :          Command mode (in Chat view)
  Ctrl+P     Command palette`
}
