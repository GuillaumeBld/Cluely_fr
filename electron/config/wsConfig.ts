const DEFAULT_WS_PORT = 8765;

export interface WsConfig {
  port: number;
}

let currentPort = DEFAULT_WS_PORT;

export function getWsConfig(): WsConfig {
  return { port: currentPort };
}

export function setWsPort(port: number): void {
  if (port < 1024 || port > 65535) {
    console.warn(`[WsConfig] Invalid port ${port}, ignoring`);
    return;
  }
  currentPort = port;
}
