package tui

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/charmbracelet/bubbles/key"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/raizora/radas/v4/internal/ai"
	"github.com/raizora/radas/v4/internal/tui/components/infopanel"
	"github.com/raizora/radas/v4/internal/tui/components/sidebar"
	"github.com/raizora/radas/v4/internal/tui/components/statusbar"
	"github.com/raizora/radas/v4/internal/tui/layout"
)

// debugLog writes diagnostics to a file. Only active when RADAS_DEBUG=1.
func debugLog(v ...interface{}) {
	if os.Getenv("RADAS_DEBUG") == "" {
		return
	}
	f, err := os.OpenFile("/tmp/radas-debug.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "[%s] %s\n", time.Now().Format("15:04:05.000"), fmt.Sprint(v...))
}

type state int

const (
	stateChat state = iota
	stateHelp
)

type focusTarget int

const (
	focusMain focusTarget = iota
	focusInfo
	focusInput
	focusSidebar
)

type Model struct {
	state       state
	focus       focusTarget
	width       int
	height      int
	quitting    bool
	showHelp    bool
	showInfo    bool
	showSidebar bool

	chatSession *ai.ChatSession
	chatView    *ChatView

	sidebar    sidebar.Model
	infoPanel  infopanel.Model
	statusBar  statusbar.Model
	dimensions layout.Dimensions

	streamCh  <-chan ai.Event
	streamBuf string
}

func NewModel(projects, templates []string, chatSession *ai.ChatSession) Model {
	m := Model{
		state:       stateChat,
		focus:       focusInput,
		chatView:    NewChatView(chatSession),
		chatSession: chatSession,
		sidebar:     sidebar.New(projects),
		infoPanel:   infopanel.New(),
		statusBar:   statusbar.New(),
		showInfo:    true,
		showSidebar: false,
	}
	// Auto-focus input so user can type immediately
	if m.chatView != nil {
		m.chatView.FocusInput()
	}
	return m
}


func (m Model) Init() tea.Cmd {
	var cmds []tea.Cmd
	if m.chatView != nil {
		cmds = append(cmds, m.chatView.Init())
	}
	cmds = append(cmds, infopanel.CheckRadas(), infopanel.CheckNetwork(), infopanel.CheckMCP())
	return tea.Batch(cmds...)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		return m.handleWindowSize(msg)
	case tea.KeyMsg:
		return m.handleKeyMsg(msg)
	case SendChatMsg:
		if m.chatSession != nil {
			return m, m.sendToAI(msg.Content)
		}
		m.chatView.AddAIMessage(fmt.Sprintf("(echo) %s", msg.Content))
		return m, nil
	case AIMessageMsg:
		if msg.Done {
			m.chatView.AddAIMessage(m.streamBuf)
			m.streamCh = nil
			m.streamBuf = ""
		} else {
			m.streamBuf += msg.Content
			m.chatView.UpdateStreaming(msg.Content)
			if m.streamCh != nil {
				return m, m.streamNextChunk
			}
		}
		return m, nil
	default:
		return m.forwardToChildren(msg)
	}
}

func (m Model) sendToAI(prompt string) tea.Cmd {
	if m.chatSession == nil {
		return func() tea.Msg {
			return AIMessageMsg{Content: "AI not configured. Run `radas setup` first.", Done: true}
		}
	}

	m.streamCh = m.chatSession.Send(context.Background(), prompt)
	m.streamBuf = ""

	return m.streamNextChunk
}

func (m Model) streamNextChunk() tea.Msg {
	evt, ok := <-m.streamCh
	if !ok {
		return AIMessageMsg{Done: true}
	}
	switch evt.Type {
	case ai.EventText:
		return AIMessageMsg{Content: evt.Text, Done: false}
	case ai.EventError:
		return AIMessageMsg{Content: fmt.Sprintf("Error: %v", evt.Err), Done: true}
	case ai.EventDone:
		return AIMessageMsg{Done: true}
	default:
		return nil
	}
}

func (m Model) handleWindowSize(msg tea.WindowSizeMsg) (Model, tea.Cmd) {
	m.width = msg.Width
	m.height = msg.Height
	m.dimensions = layout.NewDimensions(msg.Width, msg.Height, m.showSidebar, m.showInfo)
	m.statusBar = m.statusBar.SetWidth(msg.Width)

	var cmds []tea.Cmd

	if m.chatView != nil {
		chatW := m.dimensions.MainContentWidth - 4 // subtract border + padding
		if chatW < 10 {
			chatW = 10
		}
		chatH := m.dimensions.MainContentHeight - 4 // subtract top/bottom padding
		if chatH < 5 {
			chatH = 5
		}
		chatMsg := tea.WindowSizeMsg{Width: chatW, Height: chatH}
		debugLog("handleWindowSize: full=", msg.Width, "x", msg.Height,
			" main=", m.dimensions.MainContentWidth, "x", m.dimensions.MainContentHeight,
			" chat=", chatW, "x", chatH)
		sub, cmd := m.chatView.Update(chatMsg)
		if c, ok := sub.(*ChatView); ok {
			m.chatView = c
			cmds = append(cmds, cmd)
		}
	}

	m.sidebar = m.sidebar.
		SetWidth(m.dimensions.SidebarWidth).
		SetHeight(m.dimensions.SidebarHeight)

	m.infoPanel = m.infoPanel.
		SetWidth(m.dimensions.InfoPanelWidth).
		SetHeight(m.dimensions.InfoPanelHeight)

	return m, tea.Batch(cmds...)
}

