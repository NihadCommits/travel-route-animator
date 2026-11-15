import type {
  BuiltInCheck,
  ImageProblem,
  IssueCode,
  IssueValues,
  ValidationIssue,
} from '@travel-route-animator/core';
import { de } from './de';

// German texts for the rules in packages/core. Core keeps English messages (logs, API); the
// editor looks them up here by their stable code.

type Translate = (values: IssueValues) => string;

const num = (value: string | number | undefined) =>
  typeof value === 'number' ? value.toLocaleString('de-AT') : String(value ?? '');

const vehicle = (value: string | number | undefined) =>
  de.vehicles[String(value) as keyof typeof de.vehicles] ?? String(value);

const ISSUE_TEXTS: Record<IssueCode, Translate> = {
  'lngLat.longitudeRange': (v) => `Längengrad ${num(v.lng)} liegt außerhalb von −180 bis 180.`,
  'lngLat.latitudeRange': (v) => `Breitengrad ${num(v.lat)} liegt außerhalb von −90 bis 90.`,
  'lngLat.swapped': (v) =>
    `Breitengrad ${num(v.lat)} liegt außerhalb von −90 bis 90. Vermutlich sind Breiten- und Längengrad vertauscht.`,
  'waypoint.shapeHold': () =>
    'Formpunkte sind unsichtbar und können keinen Halt haben. Mach daraus einen Stopp.',
  'routing.avoidOnlyRoad': () => '„Vermeiden“ gibt es nur beim Straßen-Routing.',
  'track.routingNotAllowed': (v) =>
    `Dieses Routing passt nicht zum Fahrzeug ${vehicle(v.vehicle)}.`,
  'track.flightOnlyPlane': () => 'Flug-Optionen gibt es nur beim Flugzeug.',
  'track.iconAssetMissing': () =>
    'Das Bild für das Fahrzeug fehlt im Projekt. Wähle ein anderes Bild oder das Standard-Icon.',
  'style.onlyThemedBases': () => 'Themes gibt es nur bei Vektor- und Geländekarten.',
  'output.transparentNeedsProres': () =>
    'Ein transparentes Overlay braucht einen Codec mit Alphakanal: ProRes 4444 oder PNG-Sequenz.',
  'track.importOnlyGpx': () => 'Eine importierte Linie gehört zum Routing „Aus Datei (GPX)“.',
  'track.importElevations': () => 'Die importierte Linie braucht eine Höhe pro Punkt.',
  'pin.photoNeedsAsset': () => 'Ein Foto-Pin braucht sein Bild.',
  'pin.assetMissing': (v) => `Das Foto „${v.assetId}“ fehlt in den Dateien des Projekts.`,
  'view.flat2d': () => 'Die 2D-Ansicht schaut gerade von oben, die Neigung muss 0° sein.',
  'project.duplicateId': (v) => `Die ID „${v.id}“ kommt doppelt vor.`,
  'etappe.noTracks': () => 'Noch kein Fahrzeug. Füge mit „+ Fahrzeug“ eines hinzu.',
  'track.tooFewWaypoints': (v) =>
    v.count === 0
      ? 'Noch keine Wegpunkte, mindestens 2 sind nötig.'
      : 'Erst 1 Wegpunkt, mindestens 2 sind nötig.',
  'track.endpointNotStop': (v) =>
    `Der ${v.end === 'first' ? 'erste' : 'letzte'} Wegpunkt muss ein Stopp sein, kein Formpunkt.`,
  'track.timingOutsideEtappe': (v) =>
    Number(v.startSec) >= Number(v.etappeSec)
      ? `Die Fahrt beginnt erst bei ${num(v.startSec)} s, die Etappe dauert nur ${num(v.etappeSec)} s.`
      : `Die Fahrt dauert bis ${num(v.endSec)} s, die Etappe nur ${num(v.etappeSec)} s.`,
  'track.holdsTooLong': (v) =>
    `Die Halte dauern zusammen ${num(v.holdSec)} s, bei ${num(v.trackSec)} s Fahrt bleibt kaum Zeit zum Fahren.`,
  'camera.followTrackMissing': () =>
    'Die Kamera soll einem Fahrzeug folgen, es ist aber noch keines gewählt.',
  'camera.followTrackForeign': () =>
    'Die Kamera folgt einem Fahrzeug, das nicht (mehr) zu dieser Etappe gehört.',
  'camera.staticMissing': () => 'Für die feste Kamera fehlt noch die Position.',
};

/** Zod's built-in checks, explained from their limit (ADR 0004). */
function translateCheck(check: BuiltInCheck): string {
  switch (check.kind) {
    case 'too_small':
      if (check.origin === 'string') {
        return check.limit <= 1
          ? 'Darf nicht leer sein.'
          : `Mindestens ${num(check.limit)} Zeichen.`;
      }
      return check.inclusive
        ? `Mindestens ${num(check.limit)}.`
        : `Muss größer als ${num(check.limit)} sein.`;
    case 'too_big':
      if (check.origin === 'string') return `Höchstens ${num(check.limit)} Zeichen.`;
      return check.inclusive
        ? `Höchstens ${num(check.limit)}.`
        : `Muss kleiner als ${num(check.limit)} sein.`;
    case 'invalid_type':
      return check.expected === 'number' ? 'Bitte eine Zahl eingeben.' : 'Ungültiger Wert.';
    case 'invalid_format':
      return 'Das Format stimmt nicht.';
    case 'invalid_value':
      return 'Dieser Wert ist hier nicht erlaubt.';
    case 'other':
      return 'Ungültiger Wert.';
  }
}

/** The German text for an issue; falls back to core's English message for unknown cases. */
export function translateIssue(issue: ValidationIssue): string {
  if (issue.code) return ISSUE_TEXTS[issue.code](issue.values ?? {});
  return issue.check ? translateCheck(issue.check) : issue.message;
}

const megabytes = (bytes: string | number | undefined) => num(Math.round(Number(bytes) / 1048576));

const IMAGE_TEXTS: Record<ImageProblem, Translate> = {
  'image.unsupported': () => 'Nur PNG- und GIF-Bilder gehen.',
  'image.broken': () => 'Die Datei ist beschädigt oder kein vollständiges Bild.',
  'image.tooLarge': (v) => `Das Bild ist größer als ${megabytes(v.limit)} MB.`,
  'image.tooWide': (v) =>
    `Das Bild ist ${num(v.widthPx)} × ${num(v.heightPx)} px groß, erlaubt sind höchstens ${num(v.limit)} px pro Seite.`,
  'image.tooManyFrames': (v) =>
    `Das GIF hat ${num(v.frames)} Bilder, erlaubt sind höchstens ${num(v.limit)}.`,
};

/** Why the server refused an image, in German (ADR 0009). */
export function translateImageProblem(problem: ImageProblem, values: IssueValues = {}): string {
  return IMAGE_TEXTS[problem](values);
}
