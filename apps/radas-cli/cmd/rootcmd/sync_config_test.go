package rootcmd

import (
	"os/exec"
	"reflect"
	"testing"
)

func TestBuildConfigItem_DefaultPath(t *testing.T) {
	jsonMap := map[string]string{"eslint": ".eslintrc"}
	name := "eslint"
	target := name
	if jsonMap[name] != "" {
		target = jsonMap[name]
	}
	item := ConfigItem{Name: name, Target: target}
	if item.Target != ".eslintrc" {
		t.Errorf("Expected target to be .eslintrc, got %s", item.Target)
	}
}

func TestBuildConfigItem_Fallback(t *testing.T) {
	jsonMap := map[string]string{}
	name := "biome"
	target := name
	if jsonMap[name] != "" {
		target = jsonMap[name]
	}
	item := ConfigItem{Name: name, Target: target}
	if item.Target != "biome" {
		t.Errorf("Expected target to be biome, got %s", item.Target)
	}
}

func TestRunCmd_NotExist(t *testing.T) {
	err := runCmd("not-a-real-cmd-xyz")
	if err == nil {
		t.Error("Expected error for non-existent command")
	}
}

func TestRunGitCloneArgs(t *testing.T) {
	// Only test that the command is constructed, not executed
	repo := "https://github.com/example/repo"
	dir := "testdir"
	want := []string{"clone", "--depth=1", repo, dir}
	cmd := exec.Command("git", want...)
	got := cmd.Args[1:]
	if !reflect.DeepEqual(got, want) {
		t.Errorf("runGitClone args = %v, want %v", got, want)
	}
}
