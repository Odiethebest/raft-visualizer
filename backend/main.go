package main

import (
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"

	"github.com/yourusername/raft-visualizer/simulator"
	"github.com/yourusername/raft-visualizer/ws"
)

const (
	clusterSize = 5
	defaultPort = "8080"
)

func main() {
	hub := ws.NewHub()
	clusterMgr := newClusterManager(hub)
	defer clusterMgr.Stop()

	// Start cluster simulation only when the first browser connects, and stop
	// it when the last browser disconnects to avoid burning CPU in the
	// background with no active viewers.
	hub.SetClientHooks(clusterMgr.EnsureRunning, clusterMgr.StopIfNoClients)

	// Dispatch incoming fault-inject commands from the WebSocket to the
	// cluster manager in a dedicated goroutine. This keeps the HTTP handler
	// lean: it only writes to hub.FaultCh and returns.
	go faultLoop(clusterMgr, hub)

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

type clusterManager struct {
	mu      sync.Mutex
	cluster *simulator.Cluster
	hub     *ws.Hub
}

func newClusterManager(hub *ws.Hub) *clusterManager {
	return &clusterManager{hub: hub}
}

func (m *clusterManager) EnsureRunning() {
	m.mu.Lock()
	if m.cluster != nil {
		m.mu.Unlock()
		return
	}

	cluster := simulator.New(clusterSize, func(snap simulator.ClusterSnapshot) {
		m.hub.Broadcast(snap)
	})
	m.cluster = cluster
	m.mu.Unlock()

	// Push an immediate snapshot so a newly connected client can render nodes
	// right away, without waiting for the next state transition.
	m.hub.Broadcast(cluster.Snapshot())
	log.Printf("cluster: started (active clients: %d)", m.hub.ActiveClients())
}

func (m *clusterManager) StopIfNoClients() {
	if m.hub.ActiveClients() > 0 {
		return
	}
	m.Stop()
}

func (m *clusterManager) Stop() {
	m.mu.Lock()
	cluster := m.cluster
	m.cluster = nil
	m.mu.Unlock()

	if cluster != nil {
		cluster.Stop()
		log.Printf("cluster: stopped (no active clients)")
	}
}

func (m *clusterManager) withCluster(fn func(*simulator.Cluster)) bool {
	m.mu.Lock()
	cluster := m.cluster
	m.mu.Unlock()
	if cluster == nil {
		return false
	}
	fn(cluster)
	return true
}

func (m *clusterManager) ApplyFault(fault ws.FaultPayload) {
	ok := m.withCluster(func(cluster *simulator.Cluster) {
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
			if fault.Command != "" && !cluster.SubmitCommand(fault.Command) {
				log.Printf("submit: dropped command %q (no current leader)", fault.Command)
			}
		default:
			log.Printf("faultLoop: unknown action %q", fault.Action)
		}
	})

	if !ok {
		log.Printf("faultLoop: ignored %q (cluster is idle; connect a client first)", fault.Action)
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
func faultLoop(manager *clusterManager, hub *ws.Hub) {
	for fault := range hub.FaultCh {
		manager.ApplyFault(fault)
	}
}
