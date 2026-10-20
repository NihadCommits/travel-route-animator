export interface ListenOptions {
  host: string;
  port: number;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 5174;

// The server holds API keys and writes files, so it must never be reachable from the network.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function resolveListenOptions(env: NodeJS.ProcessEnv): ListenOptions {
  const host = env.HOST?.trim() || DEFAULT_HOST;
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`HOST must be a loopback address (127.0.0.1, localhost, ::1), got "${host}"`);
  }

  const rawPort = env.PORT?.trim();
  const port = rawPort ? Number(rawPort) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${rawPort}"`);
  }

  return { host, port };
}
