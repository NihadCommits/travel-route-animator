import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveDataDir,
  resolveListenOptions,
  resolveOutputDir,
  resolveRenderConfig,
  resolveServiceConfig,
} from './config';

describe('resolveDataDir', () => {
  const repoRoot = resolve('/repo');

  it('defaults to data/ in the repo root', () => {
    expect(resolveDataDir({}, repoRoot)).toBe(resolve('/repo/data'));
  });

  it('resolves a relative DATA_DIR against the repo root and keeps absolute paths', () => {
    expect(resolveDataDir({ DATA_DIR: './my-data' }, repoRoot)).toBe(resolve('/repo/my-data'));
    expect(resolveDataDir({ DATA_DIR: resolve('/elsewhere') }, repoRoot)).toBe(
      resolve('/elsewhere'),
    );
  });
});

describe('resolveListenOptions', () => {
  it('defaults to 127.0.0.1:5174', () => {
    expect(resolveListenOptions({})).toEqual({ host: '127.0.0.1', port: 5174 });
  });

  it('accepts loopback hosts and a custom port', () => {
    expect(resolveListenOptions({ HOST: 'localhost', PORT: '8080' })).toEqual({
      host: 'localhost',
      port: 8080,
    });
    expect(resolveListenOptions({ HOST: '::1' }).host).toBe('::1');
  });

  it('refuses to listen on a network-reachable host', () => {
    expect(() => resolveListenOptions({ HOST: '0.0.0.0' })).toThrow(/loopback/);
    expect(() => resolveListenOptions({ HOST: '192.168.1.20' })).toThrow(/loopback/);
  });

  it('rejects invalid ports', () => {
    expect(() => resolveListenOptions({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => resolveListenOptions({ PORT: '70000' })).toThrow(/PORT/);
  });
});

describe('resolveServiceConfig', () => {
  it('uses the public Photon and names the contact in the User-Agent', () => {
    expect(resolveServiceConfig({ SERVICE_CONTACT: ' https://github.com/someone ' })).toEqual({
      photonUrl: 'https://photon.komoot.io',
      orsUrl: 'https://api.openrouteservice.org',
      orsApiKey: undefined,
      osrmUrl: 'https://routing.openstreetmap.de',
      userAgent: 'travel-route-animator (local tool; https://github.com/someone)',
    });
    expect(resolveServiceConfig({}).userAgent).toBe('travel-route-animator (local tool)');
  });

  it('reads the openrouteservice key and treats an empty one as missing', () => {
    expect(resolveServiceConfig({ ORS_API_KEY: ' abc123 ' }).orsApiKey).toBe('abc123');
    expect(resolveServiceConfig({ ORS_API_KEY: '' }).orsApiKey).toBeUndefined();
    expect(() => resolveServiceConfig({ OSRM_URL: 'routing.local' })).toThrow(/OSRM_URL/);
  });

  it('accepts another Photon, but only over http(s)', () => {
    expect(resolveServiceConfig({ PHOTON_URL: 'http://127.0.0.1:2322' }).photonUrl).toBe(
      'http://127.0.0.1:2322',
    );
    expect(() => resolveServiceConfig({ PHOTON_URL: 'ftp://photon' })).toThrow(/PHOTON_URL/);
  });
});

describe('resolveOutputDir', () => {
  it('defaults to output/ in the repo root and resolves OUTPUT_DIR like DATA_DIR', () => {
    const repoRoot = resolve('/repo');
    expect(resolveOutputDir({}, repoRoot)).toBe(resolve('/repo/output'));
    expect(resolveOutputDir({ OUTPUT_DIR: './videos' }, repoRoot)).toBe(resolve('/repo/videos'));
  });
});

describe('resolveRenderConfig', () => {
  it('renders on the GPU and bundles at start-up unless told otherwise', () => {
    expect(resolveRenderConfig({})).toEqual({ gl: 'angle', prepareOnStart: true });
    expect(resolveRenderConfig({ RENDER_GL: 'vulkan', RENDER_PREPARE_ON_START: 'false' })).toEqual({
      gl: 'vulkan',
      prepareOnStart: false,
    });
  });

  it('refuses an OpenGL backend Chromium does not know', () => {
    expect(() => resolveRenderConfig({ RENDER_GL: 'opengl' })).toThrow(/RENDER_GL/);
  });
});
