import { resolve } from 'node:path';

export interface ServiceConfig {
  photonUrl: string;
  /** Sent to free services, which ask callers to identify themselves. */
  userAgent: string;
}

const DEFAULT_PHOTON_URL = 'https://photon.komoot.io';

/** PHOTON_URL and SERVICE_CONTACT from .env; a self-hosted Photon only needs another URL. */
export function resolveServiceConfig(env: NodeJS.ProcessEnv): ServiceConfig {
  const photonUrl = env.PHOTON_URL?.trim() || DEFAULT_PHOTON_URL;
  if (!/^https?:\/\//.test(photonUrl) || !URL.canParse(photonUrl)) {
    throw new Error(`PHOTON_URL must be an http(s) URL, got "${photonUrl}"`);
  }
  const contact = env.SERVICE_CONTACT?.trim();
  return {
    photonUrl,
    userAgent: `travel-route-animator (local tool${contact ? `; ${contact}` : ''})`,
  };
}

/** DATA_DIR from .env; relative paths count from the repo root, not from apps/server. */
export function resolveDataDir(env: NodeJS.ProcessEnv, repoRoot: string): string {
  return resolve(repoRoot, env.DATA_DIR?.trim() || './data');
}

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
