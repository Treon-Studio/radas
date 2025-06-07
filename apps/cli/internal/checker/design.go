package checker

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"radas/internal/utils"
)

// CheckFigma checks the Figma installation
func CheckFigma() bool {
	fmt.Print("Checking Figma: ")

	// Check based on operating system
	found := false

	switch runtime.GOOS {
	case "darwin":
		// macOS
		if utils.CheckMacOSApp("Figma") {
			found = true
		}
	case "windows":
		// Windows
		figmaPath := filepath.Join(os.Getenv("LOCALAPPDATA"), "Figma", "Figma.exe")
		if utils.CheckWindowsApp(figmaPath) {
			found = true
		}
	case "linux":
		// Linux - check if it's in path
		if utils.CheckIfCommandExists("figma-linux") {
			found = true
		}
	}

	if found {
		utils.Success("✓ Installed\n")
		return true
	} 
	
	utils.Warning("⚠ Figma not found\n")
	fmt.Println("  Figma is available as a desktop app or web app at https://www.figma.com/downloads/")
	return false
}

// CheckSketch checks the Sketch installation
func CheckSketch() bool {
	fmt.Print("Checking Sketch: ")

	// Sketch is only available on macOS
	if runtime.GOOS != "darwin" {
		utils.Warning("⚠ Sketch is only available for macOS\n")
		return false
	}

	if utils.CheckMacOSApp("Sketch") {
		utils.Success("✓ Installed\n")
		return true
	}
	
	utils.Warning("⚠ Sketch not found\n")
	fmt.Println("  Please install Sketch from https://www.sketch.com/")
	return false
}

// CheckAdobeXD checks the Adobe XD installation
func CheckAdobeXD() bool {
	fmt.Print("Checking Adobe XD: ")

	found := false

	switch runtime.GOOS {
	case "darwin":
		// macOS
		if utils.CheckMacOSApp("Adobe XD") {
			found = true
		}
	case "windows":
		// Windows - path for Adobe is usually more complex, this is a simplified example
		xdPath := filepath.Join(os.Getenv("ProgramFiles"), "Adobe", "Adobe XD", "XD.exe")
		if utils.CheckWindowsApp(xdPath) {
			found = true
		}
	}

	if found {
		utils.Success("✓ Installed\n")
		return true
	}
	
	utils.Warning("⚠ Adobe XD not found\n")
	fmt.Println("  Please install Adobe XD from https://www.adobe.com/products/xd.html")
	return false
}

// CheckInkscape checks the Inkscape installation
func CheckInkscape() bool {
	fmt.Print("Checking Inkscape: ")

	if !utils.CheckIfCommandExists("inkscape") {
		// Special check for Windows/macOS if command is not found
		found := false
		
		switch runtime.GOOS {
		case "darwin":
			if utils.CheckMacOSApp("Inkscape") {
				found = true
			}
		case "windows":
			inkscapePath := filepath.Join(os.Getenv("ProgramFiles"), "Inkscape", "inkscape.exe")
			if utils.CheckWindowsApp(inkscapePath) {
				found = true
			}
		}
		
		if !found {
			utils.Failure("✘ Inkscape not found\n")
			fmt.Println("  Please install Inkscape from https://inkscape.org/release/")
			return false
		}
	}

	output, err := utils.ExecuteCommand("inkscape", "--version")
	if err != nil {
		utils.Success("✓ Installed (version unknown)\n")
		return true
	}

	version := strings.Split(output, "\n")[0]
	utils.Success("✓ Installed (%s)\n", version)
	return true
}