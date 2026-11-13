import {
  CURRENT_SCHEMA_VERSION,
  validateProject,
  type ValidationIssue,
} from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { translateIssue } from './issues';

describe('translateIssue', () => {
  it('shows core issues in German, using their values', () => {
    expect(
      translateIssue({
        path: 'x',
        message: 'Track runs until 8.5 s, but the stage is only 8 s long',
        code: 'track.timingOutsideEtappe',
        values: { startSec: 1, endSec: 8.5, etappeSec: 8 },
      }),
    ).toBe('Die Fahrt dauert bis 8,5 s, die Etappe nur 8 s.');
  });

  it('names the vehicle in German', () => {
    expect(
      translateIssue({
        path: 'x',
        message: '',
        code: 'track.routingNotAllowed',
        values: { vehicle: 'plane', mode: 'road' },
      }),
    ).toBe('Dieses Routing passt nicht zum Fahrzeug Flugzeug.');
  });

  it('falls back to the original message for issues without a code or check', () => {
    expect(translateIssue({ path: 'durationSec', message: 'Too small' })).toBe('Too small');
  });

  it('explains Zod’s built-in checks from their limit', () => {
    const issue = (check: NonNullable<ValidationIssue['check']>) =>
      translateIssue({ path: 'x', message: 'Zod says no', check });
    expect(issue({ kind: 'too_small', origin: 'number', limit: 0, inclusive: false })).toBe(
      'Muss größer als 0 sein.',
    );
    expect(issue({ kind: 'too_small', origin: 'number', limit: 0, inclusive: true })).toBe(
      'Mindestens 0.',
    );
    expect(issue({ kind: 'too_big', origin: 'number', limit: 85, inclusive: true })).toBe(
      'Höchstens 85.',
    );
    expect(issue({ kind: 'too_small', origin: 'string', limit: 1, inclusive: true })).toBe(
      'Darf nicht leer sein.',
    );
    expect(issue({ kind: 'too_big', origin: 'string', limit: 3, inclusive: true })).toBe(
      'Höchstens 3 Zeichen.',
    );
    expect(issue({ kind: 'invalid_type', expected: 'number' })).toBe('Bitte eine Zahl eingeben.');
    expect(issue({ kind: 'other' })).toBe('Ungültiger Wert.');
  });

  it('translates what core actually reports', () => {
    const project = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: 'p',
      name: 'x',
      createdAt: '2026-10-21T00:00:00.000Z',
      updatedAt: '2026-10-21T00:00:00.000Z',
      defaults: {
        mapStyle: { base: 'vector' },
        output: {
          aspect: '16:9',
          resolution: '1080p',
          fps: 25,
          codec: 'h264',
          transparentOverlay: true,
          safeAreaGuides: false,
        },
        transition: { type: 'cut', durationSec: 0 },
      },
      groups: [],
      assets: [],
    };
    const result = validateProject(project);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(translateIssue(result.issues[0]!)).toMatch(/ProRes 4444/);
    }
  });
});
