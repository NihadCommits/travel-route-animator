import {
  formatClock,
  isTimeZone,
  type Clock,
  type Etappe,
  type OverlaySettings,
  type Track,
} from '@travel-route-animator/core';
import { useMemo } from 'react';
import { de } from '@/i18n/de';
import { SelectField } from './fields/SelectField';
import { SwitchField } from './fields/SwitchField';
import { TextField } from './fields/TextField';

// Speed, heart rate and the time of day (M16): what a recording adds to a stage's overlays.
// Speed and heart rate need a recording; the clock also runs from a typed departure.

const texts = de.inspector.etappe.measured;

/** The computer's own time zone, the default for a new clock. */
function ownTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isTimeZone(zone) ? zone : 'UTC';
}

/** Every time zone the browser knows, the current one first if it is unusual. */
function timeZones(current: string): string[] {
  const all = Intl.supportedValuesOf('timeZone');
  return all.includes(current) ? all : [current, ...all];
}

interface MeasuredCountersProps {
  etappe: Etappe;
  /** The track whose numbers the counters show (the followed one, else the first). */
  counted: Track | undefined;
  setOverlay: <K extends keyof OverlaySettings>(key: K, value: OverlaySettings[K]) => string | null;
  setClock: (clock: Clock) => string | null;
  /** Switches the clock on or off; a first clock comes along in the same undo step. */
  setClockCounter: (on: boolean, clock: Clock | undefined) => string | null;
  /** Whether the stage has any travel time to run a typed clock with. */
  hasTravelTime: boolean;
}

export function MeasuredCounters({
  etappe,
  counted,
  setOverlay,
  setClock,
  setClockCounter,
  hasTravelTime,
}: MeasuredCountersProps) {
  const { overlays, clock } = etappe;
  const recording = counted?.computed?.recording ?? counted?.imported?.recording;
  const zones = useMemo(() => timeZones(clock?.timeZone ?? ownTimeZone()), [clock?.timeZone]);

  // Only said when a switched-on counter would show nothing.
  const measuredNote =
    (overlays.speedCounter || overlays.heartRateCounter) && !recording
      ? texts.noRecording
      : overlays.heartRateCounter && recording && !recording.heartRateBpm
        ? texts.noHeartRate
        : undefined;

  const clockHint = (() => {
    if (!clock) return undefined;
    if (clock.source === 'recorded') {
      return recording?.startedAt
        ? texts.recordedFrom(formatClock(Date.parse(recording.startedAt), clock.timeZone, true))
        : texts.noRecording;
    }
    if (clock.departure === undefined) return texts.needsDeparture;
    return hasTravelTime ? undefined : texts.standsStill;
  })();

  return (
    <>
      <SwitchField
        label={de.inspector.etappe.speedCounter}
        checked={overlays.speedCounter}
        onCommit={(on) => setOverlay('speedCounter', on)}
      />
      <SwitchField
        label={de.inspector.etappe.heartRateCounter}
        checked={overlays.heartRateCounter}
        onCommit={(on) => setOverlay('heartRateCounter', on)}
      />
      {measuredNote && <p className="text-muted-foreground text-xs">{measuredNote}</p>}
      <SwitchField
        label={de.inspector.etappe.clockCounter}
        checked={overlays.clockCounter}
        onCommit={(on) =>
          // A first clock: from the recording when there is one, else waiting for a departure.
          setClockCounter(
            on,
            on && !clock
              ? { source: recording?.startedAt ? 'recorded' : 'manual', timeZone: ownTimeZone() }
              : clock,
          )
        }
      />
      {overlays.clockCounter && clock && (
        <>
          <SelectField
            label={texts.source}
            value={clock.source}
            options={[
              { value: 'manual', label: texts.sources.manual },
              {
                value: 'recorded',
                label: texts.sources.recorded,
                disabled: !recording?.startedAt,
              },
            ]}
            hint={clockHint}
            onCommit={(source) => setClock({ ...clock, source })}
          />
          {clock.source === 'manual' && (
            <TextField
              label={texts.departure}
              inputType="datetime-local"
              value={clock.departure ?? ''}
              onCommit={(departure) => {
                const { departure: _old, ...rest } = clock;
                return setClock(departure === '' ? rest : { ...rest, departure });
              }}
            />
          )}
          <SelectField
            label={texts.timeZone}
            value={clock.timeZone}
            options={zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }))}
            onCommit={(timeZone) => setClock({ ...clock, timeZone })}
          />
        </>
      )}
    </>
  );
}
