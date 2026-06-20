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
