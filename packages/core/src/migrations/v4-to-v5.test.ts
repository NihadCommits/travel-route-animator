import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing/sampleProject';
import { parseProjectFile } from './migrations';
import { v4ToV5 } from './v4-to-v5';

/** A format 4 file: stages know nothing of height profiles yet. */
function format4File(): Record<string, unknown> {
  const project = JSON.parse(JSON.stringify(sampleProject())) as {
    groups: { etappen: { overlays: Record<string, unknown> }[] }[];
  };
  for (const group of project.groups) {
    for (const etappe of group.etappen) {
      delete etappe.overlays.elevationProfile;
      delete etappe.overlays.elevationCounter;
    }
  }
  return { ...project, schemaVersion: 4 };
}

describe('migration 4 → 5', () => {
  it('switches the height profile and the climb counter off in every stage', () => {
    const file = format4File();
    const before = JSON.stringify(file);
    const result = parseProjectFile(file);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    expect(result.data).toEqual(sampleProject());
    expect(JSON.stringify(file)).toBe(before);
  });

  it('leaves what it does not understand for validation', () => {
    expect(v4ToV5.migrate({ name: 'x' })).toEqual({ name: 'x' });
    expect(v4ToV5.migrate({ groups: [{ etappen: [{ overlays: 3 }, 'odd'] }] })).toEqual({
      groups: [{ etappen: [{ overlays: 3 }, 'odd'] }],
    });
  });
});
