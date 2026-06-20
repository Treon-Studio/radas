package tui

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestModel_InitialState(t *testing.T) {
	m := NewModel(nil, nil, nil)
	if m.state != stateDashboard {
		t.Errorf("initial state = %d, want %d", m.state, stateDashboard)
	}
}

func TestModel_TabSwitch(t *testing.T) {
	m := NewModel(nil, nil, nil)

	if m.state != stateDashboard {
		t.Fatal("expected dashboard")
	}

	msg := tea.KeyMsg{Type: tea.KeyTab}
	updated, _ := m.Update(msg)
	m2 := updated.(Model)
	if m2.state != stateChat {
		t.Errorf("state = %d, want chat", m2.state)
	}

	updated2, _ := m2.Update(msg)
	m3 := updated2.(Model)
	if m3.state != stateDashboard {
		t.Errorf("state = %d, want dashboard", m3.state)
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
	if !m2.chatView.ready {
		t.Error("chatView should be ready after WindowSizeMsg")
	}
	if m2.chatView.viewport.Width != 96 {
		t.Errorf("chatView.viewport.Width = %d, want 96", m2.chatView.viewport.Width)
	}
}
