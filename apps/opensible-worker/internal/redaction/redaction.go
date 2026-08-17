// Package redaction provides the worker's shared secret-redaction semantics.
package redaction

import (
	"reflect"
	"regexp"
	"strings"
)

const Redacted = "[REDACTED]"

var (
	privateKeyPattern = regexp.MustCompile(`(?is)-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----`)
	bearerPattern     = regexp.MustCompile(`(?i)\bBearer[ \t]+[^\s,;]+`)
	assignmentPattern = regexp.MustCompile(`(?i)\b(?:password|credential|credentials|token|secret|api[_-]?key|access[_-]?key|private[ _-]?key|authorization|bearer)\b[ \t]*(?:=|:)[ \t]*(?:"[^"]*"|'[^']*'|[^\s,;]+)`)
	naturalPattern    = regexp.MustCompile(`(?i)\b(?:password|credential|credentials|token|secret|api[_-]?key|access[_-]?key|private[ _-]?key|authorization|bearer)\b[ \t]+(?:(?:is|was|equals|equal[ \t]+to)[ \t]+)?(?:"[^"]*"|'[^']*'|[^\s,;.]+)`)
)

func redactMatch(match string) string {
	// Preserve the field name and delimiter, but never preserve the value.
	for i, r := range match {
		if r == '=' || r == ':' {
			return match[:i+1] + redactValueTail(match[i+1:])
		}
	}
	lower := strings.ToLower(match)
	for _, word := range []string{" is ", " was ", " equals ", " equal to "} {
		if i := strings.Index(lower, word); i >= 0 {
			return match[:i+len(word)] + redactValueTail(match[i+len(word):])
		}
	}
	if i := strings.IndexAny(match, " \t"); i >= 0 {
		return match[:i+1] + Redacted
	}
	return Redacted
}

func redactValueTail(tail string) string {
	trimmed := strings.TrimLeft(tail, " \t")
	prefix := tail[:len(tail)-len(trimmed)]
	if len(trimmed) >= 2 && ((trimmed[0] == '"' && trimmed[len(trimmed)-1] == '"') || (trimmed[0] == '\'' && trimmed[len(trimmed)-1] == '\'')) {
		return prefix + string(trimmed[0]) + Redacted + string(trimmed[len(trimmed)-1])
	}
	return prefix + Redacted
}

// Text redacts private keys, bearer credentials, and credential-like values in
// assignment and natural-language forms. It is safe for logs and HTTP fields.
func Text(input string) string {
	result := privateKeyPattern.ReplaceAllString(input, Redacted)
	result = bearerPattern.ReplaceAllString(result, "Bearer "+Redacted)
	result = assignmentPattern.ReplaceAllStringFunc(result, redactMatch)
	return naturalPattern.ReplaceAllStringFunc(result, redactMatch)
}

func sensitiveKey(key string) bool {
	compact := strings.ToLower(strings.NewReplacer("-", "", "_", "", ".", "", " ", "").Replace(key))
	for _, candidate := range []string{"password", "credential", "credentials", "token", "secret", "apikey", "accesskey", "privatekey", "authorization", "bearer"} {
		if strings.Contains(compact, candidate) {
			return true
		}
	}
	return false
}

// Value recursively redacts map keys, arrays, slices, and strings. JSON-shaped
// values are returned as map[string]any/[]any; other values are copied where
// possible and left untouched when they are not recursively representable.
func Value(input any) any {
	switch typed := input.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, child := range typed {
			if sensitiveKey(key) {
				out[key] = Redacted
			} else {
				out[key] = Value(child)
			}
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, child := range typed {
			out[i] = Value(child)
		}
		return out
	case string:
		return Text(typed)
	}
	return valueReflect(input)
}

func valueReflect(input any) any {
	if input == nil {
		return nil
	}
	v := reflect.ValueOf(input)
	switch v.Kind() {
	case reflect.Map:
		if v.Type().Key().Kind() != reflect.String {
			return input
		}
		out := make(map[string]any, v.Len())
		iter := v.MapRange()
		for iter.Next() {
			key := iter.Key().String()
			if sensitiveKey(key) {
				out[key] = Redacted
			} else {
				out[key] = Value(iter.Value().Interface())
			}
		}
		return out
	case reflect.Slice, reflect.Array:
		out := make([]any, v.Len())
		for i := 0; i < v.Len(); i++ {
			out[i] = Value(v.Index(i).Interface())
		}
		return out
	default:
		return input
	}
}
