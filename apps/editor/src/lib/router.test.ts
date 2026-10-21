import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { hrefFor, navigate, parseHash, useRoute } from './router';

describe('parseHash and hrefFor', () => {
  it('read and write the editor route', () => {
    expect(parseHash('#/projekt/p_abc')).toEqual({ name: 'editor', projectId: 'p_abc' });
    expect(hrefFor({ name: 'editor', projectId: 'p_abc' })).toBe('#/projekt/p_abc');
  });

  it('fall back to the overview for anything else', () => {
    for (const hash of ['', '#/', '#/projekt/', '#/irgendwas', '#/projekt/a/b']) {
      expect(parseHash(hash)).toEqual({ name: 'overview' });
    }
    expect(hrefFor({ name: 'overview' })).toBe('#/');
  });

  it('survive IDs with characters that need escaping', () => {
    const route = { name: 'editor' as const, projectId: 'p_a b/c' };
    expect(parseHash(hrefFor(route))).toEqual(route);
  });
});

describe('useRoute', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('follows hash changes', async () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ name: 'overview' });

    await act(async () => {
      navigate({ name: 'editor', projectId: 'p_1' });
      await new Promise((done) => window.addEventListener('hashchange', done, { once: true }));
    });

    expect(result.current).toEqual({ name: 'editor', projectId: 'p_1' });
  });
});
