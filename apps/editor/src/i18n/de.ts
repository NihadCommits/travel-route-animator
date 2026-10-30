import type { RoadAvoid, VehicleType } from '@travel-route-animator/core';

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
    showProjectSettings: 'Projekteinstellungen anzeigen',
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
    workspace: {
      label: 'Arbeitsfläche',
      edit: 'Bearbeiten',
      preview: 'Vorschau',
      editHint: 'Auf der Karte bearbeiten (B)',
      previewHint: 'Die Etappe abspielen (V)',
    },
  },
  preview: {
    pickEtappe: 'Wähle im Baum eine Etappe oder ein Fahrzeug, um die Vorschau zu sehen.',
    loading: 'Vorschau wird geladen …',
    failed: 'Die Vorschau konnte nicht gezeichnet werden:',
    controls: 'Wiedergabe',
    play: 'Abspielen (Leertaste)',
    pause: 'Anhalten (Leertaste)',
    frameBack: 'Ein Frame zurück (←, mit Umschalt 1 s)',
    frameForward: 'Ein Frame vor (→, mit Umschalt 1 s)',
    loop: 'In Schleife abspielen',
    guides: 'Hilfslinien für sichere Bereiche (nur in der Vorschau)',
    quality: 'Vorschau-Qualität',
    half: 'Halb',
    full: 'Voll',
    halfHint: 'Halbe Auflösung: gleicher Ausschnitt, läuft flüssiger',
    fullHint: 'Volle Auflösung wie im Export',
    frame: (frame: number, last: number) => `Frame ${frame} / ${last}`,
  },
  timeline: {
    label: 'Timeline',
    pickEtappe: 'Wähle im Baum eine Etappe oder ein Fahrzeug, um seine Timeline zu sehen.',
    noTracks: 'Noch kein Fahrzeug in dieser Etappe.',
    ruler: 'Zeitlineal: klicken oder ziehen, um dorthin zu springen',
    intro: 'Intro',
    outro: 'Outro',
    bar: (name: string) => `Zeitraum von ${name}`,
    /** Without an end the track drives until the stage ends. */
    barValue: (start: string, end?: string) =>
      end === undefined ? `von ${start} bis zum Etappenende` : `von ${start} bis ${end}`,
    barHint:
      'Ziehen verschiebt den Start, die Enden ändern Start und Dauer; mit Umschalt rastet es auf Frames ein. Pfeiltasten: 0,1 s, mit Umschalt 1 s.',
  },
  render: {
    open: 'Rendern',
    openHint: 'Diese Etappe als Video rendern',
    pickEtappe: 'Wähle im Baum eine Etappe oder ein Fahrzeug, um sie zu rendern.',
    title: 'Rendern',
    what: 'Was',
    etappe: (name: string) => `Etappe „${name}“`,
    laterTargets: 'Ganze Gruppen und Auswahlen kommen in M10.',
    format: 'Format',
    codec: 'H.264 (MP4). ProRes und Transparenz kommen in M13.',
    onlyThisRender: 'Gilt nur für diesen Render, die Standards des Projekts bleiben.',
    fileName: 'Dateiname',
    fileNameHint: (folder: string) => `Landet als .mp4 in output/${folder}/.`,
    fileNameInvalid:
      'Der Name braucht mindestens ein Zeichen, das kein Punkt und kein Leerzeichen ist.',
    notReady: 'Noch nicht renderbar:',
    routesComputing: 'Straßenrouten werden noch berechnet …',
    routeMissing: (name: string) =>
      `Die Route von „${name}“ fehlt noch. Wähle das Fahrzeug und dort „Erneut versuchen“.`,
    saveFailed:
      'Das Projekt konnte nicht gespeichert werden. Der Server rendert nur, was gespeichert ist.',
    start: 'Rendern',
    starting: 'Wird gestartet …',
    failed: (reason: string) => `Das Rendern konnte nicht starten: ${reason}`,
    list: {
      open: 'Render-Liste',
      title: 'Renders',
      empty: 'Noch nichts gerendert. Starte oben mit „Rendern“.',
      running: (count: number) => `${count} läuft`,
      states: {
        queued: 'Wartet',
        preparing: 'Szene wird vorbereitet …',
        rendering: 'Rendert',
        done: 'Fertig',
        failed: 'Fehlgeschlagen',
        cancelled: 'Abgebrochen',
      },
      starting: 'Startet …',
      remaining: (time: string) => `noch etwa ${time}`,
      took: (time: string) => `in ${time}`,
      cancel: 'Abbrechen',
      reveal: 'Ordner öffnen',
      copyPath: 'Pfad kopieren',
      copied: 'Pfad kopiert',
      remove: 'Aus der Liste entfernen',
      revealUnsupported: 'Ordner öffnen geht nur unter Windows. Der Pfad ist kopiert.',
    },
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
    kinds: { project: 'Projekt', group: 'Gruppe', etappe: 'Etappe', track: 'Fahrzeug' },
    ready: 'Bereit zum Rendern.',
    name: 'Name',
    project: {
      output: 'Export (Standard für alle Etappen)',
      aspect: 'Seitenverhältnis',
      resolution: 'Auflösung',
      fps: 'Bildrate',
      later: 'Kartenstil (M9), Übergänge (M10) und Codec (M13) kommen mit ihren Modulen dazu.',
    },
    group: {
      color: 'Farbe im Projektbaum',
      later: 'Kartenstil und Übergang je Gruppe kommen mit M9 und M10 dazu.',
    },
    etappe: {
      duration: 'Dauer der Fahrt',
      view: 'Darstellung',
      viewMode: 'Ansicht',
      pitch: 'Neigung',
      pitchFlat: 'In 2D immer 0°.',
      bearing: 'Ausrichtung',
      camera: 'Kamera',
      cameraMode: 'Modus',
      followTrack: 'Folgt',
      chooseTrack: '– Fahrzeug wählen –',
      noTrackToFollow: 'Noch kein Fahrzeug in dieser Etappe.',
      startWithOverview: 'Mit Überblick beginnen',
      endWithOverview: 'Mit Überblick enden',
      overlays: 'Einblendungen',
      labels: 'Namen der Stopps',
      title: 'Titel',
      titlePlaceholder: 'z. B. Tag 4',
      attribution: 'Karten-Credits',
      later:
        'Kartenstil (M9), Intro und Outro (M11), Gelände (M12) und Zähler (M5) kommen mit ihren Modulen dazu.',
    },
    track: {
      label: 'Bezeichnung',
      vehicle: 'Fahrzeug',
      routing: 'Routing',
      timing: 'Zeitablauf',
      start: 'Start',
      untilEnd: 'Fährt bis zum Etappenende',
      duration: 'Dauer',
      easing: 'Tempo',
      style: 'Linie und Fahrzeug',
      lineColor: 'Linienfarbe',
      lineWidth: 'Linienbreite',
      lineDash: 'Linienart',
      ghostRoute: 'Ganze Route vorab blass zeigen',
      vehicleScale: 'Fahrzeuggröße',
      later: 'Flug-Optionen und Badges (M8) kommen mit ihrem Modul dazu.',
      avoid: 'Vermeiden',
      avoids: {
        highways: 'Autobahnen meiden',
        tolls: 'Mautstraßen meiden',
        ferries: 'Fähren meiden',
      } satisfies Record<RoadAvoid, string>,
      route: {
        label: 'Route',
        fresh: (distance: string, via: string) => `${distance} · ${via}`,
        tooFewPoints: 'Die Route erscheint ab zwei Wegpunkten.',
        computing: 'Route wird berechnet …',
        osrmIgnoresAvoid: 'OSRM berücksichtigt „Vermeiden“ nicht.',
        retry: 'Erneut versuchen',
        useRouter: (router: string) => `Mit ${router} berechnen`,
        failures: {
          no_route: 'Kein Weg gefunden. Liegt ein Punkt auf einer Insel oder in einem Sperrgebiet?',
          point_not_found: (name: string) =>
            `„${name}“ liegt zu weit von einer Straße oder einem Weg entfernt. Verschieb den Punkt näher heran.`,
          point_not_found_unknown:
            'Ein Wegpunkt liegt zu weit von einer Straße oder einem Weg entfernt.',
          too_long: 'Zu lang für den Routing-Dienst: höchstens 6.000 km und 50 Wegpunkte.',
          quota: (router: string) => `Das Kontingent von ${router} ist gerade aufgebraucht.`,
          unavailable: (router: string) => `${router} ist gerade nicht erreichbar.`,
          no_key:
            'Kein openrouteservice-Key: ORS_API_KEY in .env eintragen und den Server neu starten.',
          key_rejected: 'openrouteservice lehnt den Key ab. Prüf ORS_API_KEY in .env.',
          server_down: 'Der lokale Server antwortet nicht. Läuft pnpm dev?',
        },
        providers: {
          'local-great-circle': 'Großkreis',
          'local-smooth': 'geglättete Kurve',
          'local-straight': 'gerade Linien',
          ors: 'openrouteservice',
          osrm: 'OSRM',
          gpx: 'GPX-Datei',
        } as Record<string, string>,
      },
    },
    laterModule: 'folgt in einem späteren Modul',
    viewModes: { '2d': '2D (von oben)', '3d-tilted': '3D geneigt', globe: 'Globus' },
    cameraModes: {
      follow: 'Einem Fahrzeug folgen',
      'follow-all': 'Alle Fahrzeuge im Bild',
      overview: 'Überblick',
      static: 'Feste Position',
    },
    routingModes: {
      road: 'Straße',
      cycling: 'Radwege',
      walking: 'Fußwege',
      hiking: 'Wanderwege',
      'great-circle': 'Großkreis (Flug)',
      straight: 'Gerade Linien',
      smooth: 'Geglättete Kurve',
      gpx: 'GPX-Datei',
    },
    easings: {
      linear: 'Gleichmäßig',
      'ease-in-out': 'Weich an und ab',
      'ease-in': 'Weich anfahren',
      'ease-out': 'Weich bremsen',
    },
    lineDashes: { solid: 'Durchgezogen', dashed: 'Gestrichelt', dotted: 'Gepunktet' },
    aspects: {
      '16:9': '16:9 (Querformat)',
      '9:16': '9:16 (Hochformat)',
      '1:1': '1:1 (Quadrat)',
      '4:5': '4:5 (Instagram)',
    },
  },
  waypoints: {
    title: 'Wegpunkte',
    empty: 'Noch keine Wegpunkte. Such oben nach einem Ort oder Flughafen.',
    number: (n: number) => `Wegpunkt ${n}`,
    name: (n: number) => `Name von Wegpunkt ${n}`,
    kinds: { stop: 'Stopp', shape: 'Formpunkt' },
    toShape: 'Zum Formpunkt machen',
    toStop: 'Zum Stopp machen',
    endpointIsStop: 'Erster und letzter Punkt sind immer Stopps.',
    shapeNote: 'Formpunkt: unsichtbar, lenkt nur die Linie.',
    hold: 'Halt',
    showLabel: 'Name einblenden',
    drag: 'Ziehen zum Umsortieren',
    actions: (n: number) => `Aktionen für Wegpunkt ${n}`,
    moveUp: 'Nach oben',
    moveDown: 'Nach unten',
    editCoordinates: 'Koordinaten bearbeiten …',
    coordinatesTitle: (name: string) => `Koordinaten von „${name}“`,
    coordinatesHint:
      'Reihenfolge wie bei GeoJSON: erst Längengrad (Ost/West), dann Breitengrad (Nord/Süd).',
    longitude: 'Längengrad',
    latitude: 'Breitengrad',
    done: 'Fertig',
    unnamedShape: 'Formpunkt',
    mapHint:
      'Auf der Karte lassen sich Punkte ziehen; ein Klick auf die Linie fügt einen Formpunkt ein.',
  },
  map: {
    label: 'Bearbeitungskarte',
    loading: 'Karte wird geladen …',
    unavailable:
      'Die Karte lässt sich hier nicht anzeigen (WebGL fehlt). Wegpunkte gehen weiter über die Suche.',
    pickTrack: 'Wähle links ein Fahrzeug, um seine Punkte auf der Karte zu bearbeiten.',
    addPoint: 'Punkt auf Karte setzen',
    addPointHint: 'Klick auf die Karte setzt einen Punkt. Esc beendet.',
    done: 'Fertig',
    newPoint: (n: number) => `Punkt ${n}`,
    showOnMap: 'Auf Karte zeigen',
  },
  search: {
    label: 'Ort oder Flughafen suchen',
    placeholder: 'z. B. Silves, Wien Hbf oder VIE',
    results: 'Vorschläge',
    searching: 'Suche …',
    nothingFound: 'Nichts gefunden.',
    geocodingDown: 'Die Ortssuche ist gerade nicht erreichbar. Flughäfen gehen weiter.',
    airportsMissing: 'Flughafendaten fehlen: einmal „pnpm data:airports“ ausführen.',
    kinds: {
      airport: 'Flughafen',
      station: 'Bahnhof',
      locality: 'Ort',
      street: 'Straße',
      address: 'Adresse',
      region: 'Region',
      poi: 'Ort von Interesse',
    },
  },
  fields: {
    notANumber: 'Bitte eine Zahl eingeben.',
    notAColor: 'Bitte eine Farbe wie #E4572E eingeben.',
    pickColor: 'Farbe wählen',
    noColor: 'Keine',
    removeColor: 'Farbe entfernen',
    seconds: 's',
    degrees: '°',
    pixels: 'px',
    times: '×',
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

const kilometres = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
const kilometresShort = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 });

/** "8,4 km" for short routes, "2.045 km" for long ones: a decimal only where it says something. */
export function formatDistance(metres: number): string {
  const km = metres / 1000;
  return `${(km < 10 ? kilometresShort : kilometres).format(km)} km`;
}

/** Driving time as a router estimates it: "3 h 20 min", "45 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const dateFormat = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  return dateFormat.format(new Date(iso));
}
