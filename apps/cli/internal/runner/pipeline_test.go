package runner

import (
	"testing"

	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/project"
)

func TestResolvePlanUpstreamDeps(t *testing.T) {
	taskDef := config.TaskDefinition{
		Command:   "go test",
		DependsOn: []string{"^build"},
	}
	projects := []project.Project{
		{Name: "api", Path: "apps/api", Dependencies: []string{"shared"}},
		{Name: "shared", Path: "libs/shared"},
	}
	plan, err := ResolvePlan("api", "test", taskDef, projects)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan) != 2 {
		t.Errorf("got %d nodes, want 2: %+v", len(plan), plan)
	}
	// shared should come first (upstream)
	if plan[0].Project.Name != "shared" {
		t.Errorf("first node should be shared, got %s", plan[0].Project.Name)
	}
}

func TestResolvePlanPlainDep(t *testing.T) {
	taskDef := config.TaskDefinition{
		Command:   "deploy.sh",
		DependsOn: []string{"test"},
	}
	projects := []project.Project{{Name: "api", Path: "apps/api"}}
	plan, err := ResolvePlan("api", "deploy", taskDef, projects)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan) != 2 {
		t.Errorf("got %d nodes, want 2: %+v", len(plan), plan)
	}
}
