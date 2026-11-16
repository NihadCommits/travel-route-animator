import { formatClock, isTimeZone, type Clock, type Recording } from '@travel-route-animator/core';
import { useMemo } from 'react';
import { SelectField } from '@/features/inspector/fields/SelectField';
import { TextField } from '@/features/inspector/fields/TextField';
import { de } from '@/i18n/de';

// Where a stage's time of day comes from (M16): a typed departure or the start of a recording,
// in a time zone of its own. Shown with a clock or date block (M17).

const texts = de.inspector.etappe.measured;

/** The computer's own time zone, the default for a new clock. */
export function ownTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isTimeZone(zone) ? zone : 'UTC';
}

/** A first clock: from the recording when there is one, else waiting for a departure. */
export function defaultClock(recording: Recording | undefined): Clock {
  return { source: recording?.startedAt ? 'recorded' : 'manual', timeZone: ownTimeZone() };
}

/** Every time zone the browser knows, the current one first if it is unusual. */
function timeZones(current: string): string[] {
  const all = Intl.supportedValuesOf('timeZone');
  return all.includes(current) ? all : [current, ...all];
}

interface ClockFieldsProps {
  clock: Clock;
  recording: Recording | undefined;
  /** Whether the stage has a travel time to run a typed clock with. */
  hasTravelTime: boolean;
  setClock: (clock: Clock) => string | null;
}

export function ClockFields({ clock, recording, hasTravelTime, setClock }: ClockFieldsProps) {
  const zones = useMemo(() => timeZones(clock.timeZone), [clock.timeZone]);
  const hint = (() => {
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
      <SelectField
        label={texts.source}
        value={clock.source}
        options={[
          { value: 'manual', label: texts.sources.manual },
          { value: 'recorded', label: texts.sources.recorded, disabled: !recording?.startedAt },
        ]}
        hint={hint}
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
  );
}
