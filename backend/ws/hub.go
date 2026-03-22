// Package ws handles the WebSocket layer: upgrading HTTP connections,
// managing connected clients, and broadcasting cluster snapshots. It has
// no knowledge of Raft internals — it just serializes what the simulator
// hands it and fans it out to whoever is listening.
package ws

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// MessageType is the "type" field in every envelope sent over the wire.
// The frontend uses this to route messages to the right handler.
type MessageType string

const (
	MsgStateUpdate MessageType = "STATE_UPDATE"
	MsgCommandAck  MessageType = "COMMAND_ACK"
	MsgError       MessageType = "ERROR"
	MsgFaultInject MessageType = "FAULT_INJECT"
)

// Envelope is the top-level wrapper for every WebSocket message, in both
// directions. Keeping a consistent envelope means the frontend only needs
// one JSON decoder — the inner payload varies by type.
type Envelope struct {
	Type    MessageType     `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// FaultPayload is the shape of an incoming FAULT_INJECT message from the
// frontend. The action field drives which simulator method gets called.
type FaultPayload struct {
	Action          string  `json:"action"` // "kill" | "partition" | "heal" | "restart"
	Targets         []int   `json:"targets"`
	PartitionGroups [][]int `json:"partitionGroups"` // only used for "partition"
}

// client wraps a single WebSocket connection. Each connected browser tab
// gets its own client; the hub broadcasts to all of them simultaneously.
type client struct {
	conn *websocket.Conn
	// send is a buffered channel of outgoing messages. The write pump
	// goroutine drains it; the hub sends to it without blocking.
	send chan []byte
}

// Hub maintains the set of active WebSocket clients and broadcasts messages
// to all of them. It also exposes a FaultCh channel that the handler writes
// to when a FAULT_INJECT message arrives — keeping protocol parsing out of
// the hub and routing out of the handler.
type Hub struct {
	mu      sync.Mutex
	clients map[*client]struct{}

	// FaultCh carries parsed fault payloads from connected clients to the
	// main loop (or whoever is reading). Buffer of 16 to avoid blocking the
	// read pump on a slow consumer.
	FaultCh chan FaultPayload
}

// NewHub creates an idle Hub. Call Run() in a goroutine to start accepting
// client registrations.
func NewHub() *Hub {
	return &Hub{
		clients: make(map[*client]struct{}),
		FaultCh: make(chan FaultPayload, 16),
	}
}

// Broadcast serializes payload as a STATE_UPDATE envelope and sends it to
// all connected clients. Clients that can't keep up (full send buffer) are
// silently skipped — we prefer dropping a frame over blocking the simulator.
func (h *Hub) Broadcast(payload any) {
	raw, err := json.Marshal(payload)
	if err != nil {
		log.Printf("ws: marshal error: %v", err)
		return
	}

	env := Envelope{Type: MsgStateUpdate, Payload: raw}
	msg, err := json.Marshal(env)
	if err != nil {
		log.Printf("ws: envelope marshal error: %v", err)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for c := range h.clients {
		select {
		case c.send <- msg:
		default:
			// Client is too slow to read. Drop the frame rather than blocking
			// the simulator goroutine. The frontend will catch up on the next
			// broadcast — it always renders the latest full snapshot anyway.
		}
	}
}

// register adds a new client to the hub.
func (h *Hub) register(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = struct{}{}
}

// unregister removes a client and closes its send channel, which signals
// the write pump to exit.
func (h *Hub) unregister(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.send)
	}
}
