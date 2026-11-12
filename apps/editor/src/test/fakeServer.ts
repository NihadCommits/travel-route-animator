import {
  createProject,
  defaultOutput,
  type ImageAsset,
  type Place,
  type Project,
  type RenderJob,
  type RenderRequest,
  type RouteRequest,
  type Theme,
} from '@travel-route-animator/core';
import { vi } from 'vitest';

/** The job the fake server answers a render request with, as the real one would queue it. */
export function fakeRenderJob(request: RenderRequest, patch: Partial<RenderJob> = {}): RenderJob {
  const etappeId = request.etappeId ?? request.etappeIds?.join('+') ?? '';
  return {
    id: `job_${etappeId}`,
    projectId: request.projectId,
    projectName: 'Portugal 2026',
    etappeId,
    etappeName: 'Wien – Porto',
    output: { ...defaultOutput(), ...request.output },
    outputPath: `C:\\videos\\portugal-2026\\${request.fileName ?? 'video'}.mp4`,
    state: 'queued',
    progress: 0,
    remainingMs: null,
    createdAt: '2026-10-29T15:30:00.000Z',
    startedAt: null,
    finishedAt: null,
    video: null,
    error: null,
    ...patch,
  };
}

export interface FakeSearch {
  /** Answers /api/airports; undefined stands for missing airport data (503). */
  airports?: (query: string) => Place[];
  /** Answers /api/geocode; undefined stands for an unreachable place search (502). */
  places?: (query: string, bias: string | null) => Place[];
  /** Answers POST /api/route; undefined stands for a server without ORS key (503 no_key). */
  route?: (request: RouteRequest) => { status: number; body: unknown };
  /** Answers POST /api/render; undefined queues the job (fakeRenderJob). */
  render?: (request: RenderRequest) => { status: number; body: unknown };
  /** Answers POST /api/render/:id/reveal; undefined stands for Windows (204). */
  revealStatus?: number;
  /** Whether satellite maps are on (/api/capabilities); off by default, as without a key. */
  satellite?: boolean;
  /** Answers POST /api/projects/:id/assets; undefined accepts the image (fakeImageAsset). */
  upload?: (name: string) => { status: number; body: unknown };
}

/** What the server answers an accepted image with: a GIF of 8 pictures or a PNG. */
export function fakeImageAsset(name: string, id = 'a_image'): ImageAsset {
  const gif = name.toLowerCase().endsWith('.gif');
  return {
    id,
    kind: 'image',
    name,
    mimeType: gif ? 'image/gif' : 'image/png',
    widthPx: 96,
    heightPx: 128,
    frameCount: gif ? 8 : 1,
  };
}

/**
 * A tiny in-memory stand-in for the local server's API, installed as `fetch`.
 * Tests work against the same requests the real editor sends.
 */
export function installFakeServer(initial: Project[] = [], search: FakeSearch = {}) {
  const projects = new Map(initial.map((project) => [project.id, project]));
  const renders: RenderJob[] = [];
  const themes = new Map<string, Theme>();
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let failAll = false;

  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const path = url.replace(/^\/api/, '');
    calls.push({ method, path, body });

    if (failAll) return Promise.reject(new TypeError('Failed to fetch'));

    const searchUrl = new URL(path, 'http://editor.test');
    const q = searchUrl.searchParams.get('q') ?? '';
    if (searchUrl.pathname === '/airports') {
      return Promise.resolve(
        search.airports
          ? json(200, { places: search.airports(q) })
          : json(503, { error: 'airports_missing', message: 'run pnpm data:airports' }),
      );
    }
    if (searchUrl.pathname === '/geocode') {
      return Promise.resolve(
        search.places
          ? json(200, { places: search.places(q, searchUrl.searchParams.get('bias')) })
          : json(502, { error: 'geocoding_unavailable', message: 'down' }),
      );
    }

    if (searchUrl.pathname === '/render') {
      if (method === 'GET') return Promise.resolve(json(200, renders));
      const request = body as RenderRequest;
      const answer = search.render
        ? search.render(request)
        : { status: 202, body: fakeRenderJob(request) };
      if (answer.status === 202) renders.push(answer.body as RenderJob);
      return Promise.resolve(json(answer.status, answer.body));
    }
    const renderId = /^\/render\/([^/]+)(\/reveal)?$/.exec(searchUrl.pathname);
    if (renderId) {
      if (renderId[2]) {
        const status = search.revealStatus ?? 204;
        return Promise.resolve(
          status === 204
            ? new Response(null, { status })
            : json(status, { error: 'not_supported', message: 'Windows only' }),
        );
      }
      const index = renders.findIndex(({ id }) => id === renderId[1]);
      if (index >= 0) renders.splice(index, 1);
      return Promise.resolve(new Response(null, { status: 204 }));
    }

    if (searchUrl.pathname === '/route') {
      const answer = search.route
        ? search.route(body as RouteRequest)
        : { status: 503, body: { error: 'no_key', message: 'ORS_API_KEY is not set in .env' } };
      return Promise.resolve(json(answer.status, answer.body));
    }

    if (searchUrl.pathname === '/capabilities') {
      return Promise.resolve(json(200, { satellite: search.satellite ?? false }));
    }
    if (searchUrl.pathname === '/themes') return Promise.resolve(json(200, [...themes.values()]));
    const themeId = /^\/themes\/([^/]+)$/.exec(searchUrl.pathname)?.[1];
    if (themeId && method === 'PUT') {
      themes.set(themeId, body as Theme);
      return Promise.resolve(json(200, body));
    }
    if (themeId && method === 'DELETE') {
      themes.delete(themeId);
      return Promise.resolve(new Response(null, { status: 204 }));
    }

    const upload = /^\/projects\/([^/]+)\/assets$/.exec(searchUrl.pathname);
    if (upload && method === 'POST') {
      const name = searchUrl.searchParams.get('name') ?? 'image';
      const answer = search.upload
        ? search.upload(name)
        : { status: 201, body: fakeImageAsset(name, `a_${calls.length}`) };
      return Promise.resolve(json(answer.status, answer.body));
    }

    const id = decodeURIComponent(path.replace(/^\/projects\/?/, ''));
    if (path === '/projects' && method === 'GET') {
      const list = [...projects.values()].map(({ id, name, updatedAt }) => ({
        id,
        name,
        slug: id,
        updatedAt,
      }));
      return Promise.resolve(json(200, list));
    }
    if (path === '/projects' && method === 'POST') {
      const project = createProject((body as { name: string }).name);
      projects.set(project.id, project);
      return Promise.resolve(json(201, project));
    }
    const stored = projects.get(id);
    if (!stored) return Promise.resolve(json(404, { error: 'not_found', message: 'nope' }));
    if (method === 'GET') return Promise.resolve(json(200, stored));
    if (method === 'PUT') {
      const saved = { ...(body as Project), updatedAt: new Date().toISOString() };
      projects.set(id, saved);
      return Promise.resolve(json(200, saved));
    }
    if (method === 'DELETE') {
      projects.delete(id);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(json(405));
  });

  vi.stubGlobal('fetch', fetchMock);
  return {
    projects,
    renders,
    themes,
    calls,
    fetchMock,
    /** Simulates a stopped server. */
    goOffline: () => {
      failAll = true;
    },
  };
}
