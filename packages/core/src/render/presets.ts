import type { OutputSettings } from '../model/output';

// Ready-made export settings for the render dialog (M13). Fixed data: the dialog fills its
// fields from a preset, and every field stays changeable afterwards.

export type PresetOutput = Pick<
  OutputSettings,
  'aspect' | 'resolution' | 'fps' | 'codec' | 'transparentOverlay'
>;

export const EXPORT_PRESETS = {
  'youtube-4k-25': {
    aspect: '16:9',
    resolution: '2160p',
    fps: 25,
    codec: 'h264',
    transparentOverlay: false,
  },
  'youtube-1080-25': {
    aspect: '16:9',
    resolution: '1080p',
    fps: 25,
    codec: 'h264',
    transparentOverlay: false,
  },
  'reel-1080x1920-30': {
    aspect: '9:16',
    resolution: '1080p',
    fps: 30,
    codec: 'h264',
    transparentOverlay: false,
  },
  /** Only route, vehicles and labels, to lay over footage in Premiere. */
  'overlay-prores-4444': {
    aspect: '16:9',
    resolution: '1080p',
    fps: 25,
    codec: 'prores-4444',
    transparentOverlay: true,
  },
} as const satisfies Record<string, PresetOutput>;

export type ExportPresetId = keyof typeof EXPORT_PRESETS;

/** The preset these settings match exactly, if any. */
export function presetOf(output: PresetOutput): ExportPresetId | undefined {
  return (Object.keys(EXPORT_PRESETS) as ExportPresetId[]).find((id) => {
    const preset: PresetOutput = EXPORT_PRESETS[id];
    return (Object.keys(preset) as (keyof PresetOutput)[]).every(
      (key) => preset[key] === output[key],
    );
  });
}
