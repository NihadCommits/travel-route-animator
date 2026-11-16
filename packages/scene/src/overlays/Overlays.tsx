import {
  computeFrameState,
  formatHeight,
  overlayTokensOf,
  routingCredits,
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
import { fontFamilyOf, useOverlayFonts } from './fonts';

// HTML on top of the map, in the same reference size (1080 pixels on the short side) and
// scaled with it. The blocks of the overlay kit (M17, ADR 0017) each sit at an anchor plus an
// offset and take their look from the stage's style. Everything comes from the frame state;
// appearing and going are worked out from the frame's time, never by CSS transitions
// (Determinismus).

/** How long a block takes to fade or slide in and out. */
const TRANSITION_SEC = 0.4;
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

/** 0 to 1: how far a block is in, from its time window and transition. */
export function presenceOf(widget: Widget, sec: number): number {
  const from = widget.fromSec ?? Number.NEGATIVE_INFINITY;
  const to = widget.toSec ?? Number.POSITIVE_INFINITY;
  if (sec < from || sec > to) return 0;
  if (widget.transition === 'none') return 1;
  return Math.min(1, (sec - from) / TRANSITION_SEC, (to - sec) / TRANSITION_SEC);
}

function rgba(hex: string, opacity: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

/** The box and text of a style, scaled to its text size (the classic look is size 44). */
export function boxStyleOf(tokens: OverlayStyleTokens): CSSProperties {
  const k = tokens.size / 44;
  const box: CSSProperties = {
    fontFamily: fontFamilyOf(tokens.font),
    fontWeight: tokens.weight,
    fontSize: tokens.size,
    color: tokens.textColor,
    textTransform: tokens.uppercase ? 'uppercase' : undefined,
    whiteSpace: 'pre',
    lineHeight: 1.25,
    boxSizing: 'border-box',
  };
  if (tokens.background !== 'none') {
    box.padding = `${10 * k}px ${22 * k}px`;
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

/**
 * The widest text a counting block shows over the stage, as characters: its width is kept from
 * the start, so it does not grow under the viewer's eyes and push into its neighbours.
 */
function useReservedChars(timeline: Timeline, context: Parameters<typeof widgetText>[2]) {
  return useMemo(() => {
    const last = computeFrameState(timeline, timeline.durationInFrames - 1);
    const reserved = new Map<string, number>();
    for (const widget of timeline.overlays.widgets) {
      const text = widgetText(widget, last, context);
      if (text !== undefined && widget.kind !== 'text' && widget.kind !== 'place') {
        reserved.set(widget.id, text.length);
      }
    }
    return reserved;
  }, [timeline, context]);
}

export const Overlays: FC<{
  timeline: Timeline;
  state: FrameState;
  /** The map's own credits, by source (styleCredits). */
  credits: readonly string[];
  /** The user's own overlay styles (data/overlay-styles), for a stage that uses one. */
  ownStyles?: readonly OverlayStyle[] | undefined;
}> = ({ timeline, state, credits: mapCredits, ownStyles }) => {
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
  const reserved = useReservedChars(timeline, context);
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
    const minChars = reserved.get(widget.id);
    return (
      <div
        style={{
          ...boxStyleOf(tokens),
          fontVariantNumeric: 'tabular-nums',
          ...(minChars !== undefined && {
            // Room for the widest text plus the box's own padding on both sides.
            minWidth: `calc(${minChars}ch + ${tokens.background === 'none' ? 0 : tokens.size}px)`,
          }),
        }}
      >
        {widget.label && (
          <div style={{ fontSize: tokens.size * 0.45, opacity: 0.8, letterSpacing: '0.04em' }}>
            {widget.label}
          </div>
        )}
        {text}
      </div>
    );
  };

  return (
    <div
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
      {overlays.widgets.map((widget) => {
        const presence = presenceOf(widget, state.sec);
        if (presence <= 0) return null;
        const tokens = tokensOf(widget);
        const inner = content(widget, tokens);
        if (inner === null) return null;
        const place = placementOf(widget);
        const slide = widget.transition === 'slide' ? (1 - presence) * SLIDE_PX : 0;
        const [vertical] = splitAnchor(widget.anchor);
        const offset = vertical === 'top' ? -slide : slide;
        return (
          <div
            key={widget.id}
            data-widget-id={widget.id}
            style={{
              ...place,
              opacity: presence,
              ...(slide !== 0 && {
                transform: `${place.transform ?? ''} translateY(${offset}px)`.trim(),
              }),
            }}
          >
            {inner}
          </div>
        );
      })}
      {overlays.attribution && (
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
