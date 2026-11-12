import {
  assetFileName,
  ComputedRouteSchema,
  ImageAssetSchema,
  type Asset,
  type ComputedRoute,
  type ImageAsset,
  type ImageProblem,
  type LngLat,
  type Place,
  type Project,
  type RenderJob,
  type RenderRequest,
  type RouteRequest,
  type Theme,
  type ValidationIssue,
} from '@travel-route-animator/core';

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
  /** An image the server refused, and the numbers for the message (ADR 0009). */
  problem?: ImageProblem;
  values?: Record<string, number>;
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
const renderPath = (id: string) => `/render/${encodeURIComponent(id)}`;

/** Where the preview and the inspector load a project's image from. */
export const assetUrl = (projectId: string, asset: Pick<Asset, 'id' | 'mimeType'>) =>
  `/api${projectPath(projectId)}/assets/${assetFileName(asset)}`;

/** Server-sent events of one render job; opened with EventSource, not fetch. */
export const renderEventsUrl = (id: string) => `/api${renderPath(id)}/events`;

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
  reversePlace: ([lng, lat]: LngLat) =>
    request<{ place: Place | null }>(
      `/reverse?${new URLSearchParams({ lng: String(lng), lat: String(lat), lang: PLACE_LANGUAGE })}`,
    ),
  // Road routes need the ORS key, which only the server has. The answer goes into the project,
  // so it is checked like any other part of it.
  computeRoute: async (route: RouteRequest, signal?: AbortSignal): Promise<ComputedRoute> =>
    ComputedRouteSchema.parse(
      await request<unknown>('/route', {
        method: 'POST',
        body: JSON.stringify(route),
        ...(signal && { signal }),
      }),
    ),
  // Rendering happens on the server, which loads the project as saved (M7).
  listRenders: () => request<RenderJob[]>('/render'),
  startRender: (render: RenderRequest) =>
    request<RenderJob>('/render', { method: 'POST', body: JSON.stringify(render) }),
  /** Cancels a waiting or running job; takes a finished one off the list. */
  cancelRender: (id: string) =>
    request<RenderJob | undefined>(renderPath(id), { method: 'DELETE' }),
  revealRender: (id: string) => request<undefined>(`${renderPath(id)}/reveal`, { method: 'POST' }),
  // Own map themes live with the server, outside every project (ADR 0010).
  listThemes: () => request<Theme[]>('/themes'),
  saveTheme: (theme: Theme) =>
    request<Theme>(`/themes/${encodeURIComponent(theme.id)}`, {
      method: 'PUT',
      body: JSON.stringify(theme),
    }),
  deleteTheme: (id: string) =>
    request<undefined>(`/themes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** What the server can offer, e.g. satellite maps only with a MapTiler key. */
  capabilities: () => request<{ satellite: boolean }>('/capabilities'),
  /**
   * Stores an image in the project's folder. The bytes go as they are; the server reads what
   * they are itself. The project learns of the image only when the editor saves its use.
   */
  uploadImage: async (projectId: string, file: Blob, name: string): Promise<ImageAsset> => {
    const response = await fetch(
      `/api${projectPath(projectId)}/assets?${new URLSearchParams({ name })}`,
      { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: file },
    );
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) throw new ApiError(response.status, body as ErrorBody | undefined);
    return ImageAssetSchema.parse(body);
  },
};
