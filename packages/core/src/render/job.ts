import { z } from 'zod';
import {
  AspectSchema,
  CodecSchema,
  FpsSchema,
  ResolutionSchema,
  type OutputSettings,
} from '../model/output';
import { IdSchema } from '../model/primitives';

// The render API between the editor and the local server (M7): what the render dialog asks
// for, and what the render list shows about each job.

/**
 * A render request. The server loads the project itself, as saved; the editor saves before
 * it asks. The output settings override the project's defaults for this render only.
 */
export const RenderRequestSchema = z
  .strictObject({
    projectId: IdSchema,
    /** One stage. */
    etappeId: IdSchema.optional(),
    /** Several stages as one video, in this order (ADR 0011). */
    etappeIds: z.array(IdSchema).min(1).optional(),
    output: z
      .strictObject({
        aspect: AspectSchema.optional(),
        resolution: ResolutionSchema.optional(),
        fps: FpsSchema.optional(),
        codec: CodecSchema.optional(),
        transparentOverlay: z.boolean().optional(),
      })
      .default({}),
    /** Without extension; checked with cleanVideoName. Missing: suggestVideoName. */
    fileName: z.string().max(300).optional(),
  })
  .refine((request) => (request.etappeId === undefined) !== (request.etappeIds === undefined), {
    message: 'Give either etappeId or etappeIds',
  });
export type RenderRequest = z.input<typeof RenderRequestSchema>;

export type RenderJobState = 'queued' | 'preparing' | 'rendering' | 'done' | 'failed' | 'cancelled';

/** What a finished file really is, read back from the file itself. */
export interface VideoInfo {
  width: number;
  height: number;
  /** Null when the video is too short to tell. */
  fps: number | null;
  durationSec: number;
}

export interface RenderJob {
  id: string;
  projectId: string;
  projectName: string;
  etappeId: string;
  etappeName: string;
  /** The settings it renders with: the project's defaults plus the dialog's overrides. */
  output: OutputSettings;
  /** Absolute path of the video. The file is there only once the job is done. */
  outputPath: string;
  state: RenderJobState;
  /** 0 to 1 while rendering; 1 when done. */
  progress: number;
  /** Remotion's estimate of the time still needed, while rendering. */
  remainingMs: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  video: VideoInfo | null;
  error: string | null;
}

export function isRenderJobFinished(state: RenderJobState): boolean {
  return state === 'done' || state === 'failed' || state === 'cancelled';
}
