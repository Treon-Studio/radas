package api

import "testing"

func TestExtractTSType(t *testing.T) {
	cases := []struct {
		schema string
		want   string
	}{
		{"", "any"},
		{"MyCustomType", "MyCustomType"},
		{"z.string()", "string"},
		{"z.number()", "number"},
		{"z.boolean()", "boolean"},
		{"z.array(z.string())", "any[]"},
		{"z.object({})", "Record<string, any>"},
		{"z.null()", "null"},
		{"z.string().nullable()", "string | null"},
		{"z.unknown()", "any"},
	}
	for _, c := range cases {
		got := extractTSType(c.schema)
		if got != c.want {
			t.Errorf("extractTSType(%q) = %q, want %q", c.schema, got, c.want)
		}
	}
}
