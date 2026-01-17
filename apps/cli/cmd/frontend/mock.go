package frontend

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"
)

var (
	mockPort     int
	mockFile     string
	mockWatch    bool
	mockDelay    int
	mockCors     bool
)

// MockCmd is the command to run a fake JSON server
var MockCmd = &cobra.Command{
	Use:   "mock",
	Short: "Start a fake REST API server from a JSON file",
	Long: `Start a fake REST API server that reads from a JSON file and provides
RESTful endpoints for each top-level key.

Example JSON file (db.json):
{
  "users": [
    {"id": 1, "name": "John"},
    {"id": 2, "name": "Jane"}
  ],
  "posts": [
    {"id": 1, "title": "Hello", "userId": 1}
  ]
}

This will create the following endpoints:
  GET    /users      - List all users
  GET    /users/:id  - Get user by ID
  POST   /users      - Create new user
  PUT    /users/:id  - Update user by ID
  DELETE /users/:id  - Delete user by ID
  (same for /posts)

Query Parameters:
  ?q=keyword          - Full-text search across all fields
  ?field=value        - Filter by exact field value
  ?_sort=field        - Sort by field (default: asc)
  ?_order=asc|desc    - Sort order
  ?_page=1&_limit=10  - Pagination

Nested Routes:
  GET /users/1/posts  - Get all posts where userId=1

Usage:
  radas fe mock                    # Uses db.json in current directory
  radas fe mock -f data.json       # Uses custom JSON file
  radas fe mock -p 8080            # Run on port 8080
  radas fe mock --delay 500        # Add 500ms delay to responses
  radas fe mock --watch            # Watch file for changes`,
	Run: runMockServer,
}

func init() {
	MockCmd.Flags().IntVarP(&mockPort, "port", "p", 3000, "Port to run the server on")
	MockCmd.Flags().StringVarP(&mockFile, "file", "f", "db.json", "JSON file to use as database")
	MockCmd.Flags().BoolVarP(&mockWatch, "watch", "w", false, "Watch file for changes and reload")
	MockCmd.Flags().IntVar(&mockDelay, "delay", 0, "Add delay to responses (in milliseconds)")
	MockCmd.Flags().BoolVar(&mockCors, "cors", true, "Enable CORS headers")
}

// MockServer holds the server state
type MockServer struct {
	mu       sync.RWMutex
	data     map[string][]map[string]interface{}
	filePath string
}

func runMockServer(cmd *cobra.Command, args []string) {
	// Check if file exists
	if !fileExists(mockFile) {
		fmt.Printf("Error: File '%s' not found\n", mockFile)
		fmt.Println("\nCreate a db.json file with your mock data, for example:")
		fmt.Println(`{
  "users": [
    {"id": 1, "name": "John Doe", "email": "john@example.com"},
    {"id": 2, "name": "Jane Doe", "email": "jane@example.com"}
  ],
  "posts": [
    {"id": 1, "title": "Hello World", "body": "This is my first post", "userId": 1}
  ]
}`)
		return
	}

	server := &MockServer{filePath: mockFile}
	if err := server.loadData(); err != nil {
		fmt.Printf("Error loading JSON file: %v\n", err)
		return
	}

	// Watch file for changes if enabled
	if mockWatch {
		go server.watchFile()
	}

	// Setup HTTP server
	mux := http.NewServeMux()
	mux.HandleFunc("/", server.handleRequest)

	// Print startup info
	fmt.Println()
	fmt.Println("  \\{^_^}/ hi!")
	fmt.Println()
	fmt.Printf("  Loading %s\n", mockFile)
	fmt.Println()
	fmt.Println("  Resources:")

	// Sort and display resources
	var resources []string
	server.mu.RLock()
	for key := range server.data {
		resources = append(resources, key)
	}
	server.mu.RUnlock()
	sort.Strings(resources)

	for _, res := range resources {
		fmt.Printf("  http://localhost:%d/%s\n", mockPort, res)
	}

	fmt.Println()
	fmt.Printf("  Home:\n  http://localhost:%d\n", mockPort)
	fmt.Println()
	if mockWatch {
		fmt.Println("  Watching for file changes...")
		fmt.Println()
	}
	fmt.Println("  Press Ctrl+C to stop")
	fmt.Println()

	// Start server
	addr := fmt.Sprintf(":%d", mockPort)
	if err := http.ListenAndServe(addr, mux); err != nil {
		fmt.Printf("Error starting server: %v\n", err)
	}
}

func (s *MockServer) loadData() error {
	file, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	var rawData map[string]interface{}
	if err := json.Unmarshal(file, &rawData); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.data = make(map[string][]map[string]interface{})
	for key, value := range rawData {
		switch v := value.(type) {
		case []interface{}:
			var items []map[string]interface{}
			for _, item := range v {
				if m, ok := item.(map[string]interface{}); ok {
					items = append(items, m)
				}
			}
			s.data[key] = items
		}
	}

	return nil
}

