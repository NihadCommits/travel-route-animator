import {
  computeFrameState,
  formatHeight,
  overlayTokensOf,
  presenceOf,
  routingCredits,
  rowsOf,
  ROW_GAP,
  widgetText,
  type Anchor,
  type Corner,
  type FrameState,
  type OverlayStyle,
  type OverlayStyleTokens,
  type Timeline,
  type Widget,
} from '@travel-route-animator/core';
import { useMemo, type CSSProperties, type FC, type ReactNode } from 'react';
import { ElevationProfileChart } from './ElevationProfile';
import { flagAt } from './flags';
import { HeldImage } from './HeldImage';
import { fontFamilyOf, useOverlayFonts } from './fonts';

// HTML on top of the map, in the same reference size (1080 pixels on the short side) and
// scaled with it. The blocks of the overlay kit (M17, ADR 0017) each sit at an anchor plus an
// offset and take their look from the stage's style. Everything comes from the frame state;
// appearing and going are worked out from the frame's time, never by CSS transitions
// (Determinismus).

/** How far a sliding block travels, in reference pixels. */
const SLIDE_PX = 40;
/** The profile panel's width: wide enough to read, never wider than the picture allows. */
const PROFILE_WIDTH = 860;
const MARGIN = 48;

/** The credits in their corner (ADR 0013), a little in from the edges. */
function cornerStyle(corner: Corner): CSSProperties {
  const [vertical, horizontal] = corner.split('-') as ['top' | 'bottom', 'left' | 'right'];
  return { [vertical]: 10, [horizontal]: 12 };
}

/** Where a block goes and which of its points lies there (CSS of the outer box). */
export function placementOf(widget: Pick<Widget, 'anchor' | 'dx' | 'dy' | 'scale'>): CSSProperties {
  const [vertical, horizontal] = splitAnchor(widget.anchor);
  const style: CSSProperties = { position: 'absolute' };
  const shift: string[] = [];
  if (horizontal === 'left') style.left = widget.dx;
  else if (horizontal === 'right') style.right = widget.dx;
  else {
    style.left = `calc(50% + ${widget.dx}px)`;
    shift.push('translateX(-50%)');
  }
  if (vertical === 'top') style.top = widget.dy;
  else if (vertical === 'bottom') style.bottom = widget.dy;
  else {
    style.top = `calc(50% + ${widget.dy}px)`;
    shift.push('translateY(-50%)');
  }
  if (widget.scale !== 1) shift.push(`scale(${widget.scale})`);
  if (shift.length > 0) style.transform = shift.join(' ');
  // Scaling grows the block away from its anchor, so it never moves off its edge.
  style.transformOrigin = `${vertical === 'middle' ? 'center' : vertical} ${horizontal}`;
  return style;
}

export function splitAnchor(
  anchor: Anchor,
): [vertical: 'top' | 'middle' | 'bottom', horizontal: 'left' | 'center' | 'right'] {
  const vertical = anchor.startsWith('top')
    ? 'top'
    : anchor.startsWith('bottom')
      ? 'bottom'
      : 'middle';
  const horizontal = anchor.endsWith('left')
    ? 'left'
    : anchor.endsWith('right')
      ? 'right'
      : 'center';
  return [vertical, horizontal];
}

function rgba(hex: string, opacity: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

/**
 * The box and text of a style. A box keeps the padding the counters always had (10 × 22
 * reference pixels, at any text size), so a project from before 1.2.0 looks exactly as it did;
 * a block grows as a whole with its scale. A pill's round ends need more room at the sides.
 */
export function boxStyleOf(tokens: OverlayStyleTokens): CSSProperties {
  const box: CSSProperties = {
    fontFamily: fontFamilyOf(tokens.font),
    fontWeight: tokens.weight,
    fontSize: tokens.size,
    color: tokens.textColor,
    textTransform: tokens.uppercase ? 'uppercase' : undefined,
    whiteSpace: 'pre',
    boxSizing: 'border-box',
  };
  if (tokens.background !== 'none') {
    box.padding = `10px ${tokens.background === 'pill' ? Math.max(22, tokens.size * 0.6) : 22}px`;
    box.backgroundColor = rgba(tokens.backgroundColor, tokens.backgroundOpacity);
    box.borderRadius = tokens.background === 'pill' ? 999 : tokens.radius;
    if (tokens.background === 'glass') box.backdropFilter = 'blur(14px)';
    if (tokens.shadow) box.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.35)';
  }
  const shadows: string[] = [];
  if (tokens.outline) {
    shadows.push(
      ...['-2px -2px', '2px -2px', '-2px 2px', '2px 2px'].map(
        (at) => `${at} 0 rgba(0, 0, 0, 0.85)`,
      ),
    );
  }
  if (tokens.shadow && tokens.background === 'none') shadows.push('0 3px 10px rgba(0, 0, 0, 0.65)');
  if (shadows.length > 0) box.textShadow = shadows.join(', ');
  return box;
}

