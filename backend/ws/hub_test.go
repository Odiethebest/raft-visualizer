package ws

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// dialTestServer spins up a test HTTP server with the ws handler, connects a
// WebSocket client to it, and returns the connection. The caller is responsible
// for closing it.
func dialTestServer(t *testing.T, hub *Hub) *websocket.Conn {
	t.Helper()
	srv := httptest.NewServer(Handler(hub))
	t.Cleanup(srv.Close)

	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/"
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

// TestBroadcastReachesClient verifies that Broadcast sends a STATE_UPDATE
// envelope to every connected client.
func TestBroadcastReachesClient(t *testing.T) {
	hub := NewHub()
	conn := dialTestServer(t, hub)

	// Give the handler time to register the client before we broadcast.
	time.Sleep(20 * time.Millisecond)

	payload := map[string]string{"hello": "world"}
	hub.Broadcast(payload)

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("ReadMessage: %v", err)
	}

	var env Envelope
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}
	if env.Type != MsgStateUpdate {
		t.Errorf("expected type %q, got %q", MsgStateUpdate, env.Type)
	}

	var got map[string]string
	if err := json.Unmarshal(env.Payload, &got); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	if got["hello"] != "world" {
		t.Errorf("payload mismatch: got %v", got)
	}
}

// TestBroadcastReachesMultipleClients verifies fan-out to N clients.
func TestBroadcastReachesMultipleClients(t *testing.T) {
	hub := NewHub()
	const n = 3
	conns := make([]*websocket.Conn, n)
	for i := range n {
		conns[i] = dialTestServer(t, hub)
	}

	time.Sleep(30 * time.Millisecond)
	hub.Broadcast(map[string]int{"x": 42})

	for i, conn := range conns {
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("client %d ReadMessage: %v", i, err)
		}
		var env Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			t.Fatalf("client %d unmarshal: %v", i, err)
		}
		if env.Type != MsgStateUpdate {
			t.Errorf("client %d: expected STATE_UPDATE, got %q", i, env.Type)
		}
	}
}

// TestFaultInjectRouted verifies that a FAULT_INJECT message sent by a client
// is parsed and forwarded to hub.FaultCh.
func TestFaultInjectRouted(t *testing.T) {
	hub := NewHub()
	conn := dialTestServer(t, hub)
	time.Sleep(20 * time.Millisecond)

	// Build and send a FAULT_INJECT envelope manually.
	payloadBytes, _ := json.Marshal(FaultPayload{
		Action:  "kill",
		Targets: []int{2},
	})
	envelope, _ := json.Marshal(Envelope{
		Type:    MsgFaultInject,
		Payload: payloadBytes,
	})
	if err := conn.WriteMessage(websocket.TextMessage, envelope); err != nil {
		t.Fatalf("WriteMessage: %v", err)
	}

	select {
	case fault := <-hub.FaultCh:
		if fault.Action != "kill" {
			t.Errorf("action = %q, want %q", fault.Action, "kill")
		}
		if len(fault.Targets) != 1 || fault.Targets[0] != 2 {
			t.Errorf("targets = %v, want [2]", fault.Targets)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("FaultCh received nothing within timeout")
	}
}

// TestClientDisconnectCleansUp verifies that closing a client connection
// removes it from the hub so future broadcasts don't try to reach it.
func TestClientDisconnectCleansUp(t *testing.T) {
	hub := NewHub()
	conn := dialTestServer(t, hub)
	time.Sleep(20 * time.Millisecond)

	hub.mu.Lock()
	before := len(hub.clients)
	hub.mu.Unlock()

	conn.Close()
	time.Sleep(50 * time.Millisecond) // let readPump detect the close

	hub.mu.Lock()
	after := len(hub.clients)
	hub.mu.Unlock()

	if before != 1 {
		t.Errorf("expected 1 client before disconnect, got %d", before)
	}
	if after != 0 {
		t.Errorf("expected 0 clients after disconnect, got %d", after)
	}
}

func TestClientLifecycleHooks(t *testing.T) {
	hub := NewHub()

	var firstCalls, zeroCalls int
	hub.SetClientHooks(
		func() { firstCalls++ },
		func() { zeroCalls++ },
	)

	c1 := &client{send: make(chan []byte, 1)}
	c2 := &client{send: make(chan []byte, 1)}

	hub.register(c1)
	if firstCalls != 1 {
		t.Fatalf("expected onFirstClient to fire once, got %d", firstCalls)
	}
	if got := hub.ActiveClients(); got != 1 {
		t.Fatalf("active clients = %d, want 1", got)
	}

	hub.register(c2)
	if firstCalls != 1 {
		t.Fatalf("expected onFirstClient to stay at 1, got %d", firstCalls)
	}
	if got := hub.ActiveClients(); got != 2 {
		t.Fatalf("active clients = %d, want 2", got)
	}

	hub.unregister(c2)
	if zeroCalls != 0 {
		t.Fatalf("expected onNoClients not to fire yet, got %d", zeroCalls)
	}
	if got := hub.ActiveClients(); got != 1 {
		t.Fatalf("active clients = %d, want 1", got)
	}

	hub.unregister(c1)
	if zeroCalls != 1 {
		t.Fatalf("expected onNoClients to fire once, got %d", zeroCalls)
	}
	if got := hub.ActiveClients(); got != 0 {
		t.Fatalf("active clients = %d, want 0", got)
	}
}

// TestHandlerUpgradesHTTP verifies that a plain HTTP request to the ws
// endpoint gets a 101 Switching Protocols response (not a 404 or 500).
func TestHandlerUpgradesHTTP(t *testing.T) {
	hub := NewHub()
	srv := httptest.NewServer(Handler(hub))
	defer srv.Close()

	resp, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	// A non-WebSocket GET to the ws endpoint should get 400 Bad Request
	// from gorilla/websocket (not a 200 or 5xx).
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for non-WS request, got %d", resp.StatusCode)
	}
}
