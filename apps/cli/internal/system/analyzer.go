package system

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// AnalyzeDisk scans targetDirectory and returns items larger than minSizeBytes.
func AnalyzeDisk(targetDirectory string, minSizeBytes int64, maxDepth int) ([]DiskItem, error) {
	if minSizeBytes == 0 {
		minSizeBytes = 50 * 1024 * 1024 // default 50 MB threshold
	}

	targetDirectory, err := filepath.Abs(targetDirectory)
	if err != nil {
		return nil, err
	}

	var results []DiskItem

	entries, err := os.ReadDir(targetDirectory)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		name := entry.Name()
		// Skip hidden dotfiles and system virtual paths
		if strings.HasPrefix(name, ".") && name != ".npm" && name != ".pnpm-store" && name != ".cargo" {
			continue
		}

		fullPath := filepath.Join(targetDirectory, name)
		info, err := entry.Info()
		if err != nil {
			continue
		}

		var size int64
		var count int
		if entry.IsDir() {
			size, count = CalculateDirSize(fullPath)
		} else {
			size = info.Size()
			count = 1
		}

		if size >= minSizeBytes {
			results = append(results, DiskItem{
				Path:      fullPath,
				SizeBytes: size,
				HumanSize: FormatBytes(size),
				IsDir:     entry.IsDir(),
				ItemCount: count,
			})
		}
	}

	// Sort descending by size
	sort.Slice(results, func(i, j int) bool {
		return results[i].SizeBytes > results[j].SizeBytes
	})

	return results, nil
}
