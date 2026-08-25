package redaction

import (
	"fmt"
	"strings"
	"testing"
)

func TestTextRedactsNaturalLanguageAndBearerForms(t *testing.T) {
	input := `password=one password: "two" credential is 'three' token was four secret equals five api_key: six access_key=seven private_key is "eight" Bearer bearer-secret`
	got := Text(input)
	for _, secret := range []string{"one", "two", "three", "four", "five", "six", "seven", "eight", "bearer-secret"} {
		if strings.Contains(got, secret) {
			t.Fatalf("secret %q leaked in %q", secret, got)
		}
	}
	if strings.Count(got, Redacted) < 9 {
		t.Fatalf("redactions=%q", got)
	}
}

func TestValueRedactsNestedMapsArraysAndNaturalLanguageStrings(t *testing.T) {
	input := map[string]any{
		"outer": []any{
			map[string]any{"password": "raw", "message": "token: 'nested'"},
			[]any{map[string]any{"api-key": "raw-key", "safe": "ok"}},
		},
	}
	got := Value(input).(map[string]any)
	serialized := fmt.Sprintf("%#v", got)
	for _, secret := range []string{"raw", "nested", "raw-key"} {
		if strings.Contains(serialized, secret) {
			t.Fatalf("nested secret %q leaked: %#v", secret, got)
		}
	}
}
