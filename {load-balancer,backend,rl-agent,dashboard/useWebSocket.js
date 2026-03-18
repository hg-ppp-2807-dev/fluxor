// hooks/useWebSocket.js
// Drop-in replacement — auto-reconnects every 3s on disconnect

import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = "ws://localhost:8080/ws";

/**
 * useLBWebSocket
 * @param {(msg: object) => void} onMessage  — called with parsed JSON
 * @returns {{ connected: boolean }}
 */
export function useLBWebSocket(onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef    = useRef(null);
  const retryRef = useRef(null);
  const cbRef    = useRef(onMessage);

  // Keep callback ref fresh without triggering reconnects
  useEffect(() => { cbRef.current = onMessage; }, [onMessage]);

  const connect = useCallback(() => {
    // Close any lingering socket
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent duplicate retry
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[Fluxor] WS connected");
        setConnected(true);
        clearTimeout(retryRef.current);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          cbRef.current?.(msg);
        } catch (err) {
          console.warn("[Fluxor] Bad WS message:", e.data);
        }
      };

      ws.onerror = (e) => {
        console.warn("[Fluxor] WS error", e);
        ws.close();
      };

      ws.onclose = () => {
        setConnected(false);
        console.log("[Fluxor] WS closed — retrying in 3s");
        retryRef.current = setTimeout(connect, 3000);
      };
    } catch (err) {
      console.error("[Fluxor] WS init error:", err);
      retryRef.current = setTimeout(connect, 3000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // stop retry on unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}
