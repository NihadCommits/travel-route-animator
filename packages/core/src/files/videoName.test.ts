import { describe, expect, it } from 'vitest';
import { cleanVideoName, MAX_VIDEO_NAME_LENGTH, suggestVideoName } from './videoName';

describe('suggestVideoName', () => {
  it('names the stage, its format and the local time', () => {
    const at = new Date(2026, 9, 29, 15, 30, 59);
    expect(
      suggestVideoName('Lissabon – Algarve', { aspect: '16:9', resolution: '1080p' }, at),
    ).toBe('lissabon-algarve_16x9_1080p_20261029-1530');
    expect(suggestVideoName('Wohin morgen?', { aspect: '9:16', resolution: '2160p' }, at)).toBe(
      'wohin-morgen_9x16_2160p_20261029-1530',
    );
  });
});

describe('cleanVideoName', () => {
  it('keeps an ordinary name, umlauts and spaces included', () => {
    expect(cleanVideoName('Algarve für Reels')).toBe('Algarve für Reels');
    expect(cleanVideoName('  lissabon_v2.mp4 ')).toBe('lissabon_v2');
  });

  it('never lets a name leave the output folder', () => {
    // No slash survives, and the leading dots go as well.
    expect(cleanVideoName('../../data/projects/x')).toBe('-..-data-projects-x');
    expect(cleanVideoName('C:\\Windows\\x')).toBe('C--Windows-x');
    expect(cleanVideoName('a/b')).toBe('a-b');
  });

  it('removes what Windows or the render itself would trip over', () => {
    expect(cleanVideoName('was?*<>|"')).toBe('was------');
    expect(cleanVideoName(`tab${String.fromCharCode(9)}name`)).toBe('tab-name');
    expect(cleanVideoName('fertig.partial')).toBe('fertig');
    expect(cleanVideoName('ende...')).toBe('ende');
    expect(cleanVideoName('.versteckt')).toBe('versteckt');
    expect(cleanVideoName('CON')).toBe('CON-video');
  });

  it('refuses a name with nothing left, and shortens a long one', () => {
    expect(cleanVideoName('   ')).toBeNull();
    expect(cleanVideoName('...')).toBeNull();
    expect(cleanVideoName('a'.repeat(300))).toHaveLength(MAX_VIDEO_NAME_LENGTH);
  });
});
