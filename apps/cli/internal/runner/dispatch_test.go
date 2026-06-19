package runner

import (
	"testing"

	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/project"
)

func TestDispatchKnownType(t *testing.T) {
	cfg := &config.WorkspaceConfig{
		TaskTypes: map[string]string{
			"backend-api":  "be",
			"frontend-web": "fe",
		},
	}
	node := TaskNode{Project: project.Project{Name: "api", Type: "backend-api"}, Task: "test"}
	got, err := Dispatch(node, cfg, "be", "test")
	if err != nil {
		t.Fatal(err)
	}
	want := "be test --project=api"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestDispatchCustomWithPlaceholder(t *testing.T) {
	node := TaskNode{Project: project.Project{Name: "api", Type: "backend-api"}, Task: "deploy"}
	got, err := DispatchCustom(node, "kubectl apply -f %s.yaml")
	if err != nil {
		t.Fatal(err)
	}
	want := "kubectl apply -f api.yaml"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestDispatchCustomNoPlaceholder(t *testing.T) {
	node := TaskNode{Project: project.Project{Name: "api", Type: "backend-api"}, Task: "deploy"}
	got, err := DispatchCustom(node, "make deploy")
	if err != nil {
		t.Fatal(err)
	}
	want := "make deploy --project=api"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}
