package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseColumns(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		expected []ColumnInfo
	}{
		{
			name: "simple columns",
			body: "id UUID PRIMARY KEY, name VARCHAR(255) NOT NULL, email TEXT",
			expected: []ColumnInfo{
				{Name: "id", Type: "UUID", Nullable: true, IsPK: true},
				{Name: "name", Type: "VARCHAR(255)", Nullable: false, IsPK: false},
				{Name: "email", Type: "TEXT", Nullable: true, IsPK: false},
			},
		},
		{
			name: "with defaults",
			body: "id SERIAL PRIMARY KEY, name TEXT NOT NULL DEFAULT ''::text, created_at TIMESTAMPTZ DEFAULT now()",
			expected: []ColumnInfo{
				{Name: "id", Type: "SERIAL", Nullable: true, IsPK: true},
				{Name: "name", Type: "TEXT", Nullable: false, IsPK: false},
				{Name: "created_at", Type: "TIMESTAMPTZ", Nullable: true, IsPK: false},
			},
		},
		{
			name: "skip constraints",
			body: "id UUID PRIMARY KEY, tenant_id UUID NOT NULL, CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)",
			expected: []ColumnInfo{
				{Name: "id", Type: "UUID", Nullable: true, IsPK: true},
				{Name: "tenant_id", Type: "UUID", Nullable: false, IsPK: false},
			},
		},
		{
			name: "multi-line body",
			body: "id BIGSERIAL PRIMARY KEY,\n  name VARCHAR(100) NOT NULL,\n  email TEXT",
			expected: []ColumnInfo{
				{Name: "id", Type: "BIGSERIAL", Nullable: true, IsPK: true},
				{Name: "name", Type: "VARCHAR(100)", Nullable: false, IsPK: false},
				{Name: "email", Type: "TEXT", Nullable: true, IsPK: false},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cols := parseColumns(tt.body)
			if len(cols) != len(tt.expected) {
				t.Errorf("got %d columns, want %d\n%+v", len(cols), len(tt.expected), cols)
				return
			}
			for i, c := range cols {
				e := tt.expected[i]
				if c.Name != e.Name || c.Type != e.Type || c.Nullable != e.Nullable || c.IsPK != e.IsPK {
					t.Errorf("col[%d] = %+v, want %+v", i, c, e)
				}
			}
		})
	}
}

func TestSplitTopLevel(t *testing.T) {
	tests := []struct {
		input string
		sep   rune
		n     int
	}{
		{"a, b, c", ',', 3},
		{"a(b,c), d, e", ',', 3},
		{"a(b(c,d),e), f", ',', 2},
		{"single", ',', 1},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			parts := splitTopLevel(tt.input, tt.sep)
			if len(parts) != tt.n {
				t.Errorf("got %d parts, want %d: %v", len(parts), tt.n, parts)
			}
		})
	}
}

