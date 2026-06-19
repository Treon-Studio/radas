package generator

import (
	"testing"
)

func TestResolve_AllProvided(t *testing.T) {
	def := &Definition{
		Variables: []Variable{
			{Name: "name", Default: "app"},
			{Name: "port", Default: "8080"},
		},
	}
	overrides := map[string]string{
		"name": "myapp",
		"port": "3000",
	}
	result, err := ResolveVariables(def, overrides, true)
	if err != nil {
		t.Fatal(err)
	}
	if result["name"] != "myapp" {
		t.Errorf("name = %q, want %q", result["name"], "myapp")
	}
	if result["port"] != "3000" {
		t.Errorf("port = %q, want %q", result["port"], "3000")
	}
}

func TestResolve_NonInteractiveDefaults(t *testing.T) {
	def := &Definition{
		Variables: []Variable{
			{Name: "name", Default: "app"},
			{Name: "port", Default: "8080"},
		},
	}
	result, err := ResolveVariables(def, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if result["name"] != "app" {
		t.Errorf("name = %q, want %q", result["name"], "app")
	}
	if result["port"] != "8080" {
		t.Errorf("port = %q, want %q", result["port"], "8080")
	}
}

func TestResolve_NonInteractiveNoDefault(t *testing.T) {
	def := &Definition{
		Variables: []Variable{
			{Name: "name", Default: "app"},
			{Name: "port"}, // no default
		},
	}
	result, err := ResolveVariables(def, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if result["port"] != "" {
		t.Errorf("port = %q, want empty string", result["port"])
	}
}

func TestResolve_PartialOverride(t *testing.T) {
	def := &Definition{
		Variables: []Variable{
			{Name: "name", Default: "app"},
			{Name: "port", Default: "8080"},
		},
	}
	overrides := map[string]string{"name": "myapp"}
	result, err := ResolveVariables(def, overrides, true)
	if err != nil {
		t.Fatal(err)
	}
	if result["name"] != "myapp" {
		t.Errorf("name = %q, want %q", result["name"], "myapp")
	}
	if result["port"] != "8080" {
		t.Errorf("port = %q, want %q", result["port"], "8080")
	}
}

func TestResolve_ValidationMatch(t *testing.T) {
	def := &Definition{
		Variables: []Variable{
			{Name: "port", Default: "8080", Validate: "^\\d+$"},
		},
	}
	result, err := ResolveVariables(def, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if result["port"] != "8080" {
		t.Errorf("port = %q, want %q", result["port"], "8080")
	}
}

func TestResolve_ValidationMismatch(t *testing.T) {
	def := &Definition{
		Variables: []Variable{
			{Name: "port", Default: "abc", Validate: "^\\d+$"},
		},
	}
	_, err := ResolveVariables(def, nil, true)
	if err == nil {
		t.Fatal("expected error for validation mismatch")
	}
}

func TestResolve_OverrideValidation(t *testing.T) {
	def := &Definition{
		Variables: []Variable{
			{Name: "port", Validate: "^\\d+$"},
		},
	}
	// Override with invalid value
	_, err := ResolveVariables(def, map[string]string{"port": "abc"}, true)
	if err == nil {
		t.Fatal("expected error for invalid override")
	}

	// Override with valid value
	result, err := ResolveVariables(def, map[string]string{"port": "3000"}, true)
	if err != nil {
		t.Fatal(err)
	}
	if result["port"] != "3000" {
		t.Errorf("port = %q, want %q", result["port"], "3000")
	}
}

func TestResolve_InvalidRegex(t *testing.T) {
	def := &Definition{
		Variables: []Variable{
			{Name: "x", Default: "y", Validate: "[invalid"},
		},
	}
	_, err := ResolveVariables(def, nil, true)
	if err == nil {
		t.Fatal("expected error for invalid regex")
	}
}

func TestResolve_OverrideExtraVars(t *testing.T) {
	def := &Definition{
		Variables: []Variable{
			{Name: "name"},
		},
	}
	overrides := map[string]string{"name": "myapp", "extra": "ignored"}
	result, err := ResolveVariables(def, overrides, true)
	if err != nil {
		t.Fatal(err)
	}
	if result["name"] != "myapp" {
		t.Errorf("name = %q, want %q", result["name"], "myapp")
	}
	if _, ok := result["extra"]; ok {
		t.Error("extra variable should not be in result")
	}
}
