package tui

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestChatView_Init(t *testing.T) {
	c := NewChatView(nil)
	cmd := c.Init()
	_ = cmd
}

func TestChatView_UpdateWindowSize(t *testing.T) {
	c := NewChatView(nil)
	updated, _ := c.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	if updated == nil {
		t.Error("expected non-nil updated model")
	}
}

func TestChatView_ViewNotEmpty(t *testing.T) {
	c := NewChatView(nil)
	v := c.View()
	if v == "" {
		t.Error("expected non-empty view")
	}
}

func TestChatView_AddUserMessage(t *testing.T) {
	c := NewChatView(nil)
	c.AddUserMessage("hello world")
	v := c.View()
	if v == "" {
		t.Error("expected non-empty view after user message")
	}
}

func TestChatView_AddAIMessage(t *testing.T) {
	c := NewChatView(nil)
	c.AddUserMessage("hi")
	c.AddAIMessage("hello there")
	v := c.View()
	if v == "" {
		t.Error("expected non-empty view after AI message")
	}
}

func TestChatView_UpdateStreaming(t *testing.T) {
	c := NewChatView(nil)
	c.UpdateStreaming("hel")
	c.UpdateStreaming("lo")
	v := c.View()
	if v == "" {
		t.Error("expected non-empty view with streaming")
	}
}
