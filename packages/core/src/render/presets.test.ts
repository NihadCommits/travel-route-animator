import { describe, expect, it } from 'vitest';
import { codecHasAlpha, OutputSettingsSchema, outputExtensionOf } from '../model/output';
import { defaultOutput } from '../model/defaults';
import { RenderRequestSchema } from './job';
import { EXPORT_PRESETS, presetOf, type ExportPresetId } from './presets';

describe('codecs', () => {
  it('know which keep an alpha channel and which file they write', () => {
    expect(codecHasAlpha('h264')).toBe(false);
    expect(codecHasAlpha('prores-422hq')).toBe(false);
    expect(codecHasAlpha('prores-4444')).toBe(true);
    expect(codecHasAlpha('png-sequence')).toBe(true);
    expect(outputExtensionOf('h264')).toBe('.mp4');
    expect(outputExtensionOf('prores-4444')).toBe('.mov');
    expect(outputExtensionOf('png-sequence')).toBe('');
  });
});

describe('export presets', () => {
  it('are valid output settings', () => {
    for (const id of Object.keys(EXPORT_PRESETS) as ExportPresetId[]) {
      const output = { ...defaultOutput(), ...EXPORT_PRESETS[id] };
      expect(OutputSettingsSchema.safeParse(output).success, id).toBe(true);
      expect(presetOf(output)).toBe(id);
    }
  });

  it('are recognised only when every setting matches', () => {
    const reel = { ...defaultOutput(), ...EXPORT_PRESETS['reel-1080x1920-30'] };
    expect(presetOf({ ...reel, fps: 25 })).toBeUndefined();
  });
});

describe('render requests', () => {
  it('may set codec and overlay for this render only', () => {
    const request = RenderRequestSchema.parse({
      projectId: 'p_1',
      etappeId: 'e_1',
      output: { codec: 'prores-4444', transparentOverlay: true },
    });
    expect(request.output).toEqual({ codec: 'prores-4444', transparentOverlay: true });
    expect(
      RenderRequestSchema.safeParse({ projectId: 'p_1', etappeId: 'e_1', output: { codec: 'gif' } })
        .success,
    ).toBe(false);
  });
});