/** Blocks whose number gains digits on the way; their box keeps its widest size throughout. */
const COUNTING = new Set<Widget['kind']>([
  'distance',
  'travelTime',
  'climb',
  'altitude',
  'speed',
  'heartRate',
  'cadence',
]);
/** How many moments of the stage are read to find the widest text of a counting block. */
const WIDEST_SAMPLES = 40;

/**
 * The widest text each counting block shows over the stage, so its box has that width from the
 * start and does not grow under the viewer's eyes towards its neighbours. Read at the end (where
 * distance and time are largest) and at moments in between (height and speed go up and down).
 */
function useWidestTexts(timeline: Timeline, context: Parameters<typeof widgetText>[2]) {
  return useMemo(() => {
    const widest = new Map<string, string>();
    const counting = timeline.overlays.widgets.filter((widget) => COUNTING.has(widget.kind));
    if (counting.length === 0) return widest;
    const last = timeline.durationInFrames - 1;
    const frames = [
      last,
      ...Array.from({ length: WIDEST_SAMPLES }, (_, i) => Math.round((i * last) / WIDEST_SAMPLES)),
    ];
    for (const frame of frames) {
      const state = computeFrameState(timeline, frame);
      for (const widget of counting) {
        const text = widgetText(widget, state, context);
        // Digits are of equal width (tabular), so the longest text is the widest.
        if (text !== undefined && text.length > (widest.get(widget.id)?.length ?? 0)) {
          widest.set(widget.id, text);
        }
      }
    }
    return widest;
  }, [timeline, context]);
}

