# Travel Route Animator

[English](#english) · [Deutsch](#deutsch)

---

## English

Travel Route Animator is a local tool that turns trip itineraries into map animations for travel videos: a train rolls from Salzburg to Vienna, a plane arcs over the globe to Porto, several cars head to different destinations at once. Routes are built in a GUI, checked in a live preview and exported as video files ready to cut in Premiere Pro or any other editor.

### Status

**Early development.** The foundation is in place: a pnpm monorepo with editor and server skeletons, CI, and a render spike that proves a MapLibre map can be rendered to MP4 with Remotion. The editor itself is built module by module from here.

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

### Getting started

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the editor on <http://127.0.0.1:5173> and the server on <http://127.0.0.1:5174>. Both only listen on localhost. No API keys are needed yet; later modules read them from a `.env` file (copy `.env.example`).

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `pnpm dev`          | Editor and server in watch mode                          |
| `pnpm test`         | All tests (Vitest)                                       |
| `pnpm lint`         | ESLint, warnings count as errors                         |
| `pnpm typecheck`    | TypeScript in every package                              |
| `pnpm format`       | Format everything with Prettier                          |
| `pnpm spike:studio` | Open the render spike in Remotion Studio                 |
| `pnpm spike:render` | Render the spike to `output/spike/` (flat map and globe) |

The first render downloads Chrome Headless Shell (about 100 MB) once. `pnpm spike:render --gl=vulkan` tries another OpenGL backend, `--only=SpikeGlobe` renders a single composition.

### Project structure

| Path              | Purpose                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `apps/editor`     | Browser GUI (React + Vite)                                         |
| `apps/server`     | Local Fastify server for projects, geocoding, routing, render jobs |
| `packages/core`   | Shared types and pure logic such as geo math, fully tested         |
| `packages/scene`  | Remotion compositions used by both the preview and the export      |
| `packages/styles` | Map styles and themes                                              |

### Data sources

The tool relies on open data and free services, including OpenStreetMap, OpenFreeMap, openrouteservice, Photon and OurAirports. Exported videos will carry an optional attribution corner, and the full credits will be listed here.

### License

The code in this repository is released under the [MIT License](LICENSE). Remotion is used under its own [license](https://www.remotion.dev/license), which is free for individuals and small companies. Map data © OpenStreetMap contributors.

---

## Deutsch

Travel Route Animator ist ein lokales Tool, das Reiserouten in Kartenanimationen für Reisevideos verwandelt: Ein Zug fährt von Salzburg nach Wien, ein Flugzeug zieht einen Bogen über den Globus nach Porto, mehrere Autos fahren gleichzeitig zu verschiedenen Zielen. Routen werden in einer Oberfläche angelegt, in einer Live-Vorschau geprüft und als Videodatei exportiert, die direkt in Premiere Pro oder einem anderen Schnittprogramm weiterverarbeitet werden kann.

### Status

**Frühe Entwicklung.** Das Fundament steht: ein pnpm-Monorepo mit Grundgerüsten für Editor und Server, CI und ein Render-Prototyp, der zeigt, dass sich eine MapLibre-Karte mit Remotion als MP4 rendern lässt. Der eigentliche Editor entsteht ab jetzt Modul für Modul.

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

### Erste Schritte

```bash
pnpm install
pnpm dev
```

`pnpm dev` startet den Editor unter <http://127.0.0.1:5173> und den Server unter <http://127.0.0.1:5174>. Beide sind nur lokal erreichbar. API-Keys braucht es noch keine; spätere Module lesen sie aus einer `.env`-Datei (Vorlage: `.env.example`).

| Befehl              | Was er tut                                                      |
| ------------------- | --------------------------------------------------------------- |
| `pnpm dev`          | Editor und Server mit automatischem Neuladen                    |
| `pnpm test`         | Alle Tests (Vitest)                                             |
| `pnpm lint`         | ESLint, Warnungen zählen als Fehler                             |
| `pnpm typecheck`    | TypeScript in allen Paketen                                     |
| `pnpm format`       | Alles mit Prettier formatieren                                  |
| `pnpm spike:studio` | Render-Prototyp in Remotion Studio öffnen                       |
| `pnpm spike:render` | Render-Prototyp nach `output/spike/` rendern (Karte und Globus) |

Beim ersten Rendern lädt Remotion einmalig Chrome Headless Shell herunter (etwa 100 MB). `pnpm spike:render --gl=vulkan` probiert ein anderes OpenGL-Backend, `--only=SpikeGlobe` rendert nur eine Komposition.

### Projektstruktur

| Pfad              | Zweck                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| `apps/editor`     | Oberfläche im Browser (React + Vite)                                      |
| `apps/server`     | Lokaler Fastify-Server für Projekte, Ortssuche, Routing und Render-Jobs   |
| `packages/core`   | Gemeinsame Typen und reine Logik wie Geo-Mathematik, vollständig getestet |
| `packages/scene`  | Remotion-Kompositionen für Vorschau und Export                            |
| `packages/styles` | Kartenstile und Themes                                                    |

### Datenquellen

Das Tool nutzt offene Daten und kostenlose Dienste, darunter OpenStreetMap, OpenFreeMap, openrouteservice, Photon und OurAirports. Exportierte Videos bekommen eine abschaltbare Attribution-Ecke, die vollständigen Credits stehen künftig hier.

### Lizenz

Der Code in diesem Repository steht unter der [MIT-Lizenz](LICENSE). Remotion wird unter seiner eigenen [Lizenz](https://www.remotion.dev/license) genutzt, die für Einzelpersonen und kleine Firmen kostenlos ist. Kartendaten © OpenStreetMap-Mitwirkende.
