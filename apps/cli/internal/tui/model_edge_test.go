package tui

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/raizora/radas/v4/internal/tui/components/infopanel"
)

func TestModel_FocusTransitions(t *testing.T) {
	m := NewModel(nil, nil, nil)

	// Initial state: input is auto-focused
	if m.focus != focusInput {
		t.Errorf("expected focusInput, got %v", m.focus)
	}
	if !m.chatView.InputFocused() {
		t.Errorf("expected chatView input to be focused initially")
	}

	// Typing 'h' directly should work (no ':' needed)
	typeMsg := tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'h'}}
	updated, _ := m.Update(typeMsg)
	m2 := updated.(Model)
	if m2.chatView.Input() != "h" {
		t.Errorf("expected input 'h', got %q", m2.chatView.Input())
	}

	// Press ':' when already focused: types ':' into textarea
	colonMsg := tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(":")}
	updated, _ = m2.Update(colonMsg)
	m3 := updated.(Model)
	if m3.chatView.Input() != "h:" {
		t.Errorf("expected input 'h:', got %q", m3.chatView.Input())
	}
	if m3.focus != focusInput {
		t.Errorf("should still be focusInput after ':'")
	}
}

func TestModel_NetworkCheckUpdatesStatusBar(t *testing.T) {
	m := NewModel(nil, nil, nil)

	msg := infopanel.NetworkCheckMsg{Connected: true}
	updated, _ := m.Update(msg)
	m2 := updated.(Model)

	view := m2.View()
	if view == "" {
		t.Errorf("View should not be empty")
	}
}

func TestModel_RefreshInfoPanel(t *testing.T) {
	m := NewModel(nil, nil, nil)
	m.focus = focusInfo
	m.infoPanel = m.infoPanel.SetFocused(true)

	msg := tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("r")}
	_, cmd := m.Update(msg)
	if cmd == nil {
		t.Errorf("Expected a command for RefreshInfo")
	}
	if cmd != nil {
		resultMsg := cmd()
		if _, ok := resultMsg.(infopanel.RefreshMsg); !ok {
			t.Errorf("Expected infopanel.RefreshMsg, got %T", resultMsg)
		}
	}
}

func TestChatView_EmptyInputSubmission(t *testing.T) {
	m := NewModel(nil, nil, nil)
	// Input is auto-focused now

	msg := tea.KeyMsg{Type: tea.KeyEnter}
	updated, cmd := m.Update(msg)

	if cmd != nil {
		t.Errorf("Expected nil cmd on empty input")
	}

	m2 := updated.(Model)
	if len(m2.chatView.messages) > 0 {
		t.Errorf("Expected no messages, got %d", len(m2.chatView.messages))
	}
}
