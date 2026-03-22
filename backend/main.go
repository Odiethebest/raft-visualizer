package main

import (
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/yourusername/raft-visualizer/simulator"
	"github.com/yourusername/raft-visualizer/ws"
)

const (
	clusterSize = 5
	defaultPort = "8080"
)

func main() {
	hub := ws.NewHub()

	// Start the Raft cluster. The onStateChange callback runs on the node's
	// Run goroutine whenever any state transition occurs; it broadcasts the
	// full cluster snapshot to all connected WebSocket clients.
	cluster := simulator.New(clusterSize, func(snap simulator.ClusterSnapshot) {
		hub.Broadcast(snap)
	})
	defer cluster.Stop()

	// Dispatch incoming fault-inject commands from the WebSocket to the
	// simulator in a dedicated goroutine. This keeps the HTTP handler lean —
	// it just writes to hub.FaultCh and returns; the actual cluster mutation
	// happens here, off the WebSocket read pump.
	go faultLoop(cluster, hub)

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", ws.Handler(hub))

	// Static health check endpoint so load balancers / Docker have something
	// to probe without needing a WebSocket client.
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	staticDir := strings.TrimSpace(os.Getenv("STATIC_DIR"))
	if staticDir != "" {
		log.Printf("serving static frontend from %s", staticDir)
		mux.HandleFunc("/", spaHandler(staticDir))
	}

	addr := listenAddr()
	log.Printf("listening on %s  (cluster: %d nodes)", addr, clusterSize)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func listenAddr() string {
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = defaultPort
	}
	if strings.HasPrefix(port, ":") {
		return port
	}
	return ":" + port
}

// spaHandler serves compiled frontend assets when STATIC_DIR is configured.
// Unknown routes fall back to index.html so client-side routing keeps working.
func spaHandler(staticDir string) http.HandlerFunc {
	fileServer := http.FileServer(http.Dir(staticDir))
	indexPath := filepath.Join(staticDir, "index.html")

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		cleanPath := path.Clean("/" + r.URL.Path)
		if cleanPath != "/" {
			candidate := filepath.Join(staticDir, filepath.FromSlash(strings.TrimPrefix(cleanPath, "/")))
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		http.ServeFile(w, r, indexPath)
	}
}

// faultLoop reads fault-inject commands from the hub and applies them to the
// cluster. It runs for the lifetime of the process.
func faultLoop(cluster *simulator.Cluster, hub *ws.Hub) {
	for fault := range hub.FaultCh {
		switch fault.Action {
		case "kill":
			for _, id := range fault.Targets {
				cluster.KillNode(id)
			}
		case "restart":
			for _, id := range fault.Targets {
				cluster.RestartNode(id)
			}
		case "partition":
			if len(fault.PartitionGroups) == 2 {
				cluster.Partition(fault.PartitionGroups[0], fault.PartitionGroups[1])
			} else {
				log.Printf("partition: expected 2 groups, got %d", len(fault.PartitionGroups))
			}
		case "heal":
			cluster.Heal()
		case "submit":
			if fault.Command != "" {
				cluster.SubmitCommand(fault.Command)
			}
		default:
			log.Printf("faultLoop: unknown action %q", fault.Action)
		}
	}
}
