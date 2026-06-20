package runner

import "testing"

// TestScheduleBatches: 4 tasks with DAG a -> b, c; b -> d; c -> d
// In our model, a -> b means "a depends on b". So d (no deps) runs first,
// then b and c in parallel, then a.
func TestScheduleBatches(t *testing.T) {
	tasks := []TaskNode{
		{Project: projectWithDeps("a", []string{"b", "c"}), Task: "build"},
		{Project: projectWithDeps("b", []string{"d"}), Task: "build"},
		{Project: projectWithDeps("c", []string{"d"}), Task: "build"},
		{Project: projectWithDeps("d", nil), Task: "build"},
	}
	batches, err := Schedule(tasks)
	if err != nil {
		t.Fatal(err)
	}
	if len(batches) != 3 {
		t.Errorf("got %d batches, want 3: %+v", len(batches), batches)
	}
	// First batch should contain "d" (no deps — runs first)
	found := false
	for _, n := range batches[0] {
		if n.Project.Name == "d" {
			found = true
		}
	}
	if !found {
		t.Error("first batch missing d (no-deps node)")
	}
	// Second batch should contain both b and c
	if len(batches[1]) != 2 {
		t.Errorf("second batch should have 2 nodes (b, c), got %d", len(batches[1]))
	}
	// Last batch should contain a (depends on both b and c)
	if batches[2][0].Project.Name != "a" {
		t.Errorf("last batch should be a, got %s", batches[2][0].Project.Name)
	}
}

func TestScheduleLinear(t *testing.T) {
	tasks := []TaskNode{
		{Project: projectWithDeps("a", []string{"b"}), Task: "test"},
		{Project: projectWithDeps("b", []string{"c"}), Task: "test"},
		{Project: projectWithDeps("c", nil), Task: "test"},
	}
	batches, _ := Schedule(tasks)
	if len(batches) != 3 {
		t.Errorf("linear chain should produce 3 batches, got %d", len(batches))
	}
	// c runs first (no deps), then b, then a
	if batches[0][0].Project.Name != "c" {
		t.Errorf("first batch should be c, got %s", batches[0][0].Project.Name)
	}
	if batches[2][0].Project.Name != "a" {
		t.Errorf("last batch should be a, got %s", batches[2][0].Project.Name)
	}
}