export const Overlays: FC<{
  timeline: Timeline;
  state: FrameState;
  /** The map's own credits, by source (styleCredits). */
  credits: readonly string[];
  /** The user's own overlay styles (data/overlay-styles), for a stage that uses one. */
  ownStyles?: readonly OverlayStyle[] | undefined;
  /**
   * Render only: draw this block alone, for its own transparent video (M18). The other blocks
   * of its row keep their room unseen, so it stands exactly where it stands in the video.
   */
  only?: string | undefined;
}> = ({ timeline, state, credits: mapCredits, ownStyles, only }) => {
  const { overlays, viewport, scale } = timeline;
  const credits = [...mapCredits, ...routingCredits(timeline.tracks.map((t) => t.provider))];
  const stageTokens = useMemo(
    () => overlayTokensOf(timeline.overlayStyle, ownStyles),
    [timeline.overlayStyle, ownStyles],
  );
  const tokensOf = (widget: Widget) =>
    widget.style ? { ...stageTokens, ...widget.style } : stageTokens;
  useOverlayFonts([stageTokens.font, ...overlays.widgets.map((widget) => tokensOf(widget).font)]);
  const context = useMemo(
    () => ({ units: timeline.units, timeZone: timeline.clock?.timeZone }),
    [timeline.units, timeline.clock?.timeZone],
  );
  const widest = useWidestTexts(timeline, context);
  const profile = timeline.elevation;
  const profileColor =
    timeline.tracks.find((plan) => plan.trackId === profile?.trackId)?.style.lineColor ?? '#ffffff';

  const content = (widget: Widget, tokens: OverlayStyleTokens): ReactNode => {
    const units = widget.unit ?? timeline.units;
    if (widget.kind === 'elevationProfile') {
      const reading = state.elevation;
      if (!profile || !reading) return null;
      const box = boxStyleOf(tokens);
      return (
        <ElevationProfileChart
          profile={profile.profile}
          reading={reading}
          color={profileColor}
          textColor={tokens.textColor}
          width={Math.min(PROFILE_WIDTH, viewport.width - 2 * MARGIN)}
          heightText={formatHeight(reading.elevationM, units)}
          style={{
            fontFamily: box.fontFamily,
            backgroundColor: box.backgroundColor ?? 'transparent',
            // The panel is bigger than a counter: a little rounder in a box, never a full pill.
            borderRadius:
              tokens.background === 'box'
                ? tokens.radius + 4
                : tokens.background === 'pill'
                  ? 32
                  : 0,
            ...(box.backdropFilter && { backdropFilter: box.backdropFilter }),
            ...(box.textShadow && { textShadow: box.textShadow }),
          }}
        />
      );
    }
    if (widget.kind === 'flag') {
      const { lngLat } = state.counters;
      const url = lngLat && flagAt(lngLat);
      if (!url) return null;
      const k = tokens.size / 44;
      return (
        <div style={boxStyleOf(tokens)}>
          {widget.label && <div style={{ fontSize: tokens.size * 0.45 }}>{widget.label}</div>}
          <HeldImage
            src={url}
            style={{
              display: 'block',
              height: tokens.size * 1.1,
              aspectRatio: '4 / 3',
              borderRadius: 4 * k,
              boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.2)',
            }}
          />
        </div>
      );
    }
    if (widget.kind === 'progress') {
      const share = state.counters.progress;
      if (share === undefined) return null;
      const k = tokens.size / 44;
      return (
        <div style={{ ...boxStyleOf(tokens), width: 420 * k }}>
          {widget.label && <div style={{ fontSize: tokens.size * 0.45 }}>{widget.label}</div>}
          <div
            style={{
              height: 14 * k,
              borderRadius: 7 * k,
              backgroundColor: rgba(tokens.textColor, 0.25),
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${share * 100}%`,
                height: '100%',
                backgroundColor: tokens.textColor,
              }}
            />
          </div>
        </div>
      );
    }
    const text = widgetText(widget, state, context);
    if (text === undefined) return null;
    const room = widest.get(widget.id);
    return (
      <div style={{ ...boxStyleOf(tokens), fontVariantNumeric: 'tabular-nums' }}>
        {widget.label && (
          <div style={{ fontSize: tokens.size * 0.45, opacity: 0.8, letterSpacing: '0.04em' }}>
            {widget.label}
          </div>
        )}
        {room === undefined || room === text ? (
          text
        ) : (
          // The widest text, hidden in the same grid cell, gives the box its final width exactly.
          <div style={{ display: 'grid' }}>
            <span style={{ gridArea: '1 / 1' }}>{text}</span>
            <span style={{ gridArea: '1 / 1', visibility: 'hidden' }}>{room}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      data-overlay-layer
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: viewport.width,
        height: viewport.height,
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: 'top left',
        pointerEvents: 'none',
      }}
    >
      {rowsOf(overlays.widgets).map((row) => {
        if (only !== undefined && !row.some((widget) => widget.id === only)) return null;
        const shown = row.flatMap((widget) => {
          const presence = presenceOf(widget, state.sec);
          if (presence <= 0) return [];
          const inner = content(widget, tokensOf(widget));
          if (inner === null) return [];
          // Alone in its video: its neighbours keep their room, but are not drawn.
          const hidden = only !== undefined && widget.id !== only;
          return [
            {
              widget,
              presence,
              inner: hidden ? <div style={{ visibility: 'hidden' }}>{inner}</div> : inner,
            },
          ];
        });
        const root = row[0]!;
        const [vertical] = splitAnchor(root.anchor);
        /** Fading and sliding in and out, on top of the block's own transform. */
        const motion = (widget: Widget, presence: number, transform: string | undefined) => {
          const slide = widget.transition === 'slide' ? (1 - presence) * SLIDE_PX : 0;
          const offset = vertical === 'top' ? -slide : slide;
          const moved =
            slide === 0 ? transform : `${transform ?? ''} translateY(${offset}px)`.trim();
          return { opacity: presence, ...(moved && { transform: moved }) };
        };
        // A block on its own sits at its place; a row sits at its first block's place, and the
        // blocks follow one another with a fixed gap, however wide each is.
        if (row.length === 1) {
          if (shown.length === 0) return null;
          const { widget, presence, inner } = shown[0]!;
          const place = placementOf(widget);
          return (
            <div
              key={widget.id}
              data-widget-id={widget.id}
              style={{
                ...place,
                ...motion(widget, presence, place.transform),
              }}
            >
              {inner}
            </div>
          );
        }
        if (shown.length === 0) return null;
        return (
          <div
            key={root.id}
            style={{
              ...placementOf({ ...root, scale: 1 }),
              display: 'flex',
              gap: ROW_GAP,
              alignItems:
                vertical === 'top' ? 'flex-start' : vertical === 'bottom' ? 'flex-end' : 'center',
            }}
          >
            {shown.map(({ widget, presence, inner }) => (
              <div
                key={widget.id}
                data-widget-id={widget.id}
                style={{
                  ...motion(
                    widget,
                    presence,
                    widget.scale === 1 ? undefined : `scale(${widget.scale})`,
                  ),
                  transformOrigin: `${vertical === 'middle' ? 'center' : vertical} left`,
                }}
              >
                {inner}
              </div>
            ))}
          </div>
        );
      })}
      {overlays.attribution && only === undefined && (
        <div
          style={{
            position: 'absolute',
            ...cornerStyle(overlays.attributionCorner),
            padding: '3px 9px',
            borderRadius: 5,
            backgroundColor: 'rgba(255, 255, 255, 0.78)',
            color: '#333333',
            fontFamily: fontFamilyOf('system'),
            fontSize: 15,
          }}
        >
          {credits.join(' · ')}
        </div>
      )}
    </div>
  );
};
