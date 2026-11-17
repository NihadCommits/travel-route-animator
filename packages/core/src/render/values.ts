import { slugify, uniqueSlug } from '../files/slug';
import type { FrameState } from '../frame/computeFrameState';
import type { Units, Widget, WidgetKind } from '../model/overlays';
import type { Project } from '../model/project';
import { presenceOf } from '../overlays/presence';
import {
  distanceIn,
  heightIn,
  speedIn,
  widgetText,
  type WidgetContext,
} from '../overlays/widgetText';
import { findEtappe } from '../resolve/resolve';
import { localDateTimeOf } from '../time/zone';
import { sequenceFrameAt, type Sequence } from '../timeline/sequence';

// The values of the overlay blocks for the edit (M18, ADR 0018): what each block says in every
// frame of the video, and the numbers behind it. Pure functions of the sequence, so they need
// no browser and match the video frame by frame. The writers below turn them into SRT
// (Premiere, Resolve), CSV and JSON (scripts) and MGJSON (After Effects).

/** A number a block shows, in the units it shows it in. */
export interface ValueChannel {
  /** Short name, e.g. "distance", "up", "down". */
  key: string;
  /** As shown: "km", "mi", "m", "ft", "km/h", "mph", "s", "bpm", "rpm", "%", "min". */
  unit: string;
  /** Digits after the point the block shows. */
  decimals: number;
  /** Per frame of the video; undefined where the frame has no value. */
  values: (number | undefined)[];
}

/** One block of the video with its text and numbers in every frame. */
export interface ValueTrack {
  widgetId: string;
  etappeId: string;
  kind: WidgetKind;
  /** Unique within the video and safe in a file name, e.g. "distance" or "tag-1-distance". */
  name: string;
  /** For people: the block's caption or kind, e.g. "Gefahren". */
  title: string;
  /** The text on screen per frame; undefined while the block is not there. */
  text: (string | undefined)[];
  channels: ValueChannel[];
}

export interface ValueTracks {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  tracks: ValueTrack[];
}

/** File names per kind, and what a block is called when it has no caption. */
const KIND_NAMES: Record<WidgetKind, { slug: string; title: string }> = {
  distance: { slug: 'distance', title: 'Distanz' },
  travelTime: { slug: 'travel-time', title: 'Reisezeit' },
  climb: { slug: 'climb', title: 'Höhenmeter' },
  altitude: { slug: 'altitude', title: 'Höhe' },
  elevationProfile: { slug: 'profile', title: 'Höhenprofil' },
  progress: { slug: 'progress', title: 'Fortschritt' },
  speed: { slug: 'speed', title: 'Geschwindigkeit' },
  heartRate: { slug: 'heart-rate', title: 'Puls' },
  cadence: { slug: 'cadence', title: 'Trittfrequenz' },
  clock: { slug: 'clock', title: 'Uhrzeit' },
  date: { slug: 'date', title: 'Datum' },
  place: { slug: 'place', title: 'Ort' },
  flag: { slug: 'flag', title: 'Flagge' },
  text: { slug: 'text', title: 'Text' },
};

/** Blocks that draw a picture have no text or numbers to hand over. */
const PICTURES = new Set<WidgetKind>(['elevationProfile', 'flag']);

/** Rounded enough for the files to stay small, far finer than any block shows. */
const round = (value: number) => Math.round(value * 10_000) / 10_000;

interface ChannelSpec {
  key: string;
  unit: string;
  decimals: number;
  read: (state: FrameState, context: WidgetContext) => number | undefined;
}

