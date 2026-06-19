package render

import (
	"context"
	"fmt"
	"os"

	"github.com/goccy/go-graphviz"
	"github.com/goccy/go-graphviz/cgraph"

	"github.com/raizora/radas/v4/internal/graph"
)

// ToSVG renders the graph as an SVG file. Pure Go via goccy/go-graphviz
// (embeds Graphviz as WASM); no system Graphviz install required.
func ToSVG(g *graph.Graph, outputPath string) error {
	return renderGraphviz(g, graphviz.SVG, outputPath)
}

// ToPNG renders the graph as a PNG file.
func ToPNG(g *graph.Graph, outputPath string) error {
	return renderGraphviz(g, graphviz.PNG, outputPath)
}

func renderGraphviz(g *graph.Graph, format graphviz.Format, outputPath string) error {
	ctx := context.Background()
	gv, err := graphviz.New(ctx)
	if err != nil {
		return fmt.Errorf("create graphviz: %w", err)
	}
	defer gv.Close()

	dot, err := cgraph.ParseBytes([]byte(DOT(g)))
	if err != nil {
		return fmt.Errorf("parse DOT: %w", err)
	}
	f, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("create %s: %w", outputPath, err)
	}
	defer f.Close()
	if err := gv.Render(ctx, dot, format, f); err != nil {
		return fmt.Errorf("render %s: %w", outputPath, err)
	}
	return nil
}
