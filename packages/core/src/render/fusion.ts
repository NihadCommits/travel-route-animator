import type { ValueChannel, ValueTrack, ValueTracks } from './values';

// The numbers of the overlay blocks for DaVinci Resolve's Fusion page (M18, ADR 0018): a
// .setting file, pasted into the node editor, adds one Text+ node per block. Its number is a
// slider of its own, animated by a BezierSpline, and an expression turns it into the text, so
// the look stays editable in Fusion. Blackmagic does not document the format; this follows
// what Fusion writes itself (Lua tables, keyframes by frame, expressions on inputs).

/** A keyframe at a frame with a value; Fusion draws straight lines between them. */
export interface Key {
  frame: number;
  value: number;
}

/**
 * Only the keyframes that matter: between two kept keys a straight line never strays further
 * than `tolerance` from the value of any frame (Douglas-Peucker, in one dimension).
 */
export function simplifyKeys(keys: readonly Key[], tolerance: number): Key[] {
  if (keys.length <= 2) return [...keys];
  const keep = new Array<boolean>(keys.length).fill(false);
  keep[0] = true;
  keep[keys.length - 1] = true;
  const stack: [number, number][] = [[0, keys.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const a = keys[first]!;
    const b = keys[last]!;
    let worst = -1;
    let worstAt = -1;
    for (let i = first + 1; i < last; i++) {
      const k = keys[i]!;
      const line = a.value + ((b.value - a.value) * (k.frame - a.frame)) / (b.frame - a.frame);
      const off = Math.abs(k.value - line);
      if (off > worst) {
        worst = off;
        worstAt = i;
      }
    }
    if (worst > tolerance) {
      keep[worstAt] = true;
      stack.push([first, worstAt], [worstAt, last]);
    }
  }
  return keys.filter((_, i) => keep[i]);
}

/** A Lua string literal. */
const lua = (text: string) =>
  `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

/** A tool name Fusion accepts: letters and digits, starting with a letter. */
function toolName(name: string, taken: Set<string>): string {
  const camel = name
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('');
  const base = /^[A-Za-z]/.test(camel) ? camel : `Block${camel}`;
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}${n}`;
  taken.add(candidate);
  return candidate;
}

/** "%.1f km" with a decimal comma, as the video writes it. */
function numberText(channel: ValueChannel, input: string): string {
  const format = `%.${channel.decimals}f ${channel.unit.replace('%', '%%')}`;
  return channel.decimals === 0
    ? `string.format(${lua(format)}, ${input})`
    : `(string.format(${lua(format)}, ${input}):gsub("%.", ","))`;
}

/** The Lua expression that writes a block's text from its number inputs. */
function textExpression(track: ValueTrack, inputs: readonly string[]): string {
  const [first, second] = inputs;
  switch (track.kind) {
    case 'travelTime':
      return `${first} < 3600 and string.format("%d min", math.floor(${first} / 60)) or string.format("%d:%02d h", math.floor(${first} / 3600), math.floor(${first} / 60) % 60)`;
    case 'clock':
      return `string.format("%02d:%02d", math.floor(${first} / 60), math.floor(${first}) % 60)`;
    case 'heartRate':
      return `string.format("♥ %.0f", ${first})`;
    case 'cadence':
      return `string.format("%.0f /min", ${first})`;
    case 'climb':
      return `string.format("↑ %.0f ${track.channels[0]!.unit}   ↓ %.0f ${track.channels[1]!.unit}", ${first}, ${second})`;
    default:
      return numberText(track.channels[0]!, first!);
  }
}

/** Blocks whose numbers carry their text; text and place blocks are typed in Fusion itself. */
const hasNumbers = (track: ValueTrack) =>
  track.channels.length > 0 && track.channels.some((c) => c.values.some((v) => v !== undefined));

/**
 * A Fusion .setting with a Text+ node per block that shows a number. Pasted into Fusion's node
 * editor (or saved as a macro), each node counts like the video; its text, font and position
 * are then Fusion's.
 */
export function fusionSettingOf(values: ValueTracks): string | undefined {
  const tracks = values.tracks.filter(hasNumbers);
  if (tracks.length === 0) return undefined;
  const taken = new Set<string>();
  const tools: string[] = [];
  tracks.forEach((track, index) => {
    const tool = toolName(track.name, taken);
    const inputs = track.channels.map((_, c) => (c === 0 ? 'RouteValue' : `RouteValue${c + 1}`));
    const lines: string[] = [];
    const splines: string[] = [];
    track.channels.forEach((channel, c) => {
      const spline = `${tool}${inputs[c]}`;
      // Frames without a value keep the last one; the line holds until the next change.
      let last = channel.values.find((v) => v !== undefined) ?? 0;
      const all = channel.values.map((value, frame) => {
        last = value ?? last;
        return { frame, value: last };
      });
      // Close enough that the shown digits come out as in the video.
      const keys = simplifyKeys(all, 0.4 * 10 ** -channel.decimals);
      const keyLines = keys
        .map((key) => `\t\t\t\t[${key.frame}] = { ${key.value}, Flags = { Linear = true } },`)
        .join('\n');
      splines.push(
        `\t\t${spline} = BezierSpline {\n\t\t\tSplineColor = { Red = 228, Green = 87, Blue = 46 },\n\t\t\tNameSet = true,\n\t\t\tKeyFrames = {\n${keyLines}\n\t\t\t}\n\t\t},`,
      );
      lines.push(`\t\t\t\t${inputs[c]} = Input { SourceOp = ${lua(spline)}, Source = "Value", },`);
    });
    const firstText = track.text.find((text) => text !== undefined) ?? '';
    const controls = track.channels
      .map((channel, c) => {
        const known = channel.values.filter((v): v is number => v !== undefined);
        return `\t\t\t\t${inputs[c]} = {\n\t\t\t\t\tLINKS_Name = ${lua(`${track.title} (${channel.unit})`)},\n\t\t\t\t\tLINKID_DataType = "Number",\n\t\t\t\t\tINPID_InputControl = "SliderControl",\n\t\t\t\t\tINP_Default = 0,\n\t\t\t\t\tINP_MinScale = ${Math.min(0, ...known)},\n\t\t\t\t\tINP_MaxScale = ${Math.max(1, ...known)},\n\t\t\t\t\tICS_ControlPage = "Controls",\n\t\t\t\t},`;
      })
      .join('\n');
    tools.push(
      [
        `\t\t${tool} = TextPlus {`,
        '\t\t\tInputs = {',
        `\t\t\t\tWidth = Input { Value = ${values.width}, },`,
        `\t\t\t\tHeight = Input { Value = ${values.height}, },`,
        `\t\t\t\tStyledText = Input {\n\t\t\t\t\tValue = ${lua(firstText)},\n\t\t\t\t\tExpression = ${lua(`Text(${textExpression(track, inputs)})`)},\n\t\t\t\t},`,
        ...lines,
        '\t\t\t},',
        `\t\t\tViewInfo = OperatorInfo { Pos = { 0, ${index * 66} } },`,
        `\t\t\tUserControls = ordered() {\n${controls}\n\t\t\t},`,
        '\t\t},',
        ...splines,
      ].join('\n'),
    );
  });
  return `{\n\tTools = ordered() {\n${tools.join('\n')}\n\t},\n\tActiveTool = ${lua(toolName(tracks[0]!.name, new Set()))}\n}\n`;
}