func (s *MockServer) watchFile() {
	lastMod := time.Time{}
	for {
		info, err := os.Stat(s.filePath)
		if err == nil && info.ModTime() != lastMod {
			if !lastMod.IsZero() {
				fmt.Printf("\n  File changed, reloading %s...\n", s.filePath)
				if err := s.loadData(); err != nil {
					fmt.Printf("  Error reloading: %v\n", err)
				} else {
					fmt.Println("  Reloaded successfully!")
				}
			}
			lastMod = info.ModTime()
		}
		time.Sleep(1 * time.Second)
	}
}

func (s *MockServer) handleRequest(w http.ResponseWriter, r *http.Request) {
	// Add delay if specified
	if mockDelay > 0 {
		time.Sleep(time.Duration(mockDelay) * time.Millisecond)
	}

	// CORS headers
	if mockCors {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	}

	// Handle preflight
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Parse path
	path := strings.Trim(r.URL.Path, "/")
	parts := strings.Split(path, "/")

	// Root path - show available resources
	if path == "" {
		s.handleRoot(w, r)
		return
	}

	resource := parts[0]
	var id string
	var nestedResource string
	if len(parts) > 1 {
		id = parts[1]
	}
	if len(parts) > 2 {
		nestedResource = parts[2]
	}

	// Check if resource exists
	s.mu.RLock()
	_, exists := s.data[resource]
	s.mu.RUnlock()

	if !exists {
		s.sendError(w, http.StatusNotFound, fmt.Sprintf("Resource '%s' not found", resource))
		return
	}

	// Log request
	fmt.Printf("  %s %s\n", r.Method, r.URL.Path)

	// Handle nested routes: /users/1/posts
	if nestedResource != "" && r.Method == "GET" {
		s.handleNestedGet(w, r, resource, id, nestedResource)
		return
	}

	// Route to appropriate handler
	switch r.Method {
	case "GET":
		if id != "" {
			s.handleGetOne(w, r, resource, id)
		} else {
			s.handleGetAll(w, r, resource)
		}
	case "POST":
		s.handlePost(w, r, resource)
	case "PUT", "PATCH":
		if id != "" {
			s.handlePut(w, r, resource, id)
		} else {
			s.sendError(w, http.StatusBadRequest, "ID required for update")
		}
	case "DELETE":
		if id != "" {
			s.handleDelete(w, r, resource, id)
		} else {
			s.sendError(w, http.StatusBadRequest, "ID required for delete")
		}
	default:
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (s *MockServer) handleRoot(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	resources := make(map[string]string)
	for key := range s.data {
		resources[key] = fmt.Sprintf("http://localhost:%d/%s", mockPort, key)
	}
	s.sendJSON(w, http.StatusOK, resources)
}

func (s *MockServer) handleGetAll(w http.ResponseWriter, r *http.Request, resource string) {
	s.mu.RLock()
	items := make([]map[string]interface{}, len(s.data[resource]))
	copy(items, s.data[resource])
	s.mu.RUnlock()

	query := r.URL.Query()

	// Handle full-text search (?q=keyword)
	searchQuery := query.Get("q")
	if searchQuery != "" {
		searchQuery = strings.ToLower(searchQuery)
		var searched []map[string]interface{}
		for _, item := range items {
			for _, val := range item {
				valStr := strings.ToLower(fmt.Sprintf("%v", val))
				if strings.Contains(valStr, searchQuery) {
					searched = append(searched, item)
					break
				}
			}
		}
		items = searched
	}

	// Handle field filtering (?field=value)
	if len(query) > 0 {
		var filtered []map[string]interface{}
		for _, item := range items {
			match := true
			for key, values := range query {
				// Skip special query params
				if key == "_page" || key == "_limit" || key == "_sort" || key == "_order" || key == "q" {
					continue
				}
				if itemVal, ok := item[key]; ok {
					valStr := fmt.Sprintf("%v", itemVal)
					if valStr != values[0] {
						match = false
						break
					}
				} else {
					match = false
					break
				}
			}
			if match {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}

	// Handle sorting (?_sort=field&_order=asc|desc)
	sortField := query.Get("_sort")
	sortOrder := query.Get("_order")
	if sortField != "" {
		if sortOrder == "" {
			sortOrder = "asc"
		}
		sort.Slice(items, func(i, j int) bool {
			valI, okI := items[i][sortField]
			valJ, okJ := items[j][sortField]
			if !okI || !okJ {
				return false
			}

			var less bool
			switch vI := valI.(type) {
			case float64:
				if vJ, ok := valJ.(float64); ok {
					less = vI < vJ
				}
			case string:
				if vJ, ok := valJ.(string); ok {
					less = strings.ToLower(vI) < strings.ToLower(vJ)
				}
			default:
				less = fmt.Sprintf("%v", valI) < fmt.Sprintf("%v", valJ)
			}

			if sortOrder == "desc" {
				return !less
			}
			return less
		})
	}

	// Handle pagination (?_page=1&_limit=10)
	page, _ := strconv.Atoi(query.Get("_page"))
	limit, _ := strconv.Atoi(query.Get("_limit"))

	if limit > 0 {
		start := 0
		if page > 0 {
			start = (page - 1) * limit
		}
		end := start + limit
		if start > len(items) {
			items = []map[string]interface{}{}
		} else if end > len(items) {
			items = items[start:]
		} else {
			items = items[start:end]
		}
	}

	if items == nil {
		items = []map[string]interface{}{}
	}
	s.sendJSON(w, http.StatusOK, items)
}

// handleNestedGet handles nested routes like /users/1/posts
func (s *MockServer) handleNestedGet(w http.ResponseWriter, r *http.Request, parentResource, parentID, childResource string) {
	// Check if child resource exists
	s.mu.RLock()
	childItems, exists := s.data[childResource]
	s.mu.RUnlock()

	if !exists {
		s.sendError(w, http.StatusNotFound, fmt.Sprintf("Resource '%s' not found", childResource))
		return
	}

	// Determine the foreign key field name
	// e.g., for /users/1/posts, look for "userId" in posts
	fkField := strings.TrimSuffix(parentResource, "s") + "Id" // users -> userId

	// Filter child items by parent ID
	var filtered []map[string]interface{}
	for _, item := range childItems {
		if fkVal, ok := item[fkField]; ok {
			fkStr := fmt.Sprintf("%v", fkVal)
			// Handle numeric comparison
			if fkFloat, ok := fkVal.(float64); ok {
				parentIDFloat, err := strconv.ParseFloat(parentID, 64)
				if err == nil && fkFloat == parentIDFloat {
					filtered = append(filtered, item)
					continue
				}
			}
			// Handle string comparison
			if fkStr == parentID {
				filtered = append(filtered, item)
			}
		}
	}

	if filtered == nil {
		filtered = []map[string]interface{}{}
	}
	s.sendJSON(w, http.StatusOK, filtered)
}

func (s *MockServer) handleGetOne(w http.ResponseWriter, r *http.Request, resource, id string) {
	s.mu.RLock()
	items := s.data[resource]
	s.mu.RUnlock()

	for _, item := range items {
		if s.matchID(item, id) {
			s.sendJSON(w, http.StatusOK, item)
			return
		}
	}

	s.sendError(w, http.StatusNotFound, "Item not found")
}

func (s *MockServer) handlePost(w http.ResponseWriter, r *http.Request, resource string) {
	var newItem map[string]interface{}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		s.sendError(w, http.StatusBadRequest, "Failed to read request body")
		return
	}

	if err := json.Unmarshal(body, &newItem); err != nil {
		s.sendError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	s.mu.Lock()
	// Auto-generate ID if not provided
	if _, hasID := newItem["id"]; !hasID {
		maxID := 0
		for _, item := range s.data[resource] {
			if id, ok := item["id"].(float64); ok {
				if int(id) > maxID {
					maxID = int(id)
				}
			}
		}
		newItem["id"] = float64(maxID + 1)
	}
	s.data[resource] = append(s.data[resource], newItem)
	s.mu.Unlock()

	s.saveData()
	s.sendJSON(w, http.StatusCreated, newItem)
}

func (s *MockServer) handlePut(w http.ResponseWriter, r *http.Request, resource, id string) {
	var updateItem map[string]interface{}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		s.sendError(w, http.StatusBadRequest, "Failed to read request body")
		return
	}

	if err := json.Unmarshal(body, &updateItem); err != nil {
		s.sendError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for i, item := range s.data[resource] {
		if s.matchID(item, id) {
			// For PUT, replace entirely; for PATCH, merge
			if r.Method == "PATCH" {
				for k, v := range updateItem {
					item[k] = v
				}
				s.data[resource][i] = item
			} else {
				// Keep the ID
				updateItem["id"] = item["id"]
				s.data[resource][i] = updateItem
			}
			s.saveData()
			s.sendJSON(w, http.StatusOK, s.data[resource][i])
			return
		}
	}

	s.sendError(w, http.StatusNotFound, "Item not found")
}

func (s *MockServer) handleDelete(w http.ResponseWriter, r *http.Request, resource, id string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, item := range s.data[resource] {
		if s.matchID(item, id) {
			s.data[resource] = append(s.data[resource][:i], s.data[resource][i+1:]...)
			s.saveData()
			s.sendJSON(w, http.StatusOK, map[string]interface{}{})
			return
		}
	}

	s.sendError(w, http.StatusNotFound, "Item not found")
}

func (s *MockServer) matchID(item map[string]interface{}, id string) bool {
	itemID, ok := item["id"]
	if !ok {
		return false
	}

	switch v := itemID.(type) {
	case float64:
		numID, err := strconv.ParseFloat(id, 64)
		return err == nil && v == numID
	case string:
		return v == id
	default:
		return fmt.Sprintf("%v", v) == id
	}
}

func (s *MockServer) saveData() {
	// Convert back to original format
	output := make(map[string]interface{})
	for k, v := range s.data {
		output[k] = v
	}

	data, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		fmt.Printf("  Error saving data: %v\n", err)
		return
	}

	if err := os.WriteFile(s.filePath, data, 0644); err != nil {
		fmt.Printf("  Error writing file: %v\n", err)
	}
}

func (s *MockServer) sendJSON(w http.ResponseWriter, status int, data interface{}) {
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (s *MockServer) sendError(w http.ResponseWriter, status int, message string) {
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
