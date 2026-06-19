package web

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/raizora/radas/v4/internal/graph"
	"github.com/raizora/radas/v4/internal/project"
)

func TestGraphEndpoint(t *testing.T) {
	projects := []project.Project{
		{Name: "api", Type: "backend-api", Dependencies: []string{"shared"}},
		{Name: "shared", Type: "lib"},
	}
	g, _ := graph.Build(projects)
	s := NewServer(g, "")
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/graph")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status=%d", resp.StatusCode)
	}
	var data GraphData
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		t.Fatal(err)
	}
	if len(data.Nodes) != 2 {
		t.Errorf("nodes=%d", len(data.Nodes))
	}
	if len(data.Edges) != 1 {
		t.Errorf("edges=%d", len(data.Edges))
	}
}
