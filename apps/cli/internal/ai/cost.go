package ai

import (
	"fmt"
	"sync"
)

type ModelCost struct {
	Input  float64
	Output float64
}

func DefaultModelCosts() map[string]ModelCost {
	return map[string]ModelCost{
		"gpt-4o":                 {Input: 0.0025, Output: 0.010},
		"gpt-4o-mini":            {Input: 0.00015, Output: 0.0006},
		"deepseek/deepseek-chat": {Input: 0.00027, Output: 0.00110},
	}
}

type CostTracker struct {
	mu      sync.Mutex
	ceiling float64
	cost    float64
}

func NewCostTracker(ceiling float64) *CostTracker {
	return &CostTracker{ceiling: ceiling}
}

func (ct *CostTracker) Check() error {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	if ct.cost >= ct.ceiling {
		return fmt.Errorf("cost ceiling reached ($%.2f of $%.2f)", ct.cost, ct.ceiling)
	}
	return nil
}

func (ct *CostTracker) Add(cost float64) {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	ct.cost += cost
}

func (ct *CostTracker) Reset() {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	ct.cost = 0
}
