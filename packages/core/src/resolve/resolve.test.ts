import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing/sampleProject';
import { findEtappe, resolveMapStyle, resolveOutput, resolveTransition } from './resolve';

// In the sample: e_train inherits everything, e_flight sets its own map style,
// and group g_day4 (stage e_options) sets map style and transition.

describe('resolveMapStyle', () => {
  it('uses the stage style when the stage sets one', () => {
    expect(resolveMapStyle(sampleProject(), 'e_flight')).toEqual({
      value: { base: 'satellite' },
      from: 'etappe',
    });
  });

  it('falls back to the group style', () => {
    expect(resolveMapStyle(sampleProject(), 'e_options')).toEqual({
      value: { base: 'vector', themeId: 'night' },
      from: 'group',
    });
  });

  it('falls back to the project default', () => {
    expect(resolveMapStyle(sampleProject(), 'e_train')).toEqual({
      value: { base: 'vector' },
      from: 'project',
    });
  });

  it('lets the stage win over its group', () => {
    const project = sampleProject();
    project.groups[1]!.etappen[0]!.mapStyle = { base: 'terrain' };
    expect(resolveMapStyle(project, 'e_options')).toEqual({
      value: { base: 'terrain' },
      from: 'etappe',
    });
  });

  it('takes the first set level as a whole instead of merging fields', () => {
    const project = sampleProject();
    project.defaults.mapStyle = {
      base: 'vector',
      themeId: 'clean',
      overrides: { water: '#0000ff' },
    };
    expect(resolveMapStyle(project, 'e_options').value).toEqual({
      base: 'vector',
      themeId: 'night',
    });
  });

  it('fails loudly for an unknown stage', () => {
    expect(() => resolveMapStyle(sampleProject(), 'e_missing')).toThrow(
      'Stage "e_missing" does not exist in project "Sample trip"',
    );
  });
});

describe('resolveTransition', () => {
  it('uses the group transition when the group sets one', () => {
    expect(resolveTransition(sampleProject(), 'e_options')).toEqual({
      value: { type: 'fade', durationSec: 0.5 },
      from: 'group',
    });
  });

  it('falls back to the project default', () => {
    expect(resolveTransition(sampleProject(), 'e_train')).toEqual({
      value: { type: 'camera-fly', durationSec: 1.5 },
      from: 'project',
    });
  });
});

describe('resolveOutput', () => {
  it('returns the project output settings', () => {
    expect(resolveOutput(sampleProject())).toMatchObject({ fps: 25, codec: 'h264' });
  });

  it('applies overrides from the render dialog', () => {
    expect(resolveOutput(sampleProject(), { aspect: '9:16', fps: 30 })).toMatchObject({
      aspect: '9:16',
      fps: 30,
      resolution: '1080p',
    });
  });

  it('rejects an override that makes the combination invalid', () => {
    expect(() => resolveOutput(sampleProject(), { transparentOverlay: true })).toThrow(
      /prores-4444/,
    );
  });
});

describe('findEtappe', () => {
  it('returns the stage together with its group', () => {
    const found = findEtappe(sampleProject(), 'e_options');
    expect(found?.group.id).toBe('g_day4');
    expect(found?.etappe.name).toBe('Where to tomorrow?');
  });

  it('returns undefined for an unknown stage', () => {
    expect(findEtappe(sampleProject(), 'nope')).toBeUndefined();
  });
});
