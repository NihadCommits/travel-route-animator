import { resolve } from 'node:path';

export interface ServiceConfig {
  photonUrl: string;
  orsUrl: string;
  /** Missing: road routes go to OSRM only on request, the editor explains why. */
  orsApiKey: string | undefined;
  osrmUrl: string;
  /** Sent to free services, which ask callers to identify themselves. */
  userAgent: string;
}

const DEFAULTS = {
  PHOTON_URL: 'https://photon.komoot.io',
  ORS_URL: 'https://api.openrouteservice.org',
  OSRM_URL: 'https://routing.openstreetmap.de',
};

/** A service URL from .env, or its public default; a self-hosted service only needs another URL. */
function serviceUrl(env: NodeJS.ProcessEnv, name: keyof typeof DEFAULTS): string {
  const url = env[name]?.trim() || DEFAULTS[name];
  if (!/^https?:\/\//.test(url) || !URL.canParse(url)) {
    throw new Error(`${name} must be an http(s) URL, got "${url}"`);
  }
  return url;
}

/** Service URLs, ORS_API_KEY and SERVICE_CONTACT from .env. */
export function resolveServiceConfig(env: NodeJS.ProcessEnv): ServiceConfig {
  const contact = env.SERVICE_CONTACT?.trim();
  return {
    photonUrl: serviceUrl(env, 'PHOTON_URL'),
    orsUrl: serviceUrl(env, 'ORS_URL'),
    orsApiKey: env.ORS_API_KEY?.trim() || undefined,
    osrmUrl: serviceUrl(env, 'OSRM_URL'),
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
