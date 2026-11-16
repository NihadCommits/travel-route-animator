import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing/sampleProject';
import { parseProjectFile } from './migrations';
import { v8ToV9 } from './v8-to-v9';

type Json = Record<string, unknown>;

/** A format 8 file: overlays as switches, no overlay style and units in the defaults. */
function format8File(switches: Json): Json {
  const project = JSON.parse(JSON.stringify(sampleProject())) as {
    defaults: Json;
    groups: { etappen: { overlays: Json }[] }[];
  };
  delete project.defaults.overlayStyle;
  delete project.defaults.units;
  for (const group of project.groups) {
    for (const etappe of group.etappen) {
      delete etappe.overlays.widgets;
      Object.assign(etappe.overlays, {
        distanceCounter: false,
        timeCounter: false,
        elevationProfile: false,
        elevationCounter: false,
        speedCounter: false,
        heartRateCounter: false,
        clockCounter: false,
        ...switches,
      });
    }
  }
  return { ...project, schemaVersion: 8 };
}

describe('migration 8 → 9', () => {
  it('changes nothing for stages without overlays, and sets classic style and metric units', () => {
    const result = parseProjectFile(format8File({}));
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    expect(result.data).toEqual(sampleProject());
  });

  it('turns the switches into blocks where the values stood', () => {
    const result = parseProjectFile(
      format8File({
        title: 'Tag 4',
        distanceCounter: true,
        timeCounter: true,
        elevationProfile: true,
        elevationCounter: true,
        attributionCorner: 'bottom-left',
      }),
    );
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    const { widgets } = result.data.groups[0]!.etappen[0]!.overlays;
    const at = (kind: string) => widgets.find((widget) => widget.kind === kind)!;
    expect(widgets.map((widget) => widget.kind)).toEqual([
      'text',
      'elevationProfile',
      'climb',
      'distance',
      'travelTime',
    ]);
    expect(at('text')).toMatchObject({ text: 'Tag 4', anchor: 'top-left', dx: 48, dy: 44 });
    // Above the credits at the bottom left: the profile, the climb, then the counters in a row.
    expect(at('elevationProfile')).toMatchObject({ anchor: 'bottom-left', dx: 48, dy: 80 });
    expect(at('climb').dy).toBe(80 + 154 + 16);
    expect(at('distance')).toMatchObject({ dx: 48, dy: 80 + 154 + 16 + 76 + 16 });
    expect(at('travelTime').dx).toBe(48 + 236);
    expect(at('travelTime').dy).toBe(at('distance').dy);
  });

  it('leaves what it does not understand for validation', () => {
    expect(v8ToV9.migrate({ name: 'x' })).toEqual({ name: 'x' });
    expect(v8ToV9.migrate({ groups: [{ etappen: [{ overlays: 'odd' }] }] })).toEqual({
      groups: [{ etappen: [{ overlays: 'odd' }] }],
    });
  });
});
