import { describe, expect, it } from 'vitest';
import { editTrack } from '../edit/operations';
import { editWaypoint } from '../edit/waypoints';
import { sampleProject } from '../testing/sampleProject';
import { isRouteStale } from './inputHash';
import { refreshLocalRoutes } from './refresh';

const NOW = '2026-10-26T12:00:00.000Z';
const LATER = '2026-10-26T12:05:00.000Z';

const tracksOf = (project: ReturnType<typeof sampleProject>) =>
  project.groups.flatMap((g) => g.etappen.flatMap((e) => e.tracks));

describe('refreshLocalRoutes', () => {
  it('computes the routes of planes and trains, and leaves cars to the router', () => {
    const project = refreshLocalRoutes(sampleProject(), NOW);
    for (const track of tracksOf(project)) {
      const local = track.routing.mode === 'great-circle' || track.routing.mode === 'smooth';
      expect(isRouteStale(track)).toBe(!local);
    }
  });

  it('returns the very same project when every route is fresh', () => {
    const project = refreshLocalRoutes(sampleProject(), NOW);
    expect(refreshLocalRoutes(project, LATER)).toBe(project);
  });

  it('recomputes only the track that changed and keeps the rest identical', () => {
    const project = refreshLocalRoutes(sampleProject(), NOW);
    const moved = editWaypoint(project, 't_train', 'w_linz', (w) => ({
      ...w,
      lngLat: [14.3, 48.1],
    }));
    const refreshed = refreshLocalRoutes(moved, LATER);

    const train = refreshed.groups[0]!.etappen[0]!.tracks[0]!;
    expect(isRouteStale(train)).toBe(false);
    expect(train.computed!.computedAt).toBe(LATER);
    expect(refreshed.groups[0]!.etappen[1]).toBe(moved.groups[0]!.etappen[1]);
    expect(refreshed.groups[1]).toBe(moved.groups[1]);
  });

  it('drops a route that no longer fits a track with too few points', () => {
    const project = refreshLocalRoutes(sampleProject(), NOW);
    const single = editTrack(project, 't_plane', (track) => ({
      ...track,
      waypoints: track.waypoints.slice(0, 1),
    }));
    const once = refreshLocalRoutes(single, LATER);
    expect(once.groups[0]!.etappen[1]!.tracks[0]).not.toHaveProperty('computed');
    // Nothing left to drop the second time.
    expect(refreshLocalRoutes(once, LATER)).toBe(once);
  });
});
