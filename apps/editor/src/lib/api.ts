import type { LngLat, Place, Project, ValidationIssue } from '@travel-route-animator/core';

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
}

interface ErrorBody {
  error: string;
  message: string;
  issues?: ValidationIssue[];
  file?: string;
}

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    readonly status: number,
    readonly body: ErrorBody | undefined,
  ) {
    super(body?.message ?? `The server answered with HTTP ${status}`);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Only send a content type with a body: Fastify rejects an empty JSON body (e.g. on DELETE).
  const headers: HeadersInit =
    init.body === undefined ? {} : { 'content-type': 'application/json' };
  const response = await fetch(`/api${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(response.status, body as ErrorBody | undefined);
  return body as T;
}

const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;

/** Where the place search should look first: a point and roughly the map zoom around it. */
export interface SearchBias {
  lngLat: LngLat;
  zoom: number;
}

/** Results come in German; Photon falls back to the local name where there is no German one. */
const PLACE_LANGUAGE = 'de';

function placeSearchPath(query: string, bias: SearchBias | undefined): string {
  const params = new URLSearchParams({ q: query, lang: PLACE_LANGUAGE });
  if (bias) params.set('bias', [...bias.lngLat, bias.zoom].join(','));
  return `/geocode?${params}`;
}

/** The editor only talks to its own server; Vite proxies /api to it during development. */
export const api = {
  listProjects: () => request<ProjectSummary[]>('/projects'),
  getProject: (id: string) => request<Project>(projectPath(id)),
  createProject: (name: string) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  saveProject: (project: Project) =>
    request<Project>(projectPath(project.id), { method: 'PUT', body: JSON.stringify(project) }),
  deleteProject: (id: string) => request<undefined>(projectPath(id), { method: 'DELETE' }),
  // The place search goes through our server, never straight to Photon: the server caches,
  // throttles and identifies itself as fair use asks.
  searchAirports: (query: string, signal?: AbortSignal) =>
    request<{ places: Place[] }>(`/airports?${new URLSearchParams({ q: query })}`, {
      ...(signal && { signal }),
    }),
  searchPlaces: (query: string, bias: SearchBias | undefined, signal?: AbortSignal) =>
    request<{ places: Place[] }>(placeSearchPath(query, bias), { ...(signal && { signal }) }),
};
