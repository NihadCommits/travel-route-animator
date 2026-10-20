# Travel Route Animator

[English](#english) · [Deutsch](#deutsch)

---

## English

Travel Route Animator is a local tool that turns trip itineraries into map animations for travel videos: a train rolls from Salzburg to Vienna, a plane arcs over the globe to Porto, several cars head to different destinations at once. Routes are built in a GUI, checked in a live preview and exported as video files ready to cut in Premiere Pro or any other editor.

### Status

**Early development.** The repository is being set up; the first module (monorepo foundation and a render spike) comes next. Install and usage instructions will follow as soon as there is something to run.

### Planned features

- Clear structure: project → groups → stages → vehicles → waypoints, all editable in the GUI
- Waypoints via place search, airport codes (`VIE`, `OPO`) or a click on the map
- Automatic road, cycling and walking routes; flights as great-circle arcs over a 3D globe
- Several vehicles per stage, e.g. a train and a car heading to the same city, or three route options from one starting point
- Map looks: light, dark, game-style city map, rustic, old globe, satellite, terrain
- Live preview with a timeline; export as MP4 (H.264) or ProRes, optionally with transparency
- Runs locally: no subscription, only free map and routing services

### Tech stack

TypeScript monorepo with pnpm workspaces · React + Vite editor · Remotion for preview and rendering · MapLibre GL JS with OpenFreeMap vector tiles · Node.js + Fastify local server · Zod schemas · Vitest

### Requirements

- Node.js 24 LTS
- pnpm 12
- Git
- A GPU is recommended for rendering

### Data sources

The tool relies on open data and free services, including OpenStreetMap, OpenFreeMap, openrouteservice, Photon and OurAirports. Exported videos will carry an optional attribution corner, and the full credits will be listed here.

---

## Deutsch

Travel Route Animator ist ein lokales Tool, das Reiserouten in Kartenanimationen für Reisevideos verwandelt: Ein Zug fährt von Salzburg nach Wien, ein Flugzeug zieht einen Bogen über den Globus nach Porto, mehrere Autos fahren gleichzeitig zu verschiedenen Zielen. Routen werden in einer Oberfläche angelegt, in einer Live-Vorschau geprüft und als Videodatei exportiert, die direkt in Premiere Pro oder einem anderen Schnittprogramm weiterverarbeitet werden kann.

### Status

**Frühe Entwicklung.** Das Repository wird gerade aufgesetzt; als Nächstes kommt das erste Modul (Monorepo-Grundgerüst und ein Render-Prototyp). Anleitungen zur Installation und Nutzung folgen, sobald es etwas zum Ausführen gibt.

### Geplante Funktionen

- Klare Struktur: Projekt → Gruppen → Etappen → Fahrzeuge → Wegpunkte, alles in der Oberfläche bearbeitbar
- Wegpunkte per Ortssuche, Flughafen-Code (`VIE`, `OPO`) oder Klick auf die Karte
- Automatische Routen für Auto, Fahrrad und zu Fuß; Flüge als Großkreisbogen über einem 3D-Globus
- Mehrere Fahrzeuge pro Etappe, z. B. Zug und Auto zur selben Stadt oder drei Routen-Optionen vom selben Startpunkt
- Kartenlooks: hell, dunkel, Videospiel-Stadtplan, rustikal, alter Globus, Satellit, Gelände
- Live-Vorschau mit Timeline; Export als MP4 (H.264) oder ProRes, optional mit Transparenz
- Läuft lokal: kein Abo, nur kostenlose Karten- und Routing-Dienste

### Tech-Stack

TypeScript-Monorepo mit pnpm-Workspaces · Editor mit React + Vite · Remotion für Vorschau und Rendering · MapLibre GL JS mit Vektor-Tiles von OpenFreeMap · lokaler Server mit Node.js + Fastify · Zod-Schemas · Vitest

### Voraussetzungen

- Node.js 24 LTS
- pnpm 12
- Git
- Für das Rendern wird eine GPU empfohlen

### Datenquellen

Das Tool nutzt offene Daten und kostenlose Dienste, darunter OpenStreetMap, OpenFreeMap, openrouteservice, Photon und OurAirports. Exportierte Videos bekommen eine abschaltbare Attribution-Ecke, die vollständigen Credits stehen künftig hier.
