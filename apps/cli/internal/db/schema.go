package db

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/raizora/radas/v4/internal/config"
)

var colRE = regexp.MustCompile(`^\s*"?(\w+)"?\s+(.+)$`)
var typeConstraintRE = regexp.MustCompile(`(?is)\s+(?:NOT\s+NULL|PRIMARY\s+KEY|REFERENCES|UNIQUE|DEFAULT|CHECK|CONSTRAINT)\s+`)

type ColumnInfo struct {
	Name     string
	Type     string
	Nullable bool
	IsPK     bool
	Default  string
}

type TableInfo struct {
	Table   string
	Columns []ColumnInfo
	Source  string
}

// ScanSchemaSQL reads migration SQL files and extracts all CREATE TABLE definitions.
func ScanSchemaSQL(dir string, cfg *config.DBConfig) ([]TableInfo, error) {
	workDir := MigrationsDir(dir, cfg)
	entries, err := os.ReadDir(workDir)
	if err != nil {
		return nil, fmt.Errorf("read migrations dir: %w", err)
	}

	singleLine := regexp.MustCompile(`--.*`)
	multiLine := regexp.MustCompile(`/\*.*?\*/`)
	createRE := regexp.MustCompile(`(?is)\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(`)

	var tables []TableInfo

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(workDir, entry.Name()))
		if err != nil {
			continue
		}
		content := string(data)

		// Strip comments
		content = singleLine.ReplaceAllString(content, "")
		content = multiLine.ReplaceAllString(content, "")

		matches := createRE.FindAllStringSubmatchIndex(content, -1)
		for _, m := range matches {
			tableName := content[m[2]:m[3]]
			// Find matching close paren — scan from the opening paren
			parenStart := m[1] - 1 // index of '('
			for parenStart < len(content) && content[parenStart] != '(' {
				parenStart++
			}
			if parenStart >= len(content) {
				continue
			}
			depth := 0
			end := parenStart
			for end < len(content) {
				switch content[end] {
				case '(':
					depth++
				case ')':
					depth--
					if depth == 0 {
						goto foundEnd
					}
				}
				end++
			}
			continue
		foundEnd:
			body := content[parenStart+1 : end]

			columns := parseColumns(body)
			tables = append(tables, TableInfo{
				Table:   tableName,
				Columns: columns,
				Source:  entry.Name(),
			})
		}
	}

	sort.Slice(tables, func(i, j int) bool {
		return tables[i].Source < tables[j].Source
	})

	return tables, nil
}

func parseColumns(body string) []ColumnInfo {
	chunks := splitTopLevel(body, ',')
	var cols []ColumnInfo

	for _, chunk := range chunks {
		chunk = strings.TrimSpace(chunk)
		if chunk == "" {
			continue
		}

		upper := strings.ToUpper(chunk)

		// Skip constraint lines
		if hasPrefixAny(upper, "CONSTRAINT", "PRIMARY KEY", "FOREIGN KEY",
			"UNIQUE", "CHECK", "INDEX", "KEY ") {
			continue
		}

		// Parse inline PRIMARY KEY at end: "id UUID PRIMARY KEY"
		isPK := hasSuffixAny(upper, "PRIMARY KEY") ||
			strings.Contains(upper, "PRIMARY KEY")

		// Parse NOT NULL
		notNull := strings.Contains(upper, "NOT NULL")

		// Extract DEFAULT
		defaultVal := ""
		if idx := strings.Index(upper, "DEFAULT"); idx >= 0 {
			rest := strings.TrimSpace(chunk[idx+7:])
			// Strip trailing keywords
			rest = stripSuffixKeywords(rest)
			defaultVal = rest
		}

		// Remove known keywords from the end to get type
		cleaned := strings.TrimSpace(chunk)
		// Remove DEFAULT clause (case-insensitive)
		lower := strings.ToLower(cleaned)
		if idx := strings.Index(lower, " default "); idx >= 0 {
			cleaned = strings.TrimSpace(cleaned[:idx+1]) // keep the word before
			lower = strings.ToLower(cleaned)
		}
		// Remove trailing keywords case-insensitively
		cleaned = stripKeywordsCI(cleaned)
		cleaned = strings.TrimSpace(cleaned)

		// Extract column name and type
		m := colRE.FindStringSubmatch(cleaned)
		if m == nil {
			continue
		}
		colName := m[1]
		colType := strings.TrimSpace(m[2])
		// Strip trailing keywords and constraint clauses from type
		colType = stripKeywordsCI(colType)
		if parts := typeConstraintRE.Split(colType, 2); len(parts) > 0 {
			colType = strings.TrimSpace(parts[0])
		}

		if colName == "" || colType == "" {
			continue
		}

		cols = append(cols, ColumnInfo{
			Name:     colName,
			Type:     colType,
			Nullable: !notNull,
			IsPK:     isPK,
			Default:  defaultVal,
		})
	}

	return cols
}

func splitTopLevel(s string, sep rune) []string {
	var parts []string
	depth := 0
	start := 0
	for i, c := range s {
		switch c {
		case '(':
			depth++
		case ')':
			depth--
		case sep:
			if depth == 0 {
				parts = append(parts, s[start:i])
				start = i + 1
			}
		}
	}
	if start < len(s) {
		parts = append(parts, s[start:])
	}
	return parts
}

var suffixKeywordsLower = []string{"primary key", "not null", "unique", "references"}

