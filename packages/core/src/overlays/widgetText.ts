import type { FrameState } from '../frame/computeFrameState';
import { formatTravelTime } from '../frame/duration';
import type { Units, Widget } from '../model/overlays';
import { formatClock } from '../time/zone';

// What an overlay block says (M17): the frame's value in the block's units and digits. Pure
// text, so it is the same in the preview, the export and the tests; the scene only draws it.

const MILE_M = 1609.344;
const FOOT_M = 0.3048;

const numberFormats = new Map<number, Intl.NumberFormat>();
function number(value: number, decimals = 0): string {
  let format = numberFormats.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat('de-AT', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    numberFormats.set(decimals, format);
  }
  return format.format(value);
}

export function formatDistance(km: number, units: Units, decimals = 0): string {
  return units === 'imperial'
    ? `${number((km * 1000) / MILE_M, decimals)} mi`
    : `${number(km, decimals)} km`;
}

export function formatSpeed(kmh: number, units: Units, decimals = 0): string {
  return units === 'imperial'
    ? `${number((kmh * 1000) / MILE_M, decimals)} mph`
    : `${number(kmh, decimals)} km/h`;
}

export function formatHeight(metres: number, units: Units): string {
  return units === 'imperial' ? `${number(metres / FOOT_M)} ft` : `${number(metres)} m`;
}

export function formatClimb(gainM: number, lossM: number, units: Units): string {
  return `↑ ${formatHeight(gainM, units)}   ↓ ${formatHeight(lossM, units)}`;
}

/** The information a block's text needs besides the frame. */
export interface WidgetContext {
  /** The project's units, for blocks that set none. */
  units: Units;
  /** The stage's clock zone (Timeline.clock); without it there is no time of day. */
  timeZone: string | undefined;
}

/**
 * The text a block shows in this frame; undefined when the frame has no value for it (no
 * recording for the heart rate, no heights for the climb) or the block draws a picture instead
 * (height profile, progress bar, flag).
 */
export function widgetText(
  widget: Widget,
  state: Pick<FrameState, 'counters' | 'elevation'>,
  context: WidgetContext,
): string | undefined {
  const { counters, elevation } = state;
  const units = widget.unit ?? context.units;
  switch (widget.kind) {
    case 'distance':
      return counters.distanceKm === undefined
        ? undefined
        : formatDistance(counters.distanceKm, units, widget.decimals);
    case 'travelTime':
      return counters.travelSec === undefined ? undefined : formatTravelTime(counters.travelSec);
    case 'speed':
      return counters.speedKmh === undefined
        ? undefined
        : formatSpeed(counters.speedKmh, units, widget.decimals);
    case 'heartRate':
      return counters.heartRateBpm === undefined ? undefined : `♥ ${counters.heartRateBpm}`;
    case 'cadence':
      return counters.cadenceRpm === undefined ? undefined : `${counters.cadenceRpm} /min`;
    case 'climb':
      return elevation && formatClimb(elevation.gainM, elevation.lossM, units);
    case 'altitude':
      return elevation && formatHeight(elevation.elevationM, units);
    case 'clock':
      return counters.clockMs === undefined || context.timeZone === undefined
        ? undefined
        : formatClock(counters.clockMs, context.timeZone);
    case 'date':
      return counters.clockMs === undefined || context.timeZone === undefined
        ? undefined
        : formatClock(counters.clockMs, context.timeZone, true).split(',')[0];
    case 'place':
      return counters.place;
    case 'progress':
      return counters.progress === undefined ? undefined : `${number(counters.progress * 100)} %`;
    case 'text':
      return widget.text;
    case 'elevationProfile':
    case 'flag':
      return undefined;
  }
}