/** The numbers behind a block's text, in the block's units. */
function channelsOf(widget: Widget, units: Units): ChannelSpec[] {
  const imperial = units === 'imperial';
  const height = imperial ? 'ft' : 'm';
  const decimals = widget.decimals ?? 0;
  switch (widget.kind) {
    case 'distance':
      return [
        {
          key: 'distance',
          unit: imperial ? 'mi' : 'km',
          decimals,
          read: ({ counters }) =>
            counters.distanceKm === undefined ? undefined : distanceIn(counters.distanceKm, units),
        },
      ];
    case 'travelTime':
      return [
        { key: 'seconds', unit: 's', decimals: 0, read: ({ counters }) => counters.travelSec },
      ];
    case 'speed':
      return [
        {
          key: 'speed',
          unit: imperial ? 'mph' : 'km/h',
          decimals,
          read: ({ counters }) =>
            counters.speedKmh === undefined ? undefined : speedIn(counters.speedKmh, units),
        },
      ];
    case 'heartRate':
      return [
        {
          key: 'heart-rate',
          unit: 'bpm',
          decimals: 0,
          read: ({ counters }) => counters.heartRateBpm,
        },
      ];
    case 'cadence':
      return [
        { key: 'cadence', unit: 'rpm', decimals: 0, read: ({ counters }) => counters.cadenceRpm },
      ];
    case 'altitude':
      return [
        {
          key: 'altitude',
          unit: height,
          decimals: 0,
          read: ({ elevation }) => elevation && heightIn(elevation.elevationM, units),
        },
      ];
    case 'climb':
      return [
        {
          key: 'up',
          unit: height,
          decimals: 0,
          read: ({ elevation }) => elevation && heightIn(elevation.gainM, units),
        },
        {
          key: 'down',
          unit: height,
          decimals: 0,
          read: ({ elevation }) => elevation && heightIn(elevation.lossM, units),
        },
      ];
    case 'progress':
      return [
        {
          key: 'progress',
          unit: '%',
          decimals: 0,
          read: ({ counters }) =>
            counters.progress === undefined ? undefined : counters.progress * 100,
        },
      ];
    case 'clock':
      return [
        {
          key: 'minutes',
          unit: 'min',
          decimals: 0,
          // Minutes since midnight on the stage's clock: 08:30 is 510.
          read: ({ counters }, { timeZone }) => {
            if (counters.clockMs === undefined || timeZone === undefined) return undefined;
            const [hours, minutes] = localDateTimeOf(counters.clockMs, timeZone)
              .slice(11, 16)
              .split(':')
              .map(Number);
            return hours! * 60 + minutes!;
          },
        },
      ];
    default:
      return [];
  }
}

/**
 * The text and numbers of every block in every frame of a video. A block counts only while
 * its stage is on screen; its text only while it is shown (time window, fading).
 */
/** A block of a video with the name its files get. */
export interface NamedBlock {
  widget: Widget;
  /** Which part of the sequence it belongs to. */
  part: number;
  etappeId: string;
  /** Unique within the video and safe in a file name, e.g. "distance" or "tag-1-distance". */
  name: string;
  /** For people: the block's caption or kind, e.g. "Gefahren". */
  title: string;
}

/**
 * Every block of a video with a file name: its caption or kind, after its stage when the video
 * has several. The values and the block videos use the same names, so they sort together.
 */
export function blocksOf(project: Project, sequence: Sequence): NamedBlock[] {
  const several = sequence.parts.length > 1;
  const taken = new Set<string>();
  return sequence.parts.flatMap((part, index) =>
    part.timeline.overlays.widgets.map((widget) => {
      const kind = KIND_NAMES[widget.kind];
      const own = widget.label ?? (widget.kind === 'text' ? widget.text : undefined);
      const ownSlug = own && /[a-z0-9]/i.test(own) ? slugify(own) : kind.slug;
      const stage = findEtappe(project, part.etappeId)?.etappe.name;
      const name = uniqueSlug(several && stage ? `${slugify(stage)}-${ownSlug}` : ownSlug, taken);
      taken.add(name);
      return {
        widget,
        part: index,
        etappeId: part.etappeId,
        name,
        title: own?.trim() || kind.title,
      };
    }),
  );
}