func (m Model) handleKeyMsg(msg tea.KeyMsg) (Model, tea.Cmd) {
	debugLog("handleKeyMsg key=", string(msg.Runes),
		" type=", msg.Type,
		" focus=", m.focus,
		" inputFocused=", m.chatView != nil && m.chatView.InputFocused(),
		" showInfo=", m.showInfo,
		" showSidebar=", m.showSidebar)
	switch {
	case key.Matches(msg, keys.Quit):
		m.quitting = true
		return m, tea.Quit

	case key.Matches(msg, keys.ToggleSidebar):
		m.showSidebar = !m.showSidebar
		if m.showSidebar {
			m.focus = focusSidebar
			m.sidebar = m.sidebar.SetFocused(true)
			m.infoPanel = m.infoPanel.SetFocused(false)
			if m.chatView != nil {
				m.chatView.BlurInput()
			}
		} else {
			m.focus = focusMain
			m.sidebar = m.sidebar.SetFocused(false)
		}
		// Recalculate layout
		m, _ = m.handleWindowSize(tea.WindowSizeMsg{Width: m.width, Height: m.height})

	case key.Matches(msg, keys.FocusInfo):
		m.showInfo = !m.showInfo
		if m.showInfo {
			m.focus = focusInfo
			m.infoPanel = m.infoPanel.SetFocused(true)
			m.sidebar = m.sidebar.SetFocused(false)
			if m.chatView != nil {
				m.chatView.BlurInput()
			}
		} else {
			m.focus = focusMain
		}
		// Recalculate layout
		m, _ = m.handleWindowSize(tea.WindowSizeMsg{Width: m.width, Height: m.height})

	case key.Matches(msg, keys.FocusMain):
		m.focus = focusMain
		m.infoPanel = m.infoPanel.SetFocused(false)
		m.sidebar = m.sidebar.SetFocused(false)
		if m.chatView != nil {
			m.chatView.BlurInput()
		}
		return m, nil

	case key.Matches(msg, keys.FocusInput):
		if m.chatView == nil {
			return m, nil
		}
		if !m.chatView.InputFocused() {
			m.focus = focusInput
			cmd := m.chatView.FocusInput()
			m.infoPanel = m.infoPanel.SetFocused(false)
			m.sidebar = m.sidebar.SetFocused(false)
			return m, cmd
		}
		// Already focused: fall through so ':' is typed into textarea

	case key.Matches(msg, keys.SendMessage):
		if m.focus == focusInput && m.chatView != nil {
			input := m.chatView.Input()
			if input != "" {
				m.chatView.AddUserMessage(input)
				return m, m.sendMessage(input)
			}
		} else if m.focus == focusInfo {
			m.focus = focusMain
		}

	case key.Matches(msg, keys.Help):
		m.showHelp = !m.showHelp
		return m, nil

	case key.Matches(msg, keys.RefreshInfo):
		if m.focus == focusInfo {
			return m, m.refreshInfoPanel()
		}

	case key.Matches(msg, keys.NewSession):
		if m.chatView != nil {
			m.chatView.Clear()
		}

	case key.Matches(msg, keys.CancelStream):
		if m.chatView != nil {
			m.chatView.BlurInput()
		}

	case key.Matches(msg, keys.ClearChat):
		if m.chatView != nil {
			m.chatView.Clear()
		}
		return m, nil
	}

	if m.chatView != nil && m.chatView.InputFocused() && m.focus == focusInput {
		switch {
		case key.Matches(msg, keys.NewLine):
			return m.forwardToChildren(msg)
		case key.Matches(msg, keys.SendMessage):
		default:
			return m.forwardToChildren(msg)
		}
	}

	return m, nil
}

func (m Model) sendMessage(input string) tea.Cmd {
	return func() tea.Msg {
		return SendChatMsg{Content: input}
	}
}

func (m Model) forwardToChildren(msg tea.Msg) (Model, tea.Cmd) {
	var cmds []tea.Cmd

	if m.chatView != nil {
		sub, cmd := m.chatView.Update(msg)
		if c, ok := sub.(*ChatView); ok {
			m.chatView = c
			cmds = append(cmds, cmd)
		}
	}

	switch msg := msg.(type) {
	case infopanel.NetworkCheckMsg:
		sub, cmd := m.infoPanel.Update(msg)
		m.infoPanel = sub
		m.statusBar = m.statusBar.SetConnected(msg.Connected)
		if cmd != nil {
			cmds = append(cmds, cmd)
		}
	case infopanel.RadasCheckMsg, infopanel.MCPCheckMsg, infopanel.RefreshMsg:
		sub, cmd := m.infoPanel.Update(msg)
		m.infoPanel = sub
		if cmd != nil {
			cmds = append(cmds, cmd)
		}
	}

	return m, tea.Batch(cmds...)
}

func (m Model) refreshInfoPanel() tea.Cmd {
	return func() tea.Msg {
		return infopanel.RefreshMsg{}
	}
}

func (m Model) View() string {
	return renderLayout(m)
}