// stripKeywordsCI strips trailing SQL keywords case-insensitively.
func stripKeywordsCI(s string) string {
	result := strings.TrimSpace(s)
	for {
		lower := strings.ToLower(result)
		trimmed := result
		for i, kw := range suffixKeywordsLower {
			if strings.HasSuffix(lower, kw) {
				trimmed = strings.TrimSpace(result[:len(result)-len(kw)])
				break
			}
			_ = i // keep the counter
		}
		if trimmed == result {
			break
		}
		result = trimmed
	}
	return result
}

func stripSuffixKeywords(s string) string {
	return stripKeywordsCI(s)
}

func hasPrefixAny(s string, prefixes ...string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

func hasSuffixAny(s string, suffixes ...string) bool {
	for _, sf := range suffixes {
		if strings.HasSuffix(s, sf) {
			return true
		}
	}
	return false
}

// --- Go struct scanning -------------------------------------------------------

type StructFieldInfo struct {
	FieldName string
	FieldType string
	Column    string // from db/gorm/json tag
}

type StructInfo struct {
	StructName string
	TableName  string
	Fields     []StructFieldInfo
	Source     string
}

// ScanGoStructs scans Go files in dirs for model structs with db/gorm/json tags.
// Returns a map of struct name → table name.
func ScanGoStructs(dirs ...string) ([]StructInfo, error) {
	var structs []StructInfo
	seen := map[string]bool{}

	for _, dir := range dirs {
		fset := token.NewFileSet()
		pkgs, err := parser.ParseDir(fset, dir, nil, 0)
		if err != nil {
			continue
		}

		for _, pkg := range pkgs {
			for fn, f := range pkg.Files {
				rel := filepath.Base(fn)
				si := parseFileStructs(f, rel)
				for _, s := range si {
					key := s.StructName + "@" + s.Source
					if !seen[key] {
						seen[key] = true
						structs = append(structs, s)
					}
				}
			}
		}
	}

	sort.Slice(structs, func(i, j int) bool {
		return structs[i].StructName < structs[j].StructName
	})

	return structs, nil
}

func parseFileStructs(f *ast.File, filename string) []StructInfo {
	// First pass: find TableName() methods
	tableNames := map[string]string{}
	for _, decl := range f.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Name.Name != "TableName" || fn.Recv == nil {
			continue
		}
		if len(fn.Recv.List) != 1 {
			continue
		}
		recvType := fn.Recv.List[0].Type
		var typeName string
		switch t := recvType.(type) {
		case *ast.Ident:
			typeName = t.Name
		case *ast.StarExpr:
			if ident, ok := t.X.(*ast.Ident); ok {
				typeName = ident.Name
			}
		}
		if typeName == "" {
			continue
		}
		// Extract the string literal returned by TableName()
		if fn.Body != nil && len(fn.Body.List) > 0 {
			ret, ok := fn.Body.List[0].(*ast.ReturnStmt)
			if ok && len(ret.Results) > 0 {
				lit, ok := ret.Results[0].(*ast.BasicLit)
				if ok && lit.Kind == token.STRING {
					tableNames[typeName] = strings.Trim(lit.Value, `"`)
				}
			}
		}
	}

	var structs []StructInfo
	for _, decl := range f.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.TYPE {
			continue
		}
		for _, spec := range gen.Specs {
			ts, ok := spec.(*ast.TypeSpec)
			if !ok {
				continue
			}
			st, ok := ts.Type.(*ast.StructType)
			if !ok {
				continue
			}

			name := ts.Name.Name
			tableName := tableNames[name]
			if tableName == "" {
				tableName = snakeCase(name)
			}

			si := StructInfo{
				StructName: name,
				TableName:  tableName,
				Source:     filename,
			}

			for _, field := range st.Fields.List {
				if len(field.Names) == 0 {
					continue // embedded field
				}
				fieldName := field.Names[0].Name
				fieldType := exprString(field.Type)
				column := tagColumn(field.Tag)

				si.Fields = append(si.Fields, StructFieldInfo{
					FieldName: fieldName,
					FieldType: fieldType,
					Column:    column,
				})
			}

			structs = append(structs, si)
		}
	}

	return structs
}

func tagColumn(tag *ast.BasicLit) string {
	if tag == nil {
		return ""
	}
	raw := tag.Value
	// Try db tag, then gorm column, then json
	for _, prefix := range []string{`db:"`, `gorm:"`, `json:"`} {
		idx := strings.Index(raw, prefix)
		if idx < 0 {
			continue
		}
		rest := raw[idx+len(prefix):]
		end := strings.IndexByte(rest, '"')
		if end < 0 {
			continue
		}
		val := rest[:end]
		if val == "-" {
			continue
		}
		// For gorm tag, extract column: part
		if prefix == `gorm:"` {
			for _, part := range strings.Split(val, ";") {
				part = strings.TrimSpace(part)
				if strings.HasPrefix(part, "column:") {
					return strings.TrimPrefix(part, "column:")
				}
			}
			continue
		}
		return val
	}
	return ""
}

func exprString(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.Ident:
		return e.Name
	case *ast.StarExpr:
		return "*" + exprString(e.X)
	case *ast.SelectorExpr:
		return exprString(e.X) + "." + e.Sel.Name
	case *ast.ArrayType:
		return "[]" + exprString(e.Elt)
	case *ast.MapType:
		return "map[" + exprString(e.Key) + "]" + exprString(e.Value)
	default:
		return fmt.Sprintf("%T", expr)
	}
}

// simple snake_case: UserAccount → user_account
func snakeCase(s string) string {
	var result []rune
	for i, r := range s {
		if r >= 'A' && r <= 'Z' {
			if i > 0 {
				result = append(result, '_')
			}
			result = append(result, r+32)
		} else {
			result = append(result, r)
		}
	}
	return string(result)
}
