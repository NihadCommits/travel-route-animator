import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing/sampleProject';
import { parseProjectFile } from './migrations';
import { v7ToV8 } from './v7-to-v8';

/** A format 7 file: stages have no counters for speed, heart rate and the time of day. */
function format7File(): Record<string, unknown> {
  const project = JSON.parse(JSON.stringify(sampleProject())) as {
    groups: { etappen: { overlays: Record<string, unknown> }[] }[];
  };
  for (const group of project.groups) {
    for (const etappe of group.etappen) {
      delete etappe.overlays.speedCounter;
      delete etappe.overlays.heartRateCounter;
      delete etappe.overlays.clockCounter;
    }
  }
  return { ...project, schemaVersion: 7 };
}

describe('migration 7 → 8', () => {
  it('adds the new counters, switched off, and changes nothing else', () => {
    const file = format7File();
    const before = JSON.stringify(file);
    const result = parseProjectFile(file);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    expect(result.data).toEqual(sampleProject());
    expect(JSON.stringify(file)).toBe(before);
  });

  it('leaves what it does not understand for validation', () => {
    expect(v7ToV8.migrate({ name: 'x' })).toEqual({ name: 'x' });
    expect(v7ToV8.migrate({ groups: [{ etappen: [{ overlays: 'odd' }] }] })).toEqual({
      groups: [{ etappen: [{ overlays: 'odd' }] }],
    });
  });
});
