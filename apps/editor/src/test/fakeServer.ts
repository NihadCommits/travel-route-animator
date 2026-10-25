import { createProject, type Place, type Project } from '@travel-route-animator/core';
import { vi } from 'vitest';

export interface FakeSearch {
  /** Answers /api/airports; undefined stands for missing airport data (503). */
  airports?: (query: string) => Place[];
  /** Answers /api/geocode; undefined stands for an unreachable place search (502). */
  places?: (query: string, bias: string | null) => Place[];
}

/**
 * A tiny in-memory stand-in for the local server's API, installed as `fetch`.
 * Tests work against the same requests the real editor sends.
 */
export function installFakeServer(initial: Project[] = [], search: FakeSearch = {}) {
  const projects = new Map(initial.map((project) => [project.id, project]));
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
    calls,
    fetchMock,
    /** Simulates a stopped server. */
    goOffline: () => {
      failAll = true;
    },
  };
}
