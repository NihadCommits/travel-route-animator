# Travel Route Animator

[English](#english) · [Deutsch](#deutsch)

---

## English

Travel Route Animator is a local tool that turns trip itineraries into map animations for travel videos: a train rolls from Salzburg to Vienna, a plane arcs over the globe to Porto, several cars head to different destinations at once. Routes are built in a GUI, checked in a live preview and exported as video files ready to cut in Premiere Pro or any other editor.

### Status

**Early development.** The foundation is in place: a pnpm monorepo with editor and server skeletons, CI, and a render spike that proves a MapLibre map can be rendered to MP4 with Remotion. The data model exists as validated schemas, and the local server stores projects as files. The editor itself is built module by module from here.

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

| Command              | What it does                                             |
| -------------------- | -------------------------------------------------------- |
| `pnpm dev`           | Editor and server in watch mode                          |
| `pnpm test`          | All tests (Vitest)                                       |
| `pnpm test:coverage` | Tests with a coverage report (as in CI)                  |
| `pnpm lint`          | ESLint, warnings count as errors                         |
| `pnpm typecheck`     | TypeScript in every package                              |
| `pnpm format`        | Format everything with Prettier                          |
| `pnpm spike:studio`  | Open the render spike in Remotion Studio                 |
| `pnpm spike:render`  | Render the spike to `output/spike/` (flat map and globe) |

The first render downloads Chrome Headless Shell (about 100 MB) once. `pnpm spike:render --gl=vulkan` tries another OpenGL backend, `--only=SpikeGlobe` renders a single composition.

### Project structure

| Path              | Purpose                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `apps/editor`     | Browser GUI (React + Vite)                                                          |
| `apps/server`     | Local Fastify server for projects, geocoding, routing, render jobs                  |
| `packages/core`   | Data model (Zod schemas), inheritance, migrations and geo math; no UI, fully tested |
| `packages/scene`  | Remotion compositions used by both the preview and the export                       |
| `packages/styles` | Map styles and themes                                                               |
| `examples`        | Example trip "Portugal 2026"                                                        |

### Project files

Projects are plain JSON files in `data/projects/<name>/project.json`; the `data/` folder is not part of the repository. Every file carries a `schemaVersion`. When a file is loaded, older formats are migrated and the content is validated, so mistakes such as a swapped coordinate or a track with a single waypoint are reported with their exact location, e.g. `groups[0].etappen[1].tracks[0].waypoints[0].lngLat[1]`. Files are written atomically, and deleted projects move to `data/.trash/`. To open the example, copy `examples/portugal-2026/` into `data/projects/`.

The local server exposes the projects:

| Request                                   | Result                                                            |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `GET /api/projects`                       | List with ID, name, folder and last change                        |
| `POST /api/projects` with `{"name": "…"}` | A new, empty project                                              |
| `GET /api/projects/:id`                   | The complete project                                              |
| `PUT /api/projects/:id`                   | Save a project; invalid ones are rejected with a list of problems |
| `DELETE /api/projects/:id`                | Move the project to the trash                                     |

### Data sources

The tool relies on open data and free services, including OpenStreetMap, OpenFreeMap, openrouteservice, Photon and OurAirports. Exported videos will carry an optional attribution corner, and the full credits will be listed here.

### License

The code in this repository is released under the [MIT License](LICENSE). Remotion is used under its own [license](https://www.remotion.dev/license), which is free for individuals and small companies. Map data © OpenStreetMap contributors.

---

## Deutsch

Travel Route Animator ist ein lokales Tool, das Reiserouten in Kartenanimationen für Reisevideos verwandelt: Ein Zug fährt von Salzburg nach Wien, ein Flugzeug zieht einen Bogen über den Globus nach Porto, mehrere Autos fahren gleichzeitig zu verschiedenen Zielen. Routen werden in einer Oberfläche angelegt, in einer Live-Vorschau geprüft und als Videodatei exportiert, die direkt in Premiere Pro oder einem anderen Schnittprogramm weiterverarbeitet werden kann.

### Status

**Frühe Entwicklung.** Das Fundament steht: ein pnpm-Monorepo mit Grundgerüsten für Editor und Server, CI und ein Render-Prototyp, der zeigt, dass sich eine MapLibre-Karte mit Remotion als MP4 rendern lässt. Das Datenmodell existiert als validierte Schemas, und der lokale Server speichert Projekte als Dateien. Der eigentliche Editor entsteht ab jetzt Modul für Modul.

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

| Befehl               | Was er tut                                                      |
| -------------------- | --------------------------------------------------------------- |
| `pnpm dev`           | Editor und Server mit automatischem Neuladen                    |
| `pnpm test`          | Alle Tests (Vitest)                                             |
| `pnpm test:coverage` | Tests mit Abdeckungsbericht (wie im CI)                         |
| `pnpm lint`          | ESLint, Warnungen zählen als Fehler                             |
| `pnpm typecheck`     | TypeScript in allen Paketen                                     |
| `pnpm format`        | Alles mit Prettier formatieren                                  |
| `pnpm spike:studio`  | Render-Prototyp in Remotion Studio öffnen                       |
| `pnpm spike:render`  | Render-Prototyp nach `output/spike/` rendern (Karte und Globus) |

Beim ersten Rendern lädt Remotion einmalig Chrome Headless Shell herunter (etwa 100 MB). `pnpm spike:render --gl=vulkan` probiert ein anderes OpenGL-Backend, `--only=SpikeGlobe` rendert nur eine Komposition.

### Projektstruktur

| Pfad              | Zweck                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `apps/editor`     | Oberfläche im Browser (React + Vite)                                                                |
| `apps/server`     | Lokaler Fastify-Server für Projekte, Ortssuche, Routing und Render-Jobs                             |
| `packages/core`   | Datenmodell (Zod-Schemas), Vererbung, Migrationen und Geo-Mathematik; ohne UI, vollständig getestet |
| `packages/scene`  | Remotion-Kompositionen für Vorschau und Export                                                      |
| `packages/styles` | Kartenstile und Themes                                                                              |
| `examples`        | Beispielreise „Portugal 2026“                                                                       |

### Projektdateien

Projekte sind einfache JSON-Dateien unter `data/projects/<name>/project.json`; der Ordner `data/` gehört nicht zum Repository. Jede Datei trägt eine `schemaVersion`. Beim Laden werden ältere Formate migriert und der Inhalt geprüft, sodass Fehler wie eine vertauschte Koordinate oder ein Track mit nur einem Wegpunkt mit genauer Fundstelle gemeldet werden, z. B. `groups[0].etappen[1].tracks[0].waypoints[0].lngLat[1]`. Dateien werden atomar geschrieben, gelöschte Projekte landen in `data/.trash/`. Um das Beispiel zu öffnen, `examples/portugal-2026/` nach `data/projects/` kopieren.

Der lokale Server stellt die Projekte bereit:

| Anfrage                                  | Ergebnis                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/projects`                      | Liste mit ID, Name, Ordner und letzter Änderung                            |
| `POST /api/projects` mit `{"name": "…"}` | Ein neues, leeres Projekt                                                  |
| `GET /api/projects/:id`                  | Das komplette Projekt                                                      |
| `PUT /api/projects/:id`                  | Projekt speichern; ungültige werden mit einer Liste der Probleme abgelehnt |
| `DELETE /api/projects/:id`               | Projekt in den Papierkorb verschieben                                      |

### Datenquellen

Das Tool nutzt offene Daten und kostenlose Dienste, darunter OpenStreetMap, OpenFreeMap, openrouteservice, Photon und OurAirports. Exportierte Videos bekommen eine abschaltbare Attribution-Ecke, die vollständigen Credits stehen künftig hier.

### Lizenz

Der Code in diesem Repository steht unter der [MIT-Lizenz](LICENSE). Remotion wird unter seiner eigenen [Lizenz](https://www.remotion.dev/license) genutzt, die für Einzelpersonen und kleine Firmen kostenlos ist. Kartendaten © OpenStreetMap-Mitwirkende.
