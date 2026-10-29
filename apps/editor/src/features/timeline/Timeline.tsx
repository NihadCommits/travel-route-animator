import {
  compileTimeline,
  locateItem,
  type Etappe,
  type Id,
  type Timeline as StageTimeline,
  type Track,
  type TrackPlan,
} from '@travel-route-animator/core';
import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { trackName } from '@/features/inspector/parts';
import { VEHICLE_ICONS } from '@/features/editor/vehicleIcons';
import { usePlayerBridge, usePreviewFrame } from '@/features/preview/playerBridge';
import { de } from '@/i18n/de';
import { cn } from '@/lib/utils';
import { selectEtappeId, selectProject, useEditor } from '@/state/editorStore';
import { formatSec, percentOf, rulerTicks, secAtPointer, type BarSpan } from './scale';
import { useBarDrag } from './useBarDrag';

/** Used for the ruler's spacing until the panel has been measured (and in tests). */
const FALLBACK_WIDTH_PX = 600;

/**
 * The stage's time below the workspace (M6): a ruler, one bar per vehicle, its holds and the
 * preview's playhead. Times come from the same compiled timeline as the preview and the
 * export, so a bar shows exactly when its vehicle moves.
 */
export function Timeline() {
  const etappeId = useEditor(selectEtappeId);
  if (etappeId === null) return <Placeholder text={de.timeline.pickEtappe} />;
  return <EtappeTimeline etappeId={etappeId} />;
}

function EtappeTimeline({ etappeId }: { etappeId: Id }) {
  const project = useEditor(selectProject);
  const timeline = useMemo(() => compileTimeline(project, etappeId), [project, etappeId]);
  const etappe = useMemo(() => {
    const location = locateItem(project, etappeId);
    if (location?.kind !== 'etappe') return undefined;
    return project.groups[location.groupIndex]!.etappen[location.etappeIndex];
  }, [project, etappeId]);
  const laneRef = useRef<HTMLDivElement>(null);
  const laneWidth = useElementWidth(laneRef) || FALLBACK_WIDTH_PX;

  if (!etappe) return null;
  const totalSec = timeline.introSec + timeline.mainSec + timeline.outroSec;

  return (
    <section
      aria-label={de.timeline.label}
      className="h-full overflow-x-hidden overflow-y-auto text-xs"
    >
      <div className="relative min-h-full">
        <Ruler
          laneRef={laneRef}
          etappeId={etappeId}
          totalSec={totalSec}
          widthPx={laneWidth}
          timeline={timeline}
        />
        {etappe.tracks.length === 0 ? (
          <p className="text-muted-foreground p-3">{de.timeline.noTracks}</p>
        ) : (
          <ul>
            {etappe.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                plan={timeline.tracks.find((plan) => plan.trackId === track.id)}
                etappe={etappe}
                timeline={timeline}
                totalSec={totalSec}
              />
            ))}
          </ul>
        )}
        <Shading timeline={timeline} totalSec={totalSec} />
        <Playhead etappeId={etappeId} fps={timeline.fps} totalSec={totalSec} />
      </div>
    </section>
  );
}

// Label column and lanes; the shading and the playhead span the lanes of every row.
const ROW = 'grid grid-cols-[10rem_1fr] pr-3';
const LANES = 'pointer-events-none absolute inset-y-0 right-3 left-40';

