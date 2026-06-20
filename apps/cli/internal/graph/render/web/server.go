// Package web serves an interactive graph viewer over HTTP using Cytoscape.js
// with the dagre layout. Static assets are embedded in the binary.
package web

import (
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"time"

	"github.com/raizora/radas/v4/internal/graph"
)

//go:embed assets
var assetsFS embed.FS

// GraphData is the JSON view of a workspace graph sent to the browser.
type GraphData struct {
	Nodes []NodeData `json:"nodes"`
	Edges []EdgeData `json:"edges"`
}

type NodeData struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Path string `json:"path"`
}

type EdgeData struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// Server is the HTTP server that serves the graph viewer.
type Server struct {
	g    *graph.Graph
	addr string
}

func NewServer(g *graph.Graph, addr string) *Server {
	if addr == "" {
		addr = "localhost:7842"
	}
	return &Server{g: g, addr: addr}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/graph", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(s.graphData())
	})
	staticFS, _ := fs.Sub(assetsFS, "assets")
	mux.Handle("/", http.FileServer(http.FS(staticFS)))
	return mux
}

func (s *Server) ListenAndServe() error {
	return (&http.Server{
		Addr:         s.addr,
		Handler:      s.Handler(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}).ListenAndServe()
}

func (s *Server) Addr() string { return s.addr }

func (s *Server) graphData() GraphData {
	data := GraphData{}
	for _, name := range s.g.AllNames() {
		p, _ := s.g.Vertex(name)
		data.Nodes = append(data.Nodes, NodeData{ID: p.Name, Type: p.Type, Path: p.Path})
	}
	for _, name := range s.g.AllNames() {
		deps, _ := s.g.Dependencies(name)
		for _, dep := range deps {
			data.Edges = append(data.Edges, EdgeData{From: name, To: dep})
		}
	}
	return data
}
