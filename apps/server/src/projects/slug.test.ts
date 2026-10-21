import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('turns a project name into a folder name', () => {
    expect(slugify('Portugal 2026')).toBe('portugal-2026');
    expect(slugify('  Tag 4: Lissabon → Algarve!  ')).toBe('tag-4-lissabon-algarve');
  });

  it('drops accents and spells out ß', () => {
    expect(slugify('Wien – Süd, Straße')).toBe('wien-sud-strasse');
    expect(slugify('São João')).toBe('sao-joao');
  });

  it('falls back to "project" when nothing usable is left', () => {
    expect(slugify('')).toBe('project');
    expect(slugify('🚆🚗')).toBe('project');
  });

  it('avoids folder names Windows does not allow', () => {
    expect(slugify('CON')).toBe('con-project');
    expect(slugify('Nul')).toBe('nul-project');
    expect(slugify('Console')).toBe('console');
  });

  it('keeps folder names short and without a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('keeps a free slug and numbers taken ones', () => {
    expect(uniqueSlug('trip', new Set())).toBe('trip');
    expect(uniqueSlug('trip', new Set(['trip']))).toBe('trip-2');
    expect(uniqueSlug('trip', new Set(['trip', 'trip-2']))).toBe('trip-3');
  });
});
