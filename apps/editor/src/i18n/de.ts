import type { VehicleType } from '@travel-route-animator/core';

// All UI strings live here so that an English translation can be added later without touching components.
export const de = {
  app: {
    title: 'Routen-Animator',
  },
  common: {
    cancel: 'Abbrechen',
    create: 'Anlegen',
    save: 'Speichern',
    rename: 'Umbenennen',
    delete: 'Löschen',
    duplicate: 'Duplizieren',
    open: 'Öffnen',
    retry: 'Erneut versuchen',
    actions: 'Aktionen',
    copySuffix: ' (Kopie)',
  },
  overview: {
    title: 'Projekte',
    newProject: 'Neues Projekt',
    newTitle: 'Neues Projekt anlegen',
    renameTitle: 'Projekt umbenennen',
    nameLabel: 'Name',
    namePlaceholder: 'z. B. Portugal 2026',
    nameRequired: 'Bitte einen Namen eingeben.',
    loading: 'Projekte werden geladen …',
    empty: 'Noch keine Projekte. Lege mit „Neues Projekt“ das erste an.',
    serverDown: 'Der Server antwortet nicht. Läuft „pnpm dev“?',
    lastChanged: (date: string) => `Zuletzt geändert ${date}`,
    deleteTitle: (name: string) => `„${name}“ löschen?`,
    deleteDescription:
      'Das Projekt wird in den Papierkorb (data/.trash) verschoben und kann von dort wiederhergestellt werden.',
    failed: (reason: string) => `Das hat nicht geklappt: ${reason}`,
  },
  editor: {
    backToProjects: 'Projekte',
    loading: 'Projekt wird geladen …',
    notFound: 'Dieses Projekt gibt es nicht (mehr).',
    invalidFile: 'Die Projektdatei ist beschädigt und kann nicht geöffnet werden:',
    undo: 'Rückgängig (Strg+Z)',
    redo: 'Wiederholen (Strg+Umschalt+Z)',
    save: {
      saved: 'Gespeichert',
      pending: 'Ungespeicherte Änderungen',
      saving: 'Speichert …',
      error: 'Nicht gespeichert',
    },
    unsavedOnLeave: 'Es gibt noch ungespeicherte Änderungen.',
    workspacePlaceholder: 'Hier erscheint ab Modul M3 die Karte.',
    timelinePlaceholder: 'Die Timeline folgt in Modul M6.',
  },
  tree: {
    label: 'Projektbaum',
    addGroup: 'Gruppe',
    addEtappe: 'Etappe',
    addTrack: 'Fahrzeug',
    newGroupName: 'Neue Gruppe',
    newEtappeName: 'Neue Etappe',
    emptyProject: 'Noch keine Gruppe. Lege mit „+ Gruppe“ die erste an, z. B. „Hinreise“.',
    emptyGroup: 'Noch keine Etappe',
    emptyEtappe: 'Noch kein Fahrzeug',
    unnamed: 'Ohne Namen',
    expand: 'Aufklappen',
    collapse: 'Zuklappen',
    notReady: 'Noch nicht renderbar:',
    vehiclePickerTitle: 'Fahrzeug wählen',
    deleteTitle: (name: string) => `„${name}“ löschen?`,
    deleteGroupDescription: (count: number) =>
      count === 0
        ? 'Die Gruppe ist leer.'
        : `Die Gruppe enthält ${count} ${count === 1 ? 'Etappe' : 'Etappen'}, die mitgelöscht ${count === 1 ? 'wird' : 'werden'}.`,
    deleteEtappeDescription: (count: number) =>
      count === 0
        ? 'Die Etappe hat noch kein Fahrzeug.'
        : `Die Etappe enthält ${count} ${count === 1 ? 'Fahrzeug' : 'Fahrzeuge'}, die mitgelöscht ${count === 1 ? 'wird' : 'werden'}.`,
    undoHint: 'Mit Strg+Z lässt sich das rückgängig machen.',
  },
  inspector: {
    title: 'Eigenschaften',
    nothingSelected: 'Wähle links ein Element aus, um seine Eigenschaften zu sehen.',
    kinds: { project: 'Projekt', group: 'Gruppe', etappe: 'Etappe', track: 'Fahrzeug' },
    ready: 'Bereit zum Rendern.',
    formsFollow: 'Die Formulare zum Bearbeiten folgen im nächsten Schritt (M2b).',
    waypoints: 'Wegpunkte',
    noWaypoints: 'Noch keine Wegpunkte. Sie werden ab Modul M3 per Suche oder Karte gesetzt.',
    waypointKinds: { stop: 'Stopp', shape: 'Formpunkt' },
  },
  vehicles: {
    plane: 'Flugzeug',
    car: 'Auto',
    motorbike: 'Motorrad',
    bus: 'Bus',
    train: 'Zug',
    bike: 'Fahrrad',
    walk: 'Zu Fuß',
    hike: 'Wandern',
    ferry: 'Fähre',
  } satisfies Record<VehicleType, string>,
} as const;

const dateFormat = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  return dateFormat.format(new Date(iso));
}
