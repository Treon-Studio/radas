package utils

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// PackageJSON represents a package.json file
type PackageJSON struct {
	Name     string            `json:"name"`
	Version  string            `json:"version"`
	Scripts  map[string]string `json:"scripts"`
	DevDeps  map[string]string `json:"devDependencies"`
	Deps     map[string]string `json:"dependencies"`
	PeerDeps map[string]string `json:"peerDependencies"`
}

// DirExists checks if a directory exists
func DirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// ReadPackageJSON reads and parses a package.json file
func ReadPackageJSON(path string) (PackageJSON, error) {
	var pkg PackageJSON
	
	data, err := os.ReadFile(path)
	if err != nil {
		return pkg, fmt.Errorf("error reading package.json: %v", err)
	}
	
	err = json.Unmarshal(data, &pkg)
	if err != nil {
		return pkg, fmt.Errorf("error parsing package.json: %v", err)
	}
	
	return pkg, nil
}

// GetAppsList finds all apps in a directory (checks for package.json)
func GetAppsList(rootDir string) (map[string]string, error) {
	apps := make(map[string]string)
	
	// First check if we're in a monorepo with an 'apps' directory
	appsDir := filepath.Join(rootDir, "apps")
	if DirExists(appsDir) {
		// Look for apps in the apps directory
		entries, err := os.ReadDir(appsDir)
		if err != nil {
			return nil, fmt.Errorf("error reading apps directory: %v", err)
		}
		
		for _, entry := range entries {
			if entry.IsDir() {
				appDir := filepath.Join(appsDir, entry.Name())
				packagePath := filepath.Join(appDir, "package.json")
				
				if FileExists(packagePath) {
					// Read package.json to get app name
					pkg, err := ReadPackageJSON(packagePath)
					if err == nil {
						name := pkg.Name
						if name == "" {
							name = entry.Name() // Fallback to directory name
						}
						apps[name] = appDir
					} else {
						// Just use directory name
						apps[entry.Name()] = appDir
					}
				}
			}
		}
	} else {
		// Check if current directory is an app (has package.json)
		if FileExists(filepath.Join(rootDir, "package.json")) {
			// Get directory name
			dirName := filepath.Base(rootDir)
			apps[dirName] = rootDir
		}
	}
	
	return apps, nil
} 