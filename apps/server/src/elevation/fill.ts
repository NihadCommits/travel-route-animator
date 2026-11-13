import {
  toElevationRequest,
  tracksAwaitingElevation,
  type Id,
  type Project,
} from '@travel-route-animator/core';
import type { ElevationSampler } from './sampler';

/**
 * The project with heights on every route of these stages that needs them and has none yet
 * (ADR 0012). The editor usually got them already; this covers files written elsewhere. A
 * route whose heights cannot be had stays without: the stage then shows no profile, and
 * planes take off at sea level, but the video still renders.
 */
export async function fillElevations(
  project: Project,
  etappeIds: readonly Id[],
  sampler: ElevationSampler,
  warn: (message: string) => void,
): Promise<Project> {
  const wanted = new Set(etappeIds);
  const groups = await Promise.all(
    project.groups.map(async (group) => ({
      ...group,
      etappen: await Promise.all(
        group.etappen.map(async (etappe) => {
          if (!wanted.has(etappe.id)) return etappe;
          const awaiting = new Set(tracksAwaitingElevation(etappe));
          if (awaiting.size === 0) return etappe;
          const tracks = [];
          // One route after the other: they share tiles, and the tile source is not ours.
          for (const track of etappe.tracks) {
            const request = awaiting.has(track) ? toElevationRequest(track) : undefined;
            if (!request) {
              tracks.push(track);
              continue;
            }
            try {
              const elevation = await sampler.sample(request.line, request.stepM);
              tracks.push({ ...track, computed: { ...track.computed!, elevation } });
            } catch (error) {
              warn(`No heights for "${track.label ?? track.id}": ${String(error)}`);
              tracks.push(track);
            }
          }
          return { ...etappe, tracks };
        }),
      ),
    })),
  );
  return { ...project, groups };
}
