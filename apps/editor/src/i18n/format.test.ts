import { describe, expect, it } from 'vitest';
import { formatDistance, formatDuration } from './de';

// de-AT separates thousands with a non-breaking space; compare without caring which one.
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

describe('formatDistance', () => {
  it('shows a decimal only for short routes', () => {
    expect(formatDistance(8_437)).toBe('8,4 km');
    expect(formatDistance(9_000)).toBe('9 km');
    expect(plain(formatDistance(2_045_310))).toMatch(/^2[ .]045 km$/);
    expect(formatDistance(312_400)).toBe('312 km');
  });
});

describe('formatDuration', () => {
  it('rounds to minutes and adds hours when needed', () => {
    expect(formatDuration(2_700)).toBe('45 min');
    expect(formatDuration(12_000)).toBe('3 h 20 min');
    expect(formatDuration(7_190)).toBe('2 h');
  });
});
