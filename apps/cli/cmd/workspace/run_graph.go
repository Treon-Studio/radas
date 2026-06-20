package workspace

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"time"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/graph"
	"github.com/raizora/radas/v4/internal/graph/render"
	"github.com/raizora/radas/v4/internal/graph/render/web"
)

func runGraph(cmd *cobra.Command) error {
	projects, _, _, err := loadProjects()
	if err != nil {
		return err
	}
	g, err := graph.Build(projects)
	if err != nil {
		return err
	}

	output, _ := cmd.Flags().GetString("output")
	webMode, _ := cmd.Flags().GetBool("web")
	if webMode {
		return runWebViewer(g)
	}

	switch output {
	case "svg":
		path, _ := cmd.Flags().GetString("file")
		if path == "" {
			path = "workspace.svg"
		}
		return render.ToSVG(g, path)
	case "png":
		path, _ := cmd.Flags().GetString("file")
		if path == "" {
			path = "workspace.png"
		}
		return render.ToPNG(g, path)
	case "json":
		return printGraphJSON(g, cmd.OutOrStdout())
	default:
		fmt.Fprintln(cmd.OutOrStdout(), render.ASCII(g))
	}
	return nil
}

func printGraphJSON(g *graph.Graph, out interface{ Write([]byte) (int, error) }) error {
	type nodeJSON struct {
		ID, Type, Path string
	}
	type edgeJSON struct {
		From, To string
	}
	type graphJSON struct {
		Nodes []nodeJSON `json:"nodes"`
		Edges []edgeJSON `json:"edges"`
	}
	data := graphJSON{}
	for _, name := range g.AllNames() {
		p, _ := g.Vertex(name)
		data.Nodes = append(data.Nodes, nodeJSON{p.Name, p.Type, p.Path})
	}
	for _, name := range g.AllNames() {
		deps, _ := g.Dependencies(name)
		for _, dep := range deps {
			data.Edges = append(data.Edges, edgeJSON{name, dep})
		}
	}
	enc := json.NewEncoder(out)
	enc.SetIndent("", "  ")
	return enc.Encode(data)
}

func runWebViewer(g *graph.Graph) error {
	s := web.NewServer(g, "localhost:7842")
	url := "http://" + s.Addr() + "/"
	fmt.Printf("Graph viewer at %s (Ctrl+C to stop)\n", url)
	go func() {
		time.Sleep(300 * time.Millisecond)
		openBrowser(url)
	}()
	return s.ListenAndServe()
}

func openBrowser(url string) {
	var c *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		c = exec.Command("open", url)
	case "linux":
		c = exec.Command("xdg-open", url)
	case "windows":
		c = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	}
	if c != nil {
		_ = c.Start()
	}
}
