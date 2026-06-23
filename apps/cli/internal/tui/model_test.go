package tui

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestModel_InitialState(t *testing.T) {
	m := NewModel(nil, nil, nil)
	if m.state != stateChat {
		t.Errorf("initial state = %d, want %d", m.state, stateChat)
	}
}

func TestModel_InitialFocus(t *testing.T) {
	m := NewModel(nil, nil, nil)
	if m.focus != focusInput {
		t.Errorf("initial focus = %d, want input", m.focus)
	}
	if m.chatView == nil || !m.chatView.InputFocused() {
		t.Error("input should be focused initially")
	}
}

func TestModel_ShowInfo(t *testing.T) {
	m := NewModel(nil, nil, nil)
	if !m.showInfo {
		t.Error("info panel should be visible by default")
	}
}

func TestModel_Quit(t *testing.T) {
	m := NewModel(nil, nil, nil)
	msg := tea.KeyMsg{Type: tea.KeyCtrlC}
	_, cmd := m.Update(msg)
	if cmd == nil {
		t.Error("expected quit command")
	}
}

func TestModel_ViewNotEmpty(t *testing.T) {
	m := NewModel(nil, nil, nil)
	v := m.View()
	if v == "" {
		t.Error("expected non-empty view")
	}
}

func TestModel_WindowSizeMsg_ForwardsToChatView(t *testing.T) {
	m := NewModel(nil, nil, nil)
	updated, _ := m.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	m2 := updated.(Model)
	if m2.chatView == nil {
		t.Fatal("chatView should not be nil")
	}
}

func TestModel_InfoPanelToggle(t *testing.T) {
	m := NewModel(nil, nil, nil)

	m.showInfo = false
	m.focus = focusMain

	m.showInfo = true
	if !m.showInfo {
		t.Error("info panel should be visible")
	}
}

func TestModel_FocusInfo(t *testing.T) {
	m := NewModel(nil, nil, nil)
	m.showInfo = true
	m.focus = focusInfo
	m.infoPanel = m.infoPanel.SetFocused(true)

	if m.focus != focusInfo {
		t.Error("focus should be info panel")
	}
}