export function valueTracksOf(project: Project, sequence: Sequence): ValueTracks {
  const named = blocksOf(project, sequence).filter(({ widget }) => !PICTURES.has(widget.kind));
  const parts = sequence.parts.map((part, index) =>
    named
      .filter((block) => block.part === index)
      .map(({ widget, etappeId, name, title }) => {
        const specs = channelsOf(widget, widget.unit ?? part.timeline.units);
        const track: ValueTrack = {
          widgetId: widget.id,
          etappeId,
          kind: widget.kind,
          name,
          title,
          text: [],
          channels: specs.map(({ key, unit, decimals }) => ({ key, unit, decimals, values: [] })),
        };
        return { widget, specs, track };
      }),
  );

  for (let frame = 0; frame < sequence.durationInFrames; frame++) {
    const { partIndex, timeline, state } = sequenceFrameAt(sequence, frame);
    const context: WidgetContext = { units: timeline.units, timeZone: timeline.clock?.timeZone };
    parts.forEach((blocks, index) => {
      for (const { widget, specs, track } of blocks) {
        const here = index === partIndex;
        const shown = here && presenceOf(widget, state.sec) > 0;
        track.text.push(shown ? widgetText(widget, state, context) : undefined);
        specs.forEach((spec, c) => {
          const value = here ? spec.read(state, context) : undefined;
          track.channels[c]!.values.push(value === undefined ? undefined : round(value));
        });
      }
    });
  }
  const { fps, width, height, durationInFrames } = sequence;
  return { fps, width, height, durationInFrames, tracks: parts.flat().map(({ track }) => track) };
}

// ---------- SRT ----------

/** "00:01:02,345": the time of a frame in SubRip's notation. */
function srtTime(frame: number, fps: number): string {
  const ms = Math.round((frame / fps) * 1000);
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(
    Math.floor(ms / 1000) % 60,
  )},${pad(ms % 1000, 3)}`;
}

/**
 * A block's text as SubRip subtitles: one entry each time the text changes, for a subtitle
 * track in Premiere Pro or DaVinci Resolve that is styled there. Undefined when the block never
 * says anything.
 */
export function srtOf(track: ValueTrack, fps: number): string | undefined {
  const entries: string[] = [];
  let start = 0;
  for (let frame = 1; frame <= track.text.length; frame++) {
    const text = track.text[start];
    if (frame < track.text.length && track.text[frame] === text) continue;
    if (text !== undefined && text !== '') {
      entries.push(
        `${entries.length + 1}\n${srtTime(start, fps)} --> ${srtTime(frame, fps)}\n${text}\n`,
      );
    }
    start = frame;
  }
  return entries.length === 0 ? undefined : entries.join('\n');
}

// ---------- CSV and JSON ----------

/** A column name without spaces or slashes: "speed_kmh", "progress_pct". */
function columnUnit(unit: string): string {
  return unit.replace('/', '').replace('%', 'pct');
}

const csvText = (text: string | undefined) =>
  text === undefined ? '' : `"${text.replace(/"/g, '""')}"`;

/**
 * Every block in every frame as a table: the text on screen and the numbers behind it. Comma
 * separated with a point as decimal mark, like the motion CSV (M13).
 */
