package main

import (
	"log"
	"net/http"

	"github.com/yourusername/raft-visualizer/simulator"
	"github.com/yourusername/raft-visualizer/ws"
)

const (
	clusterSize = 5
	addr        = ":8080"
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

	http.HandleFunc("/ws", ws.Handler(hub))

	// Static health check endpoint so load balancers / Docker have something
	// to probe without needing a WebSocket client.
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	log.Printf("listening on %s  (cluster: %d nodes)", addr, clusterSize)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("server: %v", err)
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
		default:
			log.Printf("faultLoop: unknown action %q", fault.Action)
		}
	}
}
