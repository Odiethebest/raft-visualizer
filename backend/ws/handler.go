package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// writeWait is how long a write to the client is allowed to take before
	// we consider the connection dead and close it.
	writeWait = 10 * time.Second

	// pongWait is how long we wait for the client to respond to a ping.
	// Must be greater than pingPeriod.
	pongWait = 60 * time.Second

	// pingPeriod is how often we ping the client to keep the connection alive
	// and detect stale connections. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// maxMessageSize caps incoming messages. A FAULT_INJECT payload is tiny;
	// this just prevents a misbehaving client from sending huge payloads.
	maxMessageSize = 4096
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	// Allow all origins for local development. In production you'd check
	// r.Header.Get("Origin") against an allowlist here.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Handler returns an http.HandlerFunc that upgrades the connection to
// WebSocket and starts the read/write pumps for the new client.
func Handler(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("ws: upgrade failed: %v", err)
			return
		}

		c := &client{
			conn: conn,
			send: make(chan []byte, 64),
		}
		hub.register(c)

		// writePump and readPump each run in their own goroutine and share
		// ownership of the connection. writePump owns all conn.Write calls;
		// readPump owns all conn.Read calls. They coordinate shutdown via
		// the send channel: when readPump exits it calls unregister, which
		// closes send, which causes writePump to exit.
		go writePump(c, hub)
		go readPump(c, hub)
	}
}

// readPump reads incoming messages from the client and routes them to the
// hub's FaultCh. It runs for the lifetime of the connection; when the
// connection closes (or errors), it unregisters the client and returns.
//
// Only one goroutine may call conn.ReadMessage at a time; this is it.
func readPump(c *client, hub *Hub) {
	defer func() {
		hub.unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		// Each pong resets the deadline, keeping the connection alive as long
		// as the client is responding to pings.
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			// Browsers often close without a status code (1005) on refresh/navigation.
			// Treat common client disconnect paths as expected to avoid noisy logs.
			if websocket.IsUnexpectedCloseError(
				err,
				websocket.CloseNormalClosure,
				websocket.CloseGoingAway,
				websocket.CloseNoStatusReceived,
			) {
				log.Printf("ws: unexpected close: %v", err)
			}
			return
		}

		var env Envelope
		if err := parseEnvelope(data, &env); err != nil {
			log.Printf("ws: bad envelope: %v", err)
			continue
		}

		if env.Type == MsgFaultInject {
			var payload FaultPayload
			if err := parseEnvelope(env.Payload, &payload); err != nil {
				log.Printf("ws: bad fault payload: %v", err)
				continue
			}
			select {
			case hub.FaultCh <- payload:
			default:
				log.Printf("ws: FaultCh full, dropping fault inject")
			}
		}
	}
}

// writePump drains the client's send channel and writes messages to the
// connection. It also sends periodic pings to detect stale connections.
//
// Only one goroutine may call conn.WriteMessage at a time; this is it.
func writePump(c *client, hub *Hub) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// hub closed the channel — connection is being torn down.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// parseEnvelope is a thin wrapper around json.Unmarshal used in both the
// envelope and payload parsing paths to keep the error handling uniform.
func parseEnvelope(data []byte, v any) error {
	return json.Unmarshal(data, v)
}
