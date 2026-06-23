package tui

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestModel_RuntimeTyping(t *testing.T) {
	// Simulate the exact runtime flow:
	// 1. WindowSizeMsg arrives
	// 2. User types directly (input is auto-focused)

	m := NewModel(nil, nil, nil)

	// Step 1: WindowSizeMsg (simulates a terminal of 120x40)
	updated, _ := m.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	m = updated.(Model)

	t.Logf("After WindowSizeMsg: ready=%v, chatView.width=%d, chatView.height=%d",
		m.chatView.ready, m.chatView.width, m.chatView.height)
	t.Logf("dimensions: main=%dx%d, sidebar=%dx%d, info=%dx%d",
		m.dimensions.MainContentWidth, m.dimensions.MainContentHeight,
		m.dimensions.SidebarWidth, m.dimensions.SidebarHeight,
		m.dimensions.InfoPanelWidth, m.dimensions.InfoPanelHeight)
	t.Logf("focus=%v, showInfo=%v, showSidebar=%v", m.focus, m.showInfo, m.showSidebar)

	if m.focus != focusInput {
		t.Errorf("expected focusInput, got %v", m.focus)
	}
	if !m.chatView.InputFocused() {
		t.Errorf("expected chatView input to be focused")
	}

	// Step 2: Type 'hello' directly (no ':' needed)
	for _, r := range "hello" {
		typeMsg := tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{r}}
		updated, _ = m.Update(typeMsg)
		m = updated.(Model)
		t.Logf("After %q: Input=%q", string(r), m.chatView.Input())
	}

	if m.chatView.Input() != "hello" {
		t.Errorf("expected input 'hello', got %q", m.chatView.Input())
	}

	// Step 3: Render the view and check it contains the typed text
	view := m.View()
	t.Logf("View output:\n%s", view)

	if !strings.Contains(view, "hello") {
		t.Errorf("expected view to contain 'hello', got:\n%s", view)
	}
}

func TestModel_RuntimeTyping_DimensionsEffects(t *testing.T) {
	sizes := []struct {
		w, h int
		name string
	}{
		{120, 40, "large"},
		{80, 24, "standard"},
		{60, 20, "small"},
	}

	for _, sz := range sizes {
		t.Run(sz.name, func(t *testing.T) {
			m := NewModel(nil, nil, nil)
			updated, _ := m.Update(tea.WindowSizeMsg{Width: sz.w, Height: sz.h})
			m = updated.(Model)

			for _, r := range "hello" {
				typeMsg := tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{r}}
				updated, _ = m.Update(typeMsg)
				m = updated.(Model)
			}

			if m.chatView.Input() != "hello" {
				t.Errorf("[%s] expected input 'hello', got %q", sz.name, m.chatView.Input())
			}

			view := m.View()
			if !strings.Contains(view, "hello") {
				t.Errorf("[%s] expected view to contain 'hello', view:\n%s", sz.name, view)
			}
		})
	}
}

func TestModel_KeyRouting_Debug(t *testing.T) {
	// Test 1: forwardToChildren path (direct)
	mA := NewModel(nil, nil, nil)
	mA2, _ := mA.forwardToChildren(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'h'}})
	t.Logf("forwardToChildren: Input=%q", mA2.chatView.Input())
	if mA2.chatView.Input() != "h" {
		t.Errorf("expected 'h', got %q", mA2.chatView.Input())
	}

	// Test 2: handleKeyMsg path (full routing)
	mB := NewModel(nil, nil, nil)
	mB, _ = mB.handleKeyMsg(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'h'}})
	t.Logf("handleKeyMsg: Input=%q, focus=%v", mB.chatView.Input(), mB.focus)
	if mB.chatView.Input() != "h" {
		t.Errorf("expected 'h' via handleKeyMsg, got %q", mB.chatView.Input())
	}
}

func TestModel_FocusInput_MultiplePresses(t *testing.T) {
	// Input starts auto-focused. Pressing ':' types it.
	m := NewModel(nil, nil, nil)

	if !m.chatView.InputFocused() {
		t.Fatal("expected input auto-focused")
	}

	// Press ':' — should type the character since already focused
	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(":")})
	m = updated.(Model)

	if !m.chatView.InputFocused() {
		t.Fatal("expected still focused")
	}
	if m.chatView.Input() != ":" {
		t.Errorf("expected ':' typed, got %q", m.chatView.Input())
	}

	// Type 'a'
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'a'}})
	m = updated.(Model)
	if m.chatView.Input() != ":a" {
		t.Errorf("expected ':a', got %q", m.chatView.Input())
	}

	// Press ':' again — types another ':'
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(":")})
	m = updated.(Model)
	if m.chatView.Input() != ":a:" {
		t.Errorf("expected ':a:', got %q", m.chatView.Input())
	}
}

func TestModel_SendMessage_Typing(t *testing.T) {
	m := NewModel(nil, nil, nil)
	updated, _ := m.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	m = updated.(Model)

	// Type a message (input is auto-focused)
	for _, r := range "ping" {
		updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{r}})
		m = updated.(Model)
	}

	if m.chatView.Input() != "ping" {
		t.Fatalf("expected 'ping', got %q", m.chatView.Input())
	}

	// Send message
	updated, cmd := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = updated.(Model)

	t.Logf("After Enter: Input=%q, messages=%d, cmd=%v",
		m.chatView.Input(), len(m.chatView.messages), cmd != nil)

	if cmd == nil {
		t.Errorf("expected non-nil cmd for message send")
	}

	if len(m.chatView.messages) == 0 {
		t.Log("WARNING: messages is empty after send — checking if AddUserMessage was called")
		t.Logf("focus=%v, InputFocused=%v, Input=%q", m.focus, m.chatView.InputFocused(), m.chatView.Input())
	}

	// Type again after sending
	for _, r := range "next" {
		updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{r}})
		m = updated.(Model)
	}
	t.Logf("After typing 'next': Input=%q", m.chatView.Input())
	if m.chatView.Input() != "next" {
		t.Errorf("expected 'next', got %q", m.chatView.Input())
	}
}