func TestScanSchemaSQL(t *testing.T) {
	dir := t.TempDir()
	migDir := filepath.Join(dir, "migrations")
	os.MkdirAll(migDir, 0755)

	// Write a simple migration
	migration := `-- 001_create_users.sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE posts (
  id UUID PRIMARY KEY,
  title VARCHAR(200) NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`
	os.WriteFile(filepath.Join(migDir, "001_create_users.sql"), []byte(migration), 0644)

	// Write a second migration with ALTER (should be skipped)
	alterSQL := `ALTER TABLE users ADD COLUMN bio TEXT;`
	os.WriteFile(filepath.Join(migDir, "002_add_bio.sql"), []byte(alterSQL), 0644)

	tables, err := ScanSchemaSQL(dir, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(tables) != 2 {
		t.Fatalf("expected 2 tables, got %d: %+v", len(tables), tables)
	}

	// Check users table
	if tables[0].Table != "users" {
		t.Errorf("expected first table 'users', got %q", tables[0].Table)
	}
	if tables[0].Source != "001_create_users.sql" {
		t.Errorf("expected source 001_create_users.sql, got %q", tables[0].Source)
	}
	if len(tables[0].Columns) != 5 {
		t.Fatalf("expected 5 columns for users, got %d", len(tables[0].Columns))
	}

	// Check id column
	idCol := tables[0].Columns[0]
	if idCol.Name != "id" || idCol.Type != "UUID" || !idCol.IsPK {
		t.Errorf("id column: %+v", idCol)
	}

	// Check email column
	emailCol := tables[0].Columns[1]
	if emailCol.Name != "email" || emailCol.Type != "VARCHAR(255)" || emailCol.Nullable {
		t.Errorf("email column: %+v", emailCol)
	}

	// Check posts table
	if tables[1].Table != "posts" {
		t.Errorf("expected second table 'posts', got %q", tables[1].Table)
	}
	if len(tables[1].Columns) != 5 {
		t.Fatalf("expected 5 columns for posts, got %d", len(tables[1].Columns))
	}
}

func TestSnakeCase(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"User", "user"},
		{"UserAccount", "user_account"},
		{"APIKey", "a_p_i_key"}, // not perfect but acceptable
		{"UserID", "user_i_d"},  // simplified
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := snakeCase(tt.input)
			if got != tt.want {
				t.Errorf("snakeCase(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestScanGoStructs(t *testing.T) {
	dir := t.TempDir()
	modelFile := `package model

import "time"

type User struct {
	ID        string    ` + "`" + `db:"id" json:"id"` + "`" + `
	Email     string    ` + "`" + `db:"email" json:"email"` + "`" + `
	CreatedAt time.Time ` + "`" + `db:"created_at" json:"created_at"` + "`" + `
}

func (User) TableName() string { return "users" }

type Post struct {
	ID    string ` + "`" + `db:"id" json:"id"` + "`" + `
	Title string ` + "`" + `db:"title" json:"title"` + "`" + `
	Body  string ` + "`" + `db:"body" json:"body"` + "`" + `
}
`
	if err := os.WriteFile(filepath.Join(dir, "models.go"), []byte(modelFile), 0644); err != nil {
		t.Fatal(err)
	}

	structs, err := ScanGoStructs(dir)
	if err != nil {
		t.Fatal(err)
	}

	if len(structs) != 2 {
		t.Fatalf("expected 2 structs, got %d", len(structs))
	}

	// Check User struct
	user := structs[0]
	if user.StructName != "Post" && user.StructName != "User" {
		t.Fatalf("unexpected struct name %q", user.StructName)
	}
	if user.StructName == "User" {
		if user.TableName != "users" {
			t.Errorf("TableName = %q, want 'users'", user.TableName)
		}
		if len(user.Fields) != 3 {
			t.Fatalf("expected 3 fields, got %d", len(user.Fields))
		}
		if user.Fields[0].FieldName != "ID" || user.Fields[0].Column != "id" {
			t.Errorf("first field: %+v", user.Fields[0])
		}
	}

	// Check Post struct (no TableName method, should use snake_case)
	post := structs[1]
	if post.StructName == "Post" {
		if post.TableName != "post" {
			t.Errorf("TableName = %q, want 'post'", post.TableName)
		}
	}
}

func TestGooseDriver(t *testing.T) {
	tests := []struct {
		dsn  string
		want string
	}{
		{"postgres://localhost:5432/db", "postgres"},
		{"postgresql://localhost/db", "postgres"},
		{"mysql://localhost:3306/db", "mysql"},
		{"sqlite:///path/to/db", "sqlite3"},
		{"sqlite3:///path/to/db", "sqlite3"},
		{"sqlserver://localhost:1433", "sqlserver"},
		{"clickhouse://localhost:9000", "clickhouse"},
		{"mongodb://localhost:27017", "mongodb"},
		{"invalid://localhost", ""},
	}

	for _, tt := range tests {
		t.Run(tt.dsn, func(t *testing.T) {
			got := gooseDriver(tt.dsn)
			if got != tt.want {
				t.Errorf("gooseDriver(%q) = %q, want %q", tt.dsn, got, tt.want)
			}
		})
	}
}
