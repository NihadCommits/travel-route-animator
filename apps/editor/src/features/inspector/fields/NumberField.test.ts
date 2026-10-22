import { describe, expect, it } from 'vitest';
import { formatNumber, parseNumber } from './NumberField';

describe('parseNumber', () => {
  it('reads decimal commas and points, and negative numbers', () => {
    expect(parseNumber('12,5')).toEqual({ value: 12.5 });
    expect(parseNumber(' 12.5 ')).toEqual({ value: 12.5 });
    expect(parseNumber('-40')).toEqual({ value: -40 });
    expect(parseNumber(',5')).toEqual({ value: 0.5 });
  });

  it('takes a trailing separator as a step while typing', () => {
    expect(parseNumber('2,')).toEqual({ value: 2 });
  });

  it('rejects what is not a number, including an empty field', () => {
    for (const text of ['', '-', 'abc', '1,2,3', '1e3', '12 s']) {
      expect(parseNumber(text)).toEqual({ error: 'Bitte eine Zahl eingeben.' });
    }
  });
});

describe('formatNumber', () => {
  it('writes numbers the German way, without grouping and long fractions', () => {
    expect(formatNumber(12.5)).toBe('12,5');
    expect(formatNumber(1500)).toBe('1500');
    expect(formatNumber(1 / 3)).toBe('0,333');
  });
});