function Ruler({
  laneRef,
  etappeId,
  totalSec,
  widthPx,
  timeline,
}: {
  laneRef: RefObject<HTMLDivElement | null>;
  etappeId: Id;
  totalSec: number;
  widthPx: number;
  timeline: StageTimeline;
}) {
  const bridge = usePlayerBridge();
  const ticks = rulerTicks(totalSec, widthPx);
  const fine = (ticks[1] ?? 1) < 1;
  const lastFrame = timeline.durationInFrames - 1;

  // Clicking or dragging on the ruler moves the playhead; the preview follows if it is open.
  function seekTo(event: PointerEvent<HTMLDivElement>) {
    const sec = secAtPointer(event.clientX, event.currentTarget.getBoundingClientRect(), totalSec);
    bridge.seek(etappeId, Math.min(Math.round(sec * timeline.fps), lastFrame));
  }

  return (
    <div className={cn(ROW, 'bg-card sticky top-0 z-10 h-6 border-b')}>
      <div />
      <div
        ref={laneRef}
        role="presentation"
        title={de.timeline.ruler}
        className="relative cursor-pointer touch-none select-none"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekTo(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) seekTo(event);
        }}
      >
        {ticks.map((sec) => (
          <span
            key={sec}
            className="text-muted-foreground absolute bottom-0 h-2 border-l pl-1 leading-none"
            style={{ left: `${percentOf(sec, totalSec)}%` }}
          >
            <span className="absolute bottom-2.5 -translate-x-1/2 whitespace-nowrap">
              {formatSec(sec, fine ? 1 : 0)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Where the bar of a track sits: as compiled, or for a track without points from its timing. */
function spanOf(track: Track, plan: TrackPlan | undefined, mainSec: number): BarSpan {
  if (plan) return { startSec: plan.startSec, endSec: plan.endSec };
  const { startOffsetSec, durationSec } = track.timing;
  return { startSec: startOffsetSec, endSec: startOffsetSec + (durationSec ?? mainSec) };
}

function TrackRow({
  track,
  plan,
  etappe,
  timeline,
  totalSec,
}: {
  track: Track;
  plan: TrackPlan | undefined;
  etappe: Etappe;
  timeline: StageTimeline;
  totalSec: number;
}) {
  const selected = useEditor((state) => state.selectedId === track.id);
  const select = useEditor((state) => state.select);
  const span = spanOf(track, plan, timeline.mainSec);
  const drag = useBarDrag({
    track,
    span,
    mainSec: etappe.durationSec,
    fps: timeline.fps,
    totalSec,
  });
  const Icon = VEHICLE_ICONS[track.vehicle.type];
  const name = trackName(track);
  const start = formatSec(span.startSec);
  const end = track.timing.durationSec === undefined ? undefined : formatSec(span.endSec);
  const lengthSec = Math.max(span.endSec - span.startSec, 0);
  const holds = plan?.phases.filter((phase) => phase.kind === 'hold') ?? [];

  return (
    <li className={cn(ROW, 'h-8 border-b')}>
      <button
        type="button"
        className={cn(
          'hover:bg-accent flex min-w-0 items-center gap-1.5 px-2 text-left',
          selected && 'bg-accent font-medium',
        )}
        onClick={() => select(track.id)}
      >
        <Icon className="size-3.5 shrink-0" style={{ color: track.style.lineColor }} />
        <span className="truncate">{name}</span>
      </button>
      <div data-timeline-lane className="relative">
        <div
          role="slider"
          tabIndex={0}
          aria-label={de.timeline.bar(name)}
          aria-valuemin={0}
          aria-valuemax={etappe.durationSec}
          aria-valuenow={span.startSec}
          aria-valuetext={de.timeline.barValue(start, end)}
          title={`${name}: ${de.timeline.barValue(start, end)}\n${de.timeline.barHint}`}
          className={cn(
            'absolute inset-y-1.5 cursor-grab touch-none rounded-sm border border-black/20 shadow-sm',
            'focus-visible:ring-ring outline-none focus-visible:ring-2',
            selected && 'ring-primary ring-2',
          )}
          style={{
            left: `${percentOf(timeline.introSec + span.startSec, totalSec)}%`,
            width: `${percentOf(lengthSec, totalSec)}%`,
            backgroundColor: track.style.lineColor,
          }}
          onPointerDown={(event) => drag.onPointerDown(event, 'move')}
          onKeyDown={drag.onKeyDown}
        >
          {holds.map((hold) => (
            <span
              key={hold.startSec}
              className="absolute inset-y-0 bg-black/30"
              style={{
                left: `${percentOf(hold.startSec - span.startSec, lengthSec)}%`,
                width: `${percentOf(hold.endSec - hold.startSec, lengthSec)}%`,
              }}
            />
          ))}
          <span
            data-handle="start"
            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize"
            onPointerDown={(event) => drag.onPointerDown(event, 'start')}
          />
          <span
            data-handle="end"
            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
            onPointerDown={(event) => drag.onPointerDown(event, 'end')}
          />
        </div>
      </div>
    </li>
  );
}

/** Intro and outro are not the vehicles' time: hatched, so the bars' room stands out. */
function Shading({ timeline, totalSec }: { timeline: StageTimeline; totalSec: number }) {
  const hatch = {
    backgroundImage:
      'repeating-linear-gradient(135deg, rgb(0 0 0 / 0.06) 0 4px, transparent 4px 8px)',
  };
  const areas = [
    { label: de.timeline.intro, startSec: 0, sec: timeline.introSec },
    {
      label: de.timeline.outro,
      startSec: timeline.introSec + timeline.mainSec,
      sec: timeline.outroSec,
    },
  ];
  return (
    <div aria-hidden className={LANES}>
      {areas
        .filter((area) => area.sec > 0)
        .map((area) => (
          <div
            key={area.label}
            title={area.label}
            className="absolute inset-y-0"
            style={{
              ...hatch,
              left: `${percentOf(area.startSec, totalSec)}%`,
              width: `${percentOf(area.sec, totalSec)}%`,
            }}
          />
        ))}
    </div>
  );
}

/** Its own component: it re-renders on every frame while the preview plays, the rest not. */
function Playhead({ etappeId, fps, totalSec }: { etappeId: Id; fps: number; totalSec: number }) {
  const frame = usePreviewFrame(etappeId);
  return (
    <div aria-hidden className={cn(LANES, 'z-20')}>
      {/* Two pixels wide: a one-pixel line often falls between two and blurs to grey. */}
      <div
        className="bg-destructive absolute inset-y-0 w-0.5 -translate-x-1/2"
        style={{ left: `${Math.min(percentOf(frame / fps, totalSec), 100)}%` }}
      />
    </div>
  );
}

function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center p-4 text-center">
      {text}
    </div>
  );
}
