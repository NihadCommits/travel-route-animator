import { describe, expect, it } from 'vitest';
import { resolveListenOptions } from './config';

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
