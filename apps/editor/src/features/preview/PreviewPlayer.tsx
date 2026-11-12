import '@/features/map/maplibreWorker';
import { Player, type PlayerRef } from '@remotion/player';
import type { Id, Project } from '@travel-route-animator/core';
import { EtappeComposition, timelineOf, type EtappeProps } from '@travel-route-animator/scene';
import { Pause, Play, Repeat, SquareDashed, StepBack, StepForward } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SegmentedControl, type SegmentOption } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatSec } from '@/features/timeline/scale';
import { de } from '@/i18n/de';
import { useOwnThemes } from '@/features/inspector/mapStyles';
import { assetUrl } from '@/lib/api';
import { selectProject, useEditor, type PreviewSettings } from '@/state/editorStore';
import { usePlayerBridge, usePreviewFrame, usePreviewPlaying } from './playerBridge';

const PREVIEW_SCALE = { half: 0.5, full: 1 } as const;

const QUALITY_OPTIONS: SegmentOption<PreviewSettings['quality']>[] = [
  { value: 'half', label: de.preview.half, hint: de.preview.halfHint },
  { value: 'full', label: de.preview.full, hint: de.preview.fullHint },
];

/**
 * The stage in Remotion's Player, drawn by exactly the composition the export renders (M5).
 * Every edit changes the props and shows up at once, without reloading and without jumping
 * back to the start.
 */
export function PreviewPlayer({ etappeId }: { etappeId: Id }) {
  const project = useEditor(selectProject);
  const quality = useEditor((state) => state.preview.quality);
  const loop = useEditor((state) => state.preview.loop);
  const bridge = usePlayerBridge();
  const [player, setPlayer] = useState<PlayerRef | null>(null);

  // The preview loads the project's images from the server; a render gets them inside its props.
  const { assets } = project;
  const assetUrls = useMemo(
    () => Object.fromEntries(assets.map((asset) => [asset.id, assetUrl(project.id, asset)])),
    [assets, project.id],
  );
  // Own themes come from the server; satellite tiles too, through the editor's own origin.
  const themes = useOwnThemes();
  const inputProps = useMemo<EtappeProps>(
    () => ({
      project,
      etappeId,
      previewScale: PREVIEW_SCALE[quality],
      guides: project.defaults.output.safeAreaGuides,
      assetUrls,
      themes: { ...themes },
      serverUrl: window.location.origin,
    }),
    [project, etappeId, quality, assetUrls, themes],
  );
  // Length, frame rate and size the same way the export works them out (calculateMetadata).
  const timeline = useMemo(() => timelineOf(inputProps), [inputProps]);
  const { fps, durationInFrames } = timeline;
  // Where this stage's preview was left; the player owns the frame from then on.
  const [initialFrame] = useState(() =>
    Math.min(bridge.frameOf(etappeId), timeline.durationInFrames - 1),
  );

  useEffect(() => {
    if (!player) return;
    return bridge.attach({ etappeId, player, fps, durationInFrames });
  }, [bridge, player, etappeId, fps, durationInFrames]);

  return (
    <div className="flex h-full flex-col">
      <div className="bg-muted min-h-0 flex-1">
        <Player
          ref={setPlayer}
          component={EtappeComposition}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={timeline.width}
          compositionHeight={timeline.height}
          initialFrame={initialFrame}
          loop={loop}
          clickToPlay
          doubleClickToFullscreen={false}
          // Our own shortcuts handle the space bar, also when the focus is elsewhere.
          spaceKeyToPlayOrPause={false}
          // Without the loop the last frame stays, the arrival is what one wants to judge.
          moveToBeginningWhenEnded={false}
          // Free for individuals (remotion.dev/license); silences the reminder in the console.
          acknowledgeRemotionLicense
          errorFallback={({ error }) => (
            <div className="text-destructive flex h-full items-center justify-center p-4 text-center">
              {de.preview.failed} {error.message}
            </div>
          )}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <Controls etappeId={etappeId} fps={fps} lastFrame={durationInFrames - 1} />
    </div>
  );
}

function Controls({ etappeId, fps, lastFrame }: { etappeId: Id; fps: number; lastFrame: number }) {
  const bridge = usePlayerBridge();
  const frame = usePreviewFrame(etappeId);
  const playing = usePreviewPlaying();
  const quality = useEditor((state) => state.preview.quality);
  const loop = useEditor((state) => state.preview.loop);
  const setPreview = useEditor((state) => state.setPreview);
  const guides = useEditor((state) => selectProject(state).defaults.output.safeAreaGuides);
  const applyIfValid = useEditor((state) => state.applyIfValid);

  // The guides are a project setting (output.safeAreaGuides): saved and undoable like any other.
  const toggleGuides = () =>
    applyIfValid((p): Project => ({
      ...p,
      defaults: { ...p.defaults, output: { ...p.defaults.output, safeAreaGuides: !guides } },
    }));

  return (
    <div
      role="group"
      aria-label={de.preview.controls}
      className="bg-card flex h-9 shrink-0 items-center gap-1 border-t px-2 text-xs"
    >
      <ControlButton label={de.preview.frameBack} onClick={() => bridge.step(-1)}>
        <StepBack />
      </ControlButton>
      <ControlButton
        label={playing ? de.preview.pause : de.preview.play}
        onClick={bridge.togglePlay}
      >
        {playing ? <Pause /> : <Play />}
      </ControlButton>
      <ControlButton label={de.preview.frameForward} onClick={() => bridge.step(1)}>
        <StepForward />
      </ControlButton>
      <span className="ml-2 tabular-nums">
        {formatSec(frame / fps, 2)} / {formatSec(lastFrame / fps, 2)}
      </span>
      <span className="text-muted-foreground ml-2 tabular-nums">
        {de.preview.frame(frame, lastFrame)}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <ControlButton
          label={de.preview.loop}
          pressed={loop}
          onClick={() => setPreview({ loop: !loop })}
        >
          <Repeat />
        </ControlButton>
        <ControlButton label={de.preview.guides} pressed={guides} onClick={toggleGuides}>
          <SquareDashed />
        </ControlButton>
        <SegmentedControl
          label={de.preview.quality}
          value={quality}
          options={QUALITY_OPTIONS}
          onChange={(value) => setPreview({ quality: value })}
          className="ml-1"
        />
      </div>
    </div>
  );
}

function ControlButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={pressed ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
