package ignore

import (
	"strings"
	"testing"
)

func TestMergePatterns_EmptyBoth(t *testing.T) {
	got, err := MergePatterns("", "", false)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "" {
		t.Errorf("expected empty, got %q", got)
	}
}

func TestMergePatterns_EmptyExisting(t *testing.T) {
	template := "# header\nnode_modules/\n"
	got, err := MergePatterns("", template, false)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.Contains(got, "radas-managed") {
		t.Error("expected radas-managed header on first write")
	}
	if !strings.Contains(got, "node_modules/") {
		t.Error("expected template content")
	}
}

func TestMergePatterns_EmptyTemplate(t *testing.T) {
	existing := "node_modules/\n*.log\n"
	got, err := MergePatterns(existing, "", false)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != existing {
		t.Errorf("expected existing unchanged, got %q", got)
	}
}

func TestMergePatterns_NoOverlap(t *testing.T) {
	existing := "node_modules/\n"
	template := "dist/\n"
	got, err := MergePatterns(existing, template, false)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.Contains(got, "node_modules/") {
		t.Error("existing missing")
	}
	if !strings.Contains(got, "dist/") {
		t.Error("template missing")
	}
	if strings.Index(got, "node_modules/") > strings.Index(got, "dist/") {
		t.Error("expected existing before template in output")
	}
}

func TestMergePatterns_FullOverlap(t *testing.T) {
	existing := "node_modules/\ndist/\n"
	template := "node_modules/\ndist/\n"
	got, err := MergePatterns(existing, template, false)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != existing {
		t.Errorf("expected unchanged, got %q", got)
	}
}

func TestMergePatterns_PartialOverlap(t *testing.T) {
	existing := "node_modules/\n*.log\n"
	template := "node_modules/\ndist/\n*.log\n"
	got, err := MergePatterns(existing, template, false)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.Contains(got, "node_modules/") {
		t.Error("missing node_modules/")
	}
	if !strings.Contains(got, "dist/") {
		t.Error("missing dist/")
	}
	if strings.Index(got, "dist/") < strings.Index(got, "*.log") {
		t.Error("dist/ should be appended after existing lines")
	}
	if strings.Count(got, "node_modules/") > 1 {
		t.Errorf("node_modules/ appears %d times, expected 1", strings.Count(got, "node_modules/"))
	}
}

func TestMergePatterns_UserCustomPreserved(t *testing.T) {
	existing := "node_modules/\n# My custom: don't ignore .env.example\n.env.example\n"
	template := "node_modules/\ndist/\n"
	got, err := MergePatterns(existing, template, false)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.Contains(got, ".env.example") {
		t.Error("user custom line '.env.example' was lost")
	}
	if !strings.Contains(got, "My custom") {
		t.Error("user comment was lost")
	}
}

func TestMergePatterns_Force(t *testing.T) {
	existing := "node_modules/\n# user custom\n"
	template := "dist/\n"
	got, err := MergePatterns(existing, template, true)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if strings.Contains(got, "user custom") {
		t.Error("force=true should drop user customizations")
	}
	if !strings.Contains(got, "dist/") {
		t.Error("force should write template")
	}
	if strings.Contains(got, "node_modules/") {
		t.Error("force should drop existing (template had no node_modules/)")
	}
}

func TestMergePatterns_Idempotent(t *testing.T) {
	existing := "node_modules/\n"
	template := "node_modules/\ndist/\n"
	first, _ := MergePatterns(existing, template, false)
	second, _ := MergePatterns(first, template, false)
	if first != second {
		t.Errorf("not idempotent:\nfirst:  %q\nsecond: %q", first, second)
	}
}
