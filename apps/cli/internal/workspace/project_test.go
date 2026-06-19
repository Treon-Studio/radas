package workspace

import (
	"encoding/json"
	"testing"
)

func TestProjectJSON(t *testing.T) {
	p := Project{Name: "api", Type: "backend-api", Path: "apps/api", Dependencies: []string{"shared"}}
	data, _ := json.Marshal(p)
	want := `{"name":"api","type":"backend-api","path":"apps/api","dependencies":["shared"]}`
	if string(data) != want {
		t.Errorf("Marshal = %s, want %s", data, want)
	}
}

func TestProjectID(t *testing.T) {
	if (Project{Name: "api"}).ID() != "api" {
		t.Error("ID() wrong")
	}
}
