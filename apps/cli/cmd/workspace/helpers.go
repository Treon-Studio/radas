package workspace

import "path/filepath"

func filepathDir(p string) string {
	return filepath.Dir(p)
}
