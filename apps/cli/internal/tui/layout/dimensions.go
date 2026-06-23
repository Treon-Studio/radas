package layout

const (
	MinInfoPanelWidth = 35
	MaxInfoPanelWidth = 55
	InfoPanelRatio    = 0.25

	MinSidebarWidth = 25
	MaxSidebarWidth = 40
	SidebarRatio    = 0.20

	StatusBarHeight = 1
)

type Dimensions struct {
	Width  int
	Height int

	SidebarWidth  int
	SidebarHeight int

	MainContentWidth  int
	MainContentHeight int

	InfoPanelWidth  int
	InfoPanelHeight int
}

func NewDimensions(w, h int, showSidebar, showInfo bool) Dimensions {
	contentH := h - StatusBarHeight

	sidebarW := 0
	if showSidebar {
		sidebarW = int(float64(w) * SidebarRatio)
		if sidebarW < MinSidebarWidth {
			sidebarW = MinSidebarWidth
		}
		if sidebarW > MaxSidebarWidth {
			sidebarW = MaxSidebarWidth
		}
	}

	infoW := 0
	if showInfo {
		infoW = int(float64(w) * InfoPanelRatio)
		if infoW < MinInfoPanelWidth {
			infoW = MinInfoPanelWidth
		}
		if infoW > MaxInfoPanelWidth {
			infoW = MaxInfoPanelWidth
		}
	}

	// Ensure main content gets at least some space
	mainW := w - sidebarW - infoW
	if mainW < 40 {
		// Shrink info panel first
		if showInfo && infoW > 0 {
			infoW = w - sidebarW - 40
			if infoW < 0 {
				infoW = 0
			}
			mainW = w - sidebarW - infoW
		}
		// If still too small, shrink sidebar
		if mainW < 40 && showSidebar && sidebarW > 0 {
			sidebarW = w - infoW - 40
			if sidebarW < 0 {
				sidebarW = 0
			}
			mainW = w - sidebarW - infoW
		}
	}

	return Dimensions{
		Width:  w,
		Height: h,

		SidebarWidth:  sidebarW,
		SidebarHeight: contentH,

		MainContentWidth:  mainW,
		MainContentHeight: contentH,

		InfoPanelWidth:  infoW,
		InfoPanelHeight: contentH,
	}
}
