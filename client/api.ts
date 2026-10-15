import { useCallback, useEffect, useState } from "react";
import type { Snapshot } from "../shared/contracts";
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
export function useSystem() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [connected, setConnected] = useState(false),
    [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    try {
      setSnapshot(await api<Snapshot>("/state"));
      setAuthenticated(true);
    } catch {
      setAuthenticated(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!authenticated) return;
    let disposed = false,
      socket: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/events`,
      );
      socket.onopen = () => setConnected(true);
      socket.onmessage = (e) => setSnapshot(JSON.parse(e.data));
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) timer = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [authenticated]);
  return { snapshot, connected, authenticated, refresh };
}
