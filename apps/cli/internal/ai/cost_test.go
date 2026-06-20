package ai

import (
	"testing"
)

func TestCostTracker_UnderCeiling(t *testing.T) {
	ct := NewCostTracker(0.10)
	if err := ct.Check(); err != nil {
		t.Fatal(err)
	}
	ct.Add(0.05)
	if err := ct.Check(); err != nil {
		t.Fatal(err)
	}
}

func TestCostTracker_OverCeiling(t *testing.T) {
	ct := NewCostTracker(0.10)
	ct.Add(0.15)
	if err := ct.Check(); err == nil {
		t.Error("expected error for over ceiling")
	}
}

func TestCostTracker_Reset(t *testing.T) {
	ct := NewCostTracker(0.10)
	ct.Add(0.15)
	ct.Reset()
	if err := ct.Check(); err != nil {
		t.Fatal(err)
	}
}

func TestDefaultModelCosts(t *testing.T) {
	costs := DefaultModelCosts()
	if _, ok := costs["gpt-4o"]; !ok {
		t.Error("gpt-4o not in default costs")
	}
	if _, ok := costs["deepseek/deepseek-chat"]; !ok {
		t.Error("deepseek/deepseek-chat not in default costs")
	}
}