export function valuesCsv(values: ValueTracks): string {
  const header = ['frame', 'time_s'];
  for (const track of values.tracks) {
    header.push(track.name);
    for (const channel of track.channels) {
      header.push(`${track.name}.${channel.key}_${columnUnit(channel.unit)}`);
    }
  }
  const lines = [header.join(',')];
  for (let frame = 0; frame < values.durationInFrames; frame++) {
    const row = [String(frame), String(round(frame / values.fps))];
    for (const track of values.tracks) {
      row.push(csvText(track.text[frame]));
      for (const channel of track.channels) row.push(String(channel.values[frame] ?? ''));
    }
    lines.push(row.join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** The same as JSON, for scripts: one entry per block with its arrays (null: no value). */
export function valuesJson(values: ValueTracks): string {
  return `${JSON.stringify(
    {
      fps: values.fps,
      width: values.width,
      height: values.height,
      durationInFrames: values.durationInFrames,
      blocks: values.tracks.map((track) => ({
        name: track.name,
        title: track.title,
        kind: track.kind,
        etappeId: track.etappeId,
        widgetId: track.widgetId,
        text: track.text.map((text) => text ?? null),
        channels: track.channels.map((channel) => ({
          key: channel.key,
          unit: channel.unit,
          decimals: channel.decimals,
          values: channel.values.map((value) => value ?? null),
        })),
      })),
    },
    null,
    2,
  )}\n`;
}

// ---------- MGJSON ----------

/** Samples are timed from this moment on; After Effects starts the data at the first one. */
const MGJSON_EPOCH = Date.UTC(2000, 0, 1);

/** "+0012.50": how MGJSON wants a number, padded to the stream's digits. */
function mgjsonNumber(value: number, integerDigits: number, decimals: number): string {
  const [whole, fraction] = Math.abs(value).toFixed(decimals).split('.');
  const sign = value < 0 ? '-' : '+';
  return `${sign}${whole!.padStart(integerDigits, '0')}${fraction === undefined ? '' : `.${fraction}`}`;
}

/**
 * The numbers and texts of all blocks as MGJSON, After Effects' format for data-driven
 * animation: imported as footage, every stream can drive a property, e.g. the source text of
 * a text layer. The structure follows Adobe's MGJSON 2.0 as written by gopro-telemetry
 * (including its spelling of hasExpectedFrequecyB), since Adobe documents it only sparsely.
 */
export function mgjsonOf(values: ValueTracks): string {
  const time = (frame: number) =>
    new Date(MGJSON_EPOCH + (frame / values.fps) * 1000).toISOString();
  const outline: object[] = [];
  const samples: object[] = [];
  const add = (stream: Record<string, unknown>, list: { time: string; value: unknown }[]) => {
    const id = `stream${outline.length}`;
    outline.push({
      objectType: 'dataDynamic',
      ...stream,
      sampleSetID: id,
      hasExpectedFrequecyB: false,
      sampleCount: list.length,
      matchName: id,
    });
    samples.push({ sampleSetID: id, samples: list });
  };

  for (const track of values.tracks) {
    for (const channel of track.channels) {
      const known = channel.values.filter((value): value is number => value !== undefined);
      if (known.length === 0) continue;
      const min = Math.min(...known);
      const max = Math.max(...known);
      const integerDigits = Math.max(
        1,
        ...known.map((v) => String(Math.floor(Math.abs(v))).length),
      );
      // Every stream starts at frame 0, so all of them line up in After Effects.
      let last = known[0]!;
      const list = channel.values.flatMap((value, frame) => {
        if (value === undefined && frame > 0) return [];
        last = value ?? last;
        return [{ time: time(frame), value: mgjsonNumber(last, integerDigits, channel.decimals) }];
      });
      add(
        {
          displayName: `${track.title} (${channel.unit})${track.channels.length > 1 ? ` ${channel.key}` : ''}`,
          dataType: {
            type: 'numberString',
            numberStringProperties: {
              pattern: {
                isSigned: true,
                digitsInteger: integerDigits,
                digitsDecimal: channel.decimals,
              },
              // The legal range repeats the occurring one: After Effects misreads it otherwise.
              range: { occuring: { min, max }, legal: { min, max } },
            },
          },
          interpolation: 'linear',
        },
        list,
      );
    }
    const texts = track.text.map((text) => text ?? '');
    if (texts.every((text) => text === '')) continue;
    const maxLen = Math.max(...texts.map((text) => text.length));
    const digits = String(maxLen).length;
    add(
      {
        displayName: `${track.title}: Text`,
        dataType: {
          type: 'paddedString',
          paddedStringProperties: { maxLen, maxDigitsInStrLength: digits, eventMarkerB: false },
        },
        interpolation: 'hold',
      },
      texts.flatMap((text, frame) =>
        frame > 0 && text === texts[frame - 1]
          ? []
          : [
              {
                time: time(frame),
                value: {
                  length: String(text.length).padStart(digits, '0'),
                  str: text.padEnd(maxLen, ' '),
                },
              },
            ],
      ),
    );
  }

  return `${JSON.stringify(
    {
      version: 'MGJSON2.0.0',
      creator: 'Travel Route Animator',
      dynamicSamplesPresentB: outline.length > 0,
      dynamicDataInfo: { useTimecodeB: false, utcInfo: { precisionLength: 3, isGMT: true } },
      dataOutline: outline,
      dataDynamicSamples: samples,
    },
    null,
    2,
  )}\n`;
}
