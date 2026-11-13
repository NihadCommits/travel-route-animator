import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing/sampleProject';
import { parseProjectFile } from './migrations';
import { v5ToV6 } from './v5-to-v6';

/** A format 5 file: the credits have no corner yet. */
function format5File(): Record<string, unknown> {
  const project = JSON.parse(JSON.stringify(sampleProject())) as {
    groups: { etappen: { overlays: Record<string, unknown> }[] }[];
  };
  for (const group of project.groups) {
    for (const etappe of group.etappen) delete etappe.overlays.attributionCorner;
  }
  return { ...project, schemaVersion: 5 };
}

describe('migration 5 → 6', () => {
  it('keeps the credits at the bottom right in every stage', () => {
    const file = format5File();
    const before = JSON.stringify(file);
    const result = parseProjectFile(file);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    expect(result.data).toEqual(sampleProject());
    expect(JSON.stringify(file)).toBe(before);
  });

  it('leaves what it does not understand for validation', () => {
    expect(v5ToV6.migrate({ name: 'x' })).toEqual({ name: 'x' });
    expect(v5ToV6.migrate({ groups: [{ etappen: [{ overlays: 3 }] }] })).toEqual({
      groups: [{ etappen: [{ overlays: 3 }] }],
    });
  });
});
