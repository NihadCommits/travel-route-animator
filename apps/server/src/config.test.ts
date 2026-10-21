import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDataDir, resolveListenOptions } from './config';

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
