# Travel Route Animator

[English](#english) · [Deutsch](#deutsch)

---

## English

Travel Route Animator is a local tool that turns trip itineraries into map animations for travel videos: a train rolls from Salzburg to Vienna, a plane arcs over the globe to Porto, several cars head to different destinations at once. Routes are built in a GUI, checked in a live preview and exported as video files ready to cut in Premiere Pro or any other editor.

### Status

**Early development.** The foundation is in place: a pnpm monorepo, CI and a Remotion setup that renders MapLibre maps to MP4. The data model exists as validated schemas, and the local server stores projects as files. The editor lists projects, builds their structure (groups, stages, vehicles) in a project tree with drag and drop, and edits every item in an inspector. Input is checked against the same schemas the server uses, and problems are explained right at the field. Changes are saved automatically and can be undone. Waypoints are added by place search, by airport code (`VIE`, `OPO`) or by a click on the interactive map, which suggests a name such as "Silves, Faro". On the map, points can be dragged, and a click on the line adds a shape point that bends the route. Cars, bikes and walkers get real routes from openrouteservice (with OSRM as a way out), optionally avoiding motorways, tolls or ferries; flights follow the great circle, also across the date line, and trains and ferries run on a smooth curve through their points. Routes update while editing, are stored in the project and are never requested twice for the same points. A stage renders to MP4 by script: lines grow, vehicles drive and turn with the road, several of them in parallel with their own start and duration, pause at stops, and the camera follows one vehicle, keeps all of them in the picture or shows the overview. A 4K export looks exactly like 1080p, only sharper. In the editor the same animation plays in a live preview, drawn by the very composition the export renders, with optional safe-area guides for vertical video. A timeline below shows every vehicle as a bar with its stops; dragging a bar or its ends sets when the vehicle starts and how long it drives, and every change shows up in the preview at once. A stage is exported right from the editor: a render dialog sets format, resolution, frame rate and file name, the local server renders one job after the other, and a render list shows the progress, the time left and what the finished file really is, with buttons to open its folder or copy its path. Videos come out as H.264 MP4 tagged BT.709, ready for Premiere Pro.

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
pnpm data:airports
pnpm dev
```

`pnpm data:airports` downloads the airport list once (see Data sources). `pnpm dev` starts the editor on <http://127.0.0.1:5173> and the server on <http://127.0.0.1:5174>. Both only listen on localhost. Settings live in a `.env` file (copy `.env.example`): `SERVICE_CONTACT` is sent to free services such as Photon and OSRM, as their fair-use policies ask (a profile URL works). Road, cycling and walking routes need a free [openrouteservice](https://openrouteservice.org/dev/) key in `ORS_API_KEY`; it stays on the local server and is never logged. Without it, the editor explains what is missing and offers OSRM instead.

| Command              | What it does                                               |
| -------------------- | ---------------------------------------------------------- |
| `pnpm dev`           | Editor and server in watch mode                            |
| `pnpm test`          | All tests (Vitest)                                         |
| `pnpm test:coverage` | Tests with a coverage report (as in CI)                    |
| `pnpm lint`          | ESLint, warnings count as errors                           |
| `pnpm typecheck`     | TypeScript in every package                                |
| `pnpm format`        | Format everything with Prettier                            |
| `pnpm data:airports` | Download and filter the airport list into `data/airports/` |
| `pnpm render:etappe` | Render one stage of a project to MP4 (see below)           |
| `pnpm studio`        | Open the stage composition in Remotion Studio              |
| `pnpm app`           | Build the Windows app and start it (see below)             |
| `pnpm app:installer` | Build the Windows installer (see below)                    |

To render a stage, select it (or one of its vehicles) in the editor and click **Rendern**. Format, resolution and frame rate start from the project's defaults and apply to this render only. The video lands in `output/<project>/`, named after the stage, its format and the time, e.g. `lissabon-algarve_16x9_1080p_20261029-1530.mp4`. While a video is rendered it is called `….partial.mp4`; a cancelled or failed render leaves nothing behind. The server bundles the scene once when it starts and renders with the GPU; `RENDER_GL` in `.env` picks another OpenGL backend if renders fail.

The same render works from the command line, given a project file and the name of a stage:

```bash
pnpm render:etappe --file examples/portugal-2026/project.json --etappe "Wohin morgen?"
```

`--aspect 9:16`, `--resolution 2160p` and `--fps 30` override the project's output settings, `--gl vulkan` tries another OpenGL backend (default `angle`, the GPU). Road routes the project does not hold yet come from the local server; if it is not running, the script starts it for the routes and stops it again. The first render downloads Chrome Headless Shell (about 100 MB) once. Remotion Studio listens on your whole network, not only on localhost (Remotion has no option for that), so only start it on networks you trust.

### Windows app

`pnpm app` builds the editor, the scene bundle and an Electron shell into `apps/desktop/dist` and starts the app: one window, no terminal and no browser. The local server runs inside the app on <http://127.0.0.1:5175>, so it can run next to `pnpm dev`. The app keeps its projects in `%APPDATA%\Routen-Animator` and its videos in `Videos\Routen-Animator`. On the first start it offers to copy the projects from the repo's `data` folder; the originals stay where they are. Instead of `.env`, the app has its own settings (Datei → Einstellungen): the openrouteservice key, which Windows keeps encrypted for your user account, the contact for free services, the video folder and the OpenGL backend for rendering. The first `pnpm app` downloads Electron (about 100 MB) once.

`pnpm app:installer` builds the installer: `apps/desktop/release/Routen-Animator Setup <version>.exe`. It installs the app for your Windows user only (no admin rights needed), with a start menu entry and a desktop shortcut. The installed app brings its own Chrome Headless Shell and ffmpeg, so it renders offline right away. The installer is not code-signed, so Windows SmartScreen says "Windows protected your PC" on the first start: click "More info", then "Run anyway". With Smart App Control turned on, Windows blocks an unsigned build outright and offers no "Run anyway"; start the app with `pnpm app` instead. Uninstalling the app keeps your projects and videos. `apps/desktop/release/win-unpacked/Routen-Animator.exe` is the same app without installing it.

### Keyboard shortcuts in the editor

| Keys                                  | Action                                                |
| ------------------------------------- | ----------------------------------------------------- |
| `Ctrl+Z` / `Ctrl+Shift+Z` or `Ctrl+Y` | Undo / redo (outside of text fields)                  |
| `F2`                                  | Rename the selected item                              |
| `Del`                                 | Delete the selected item (asks for groups and stages) |
| `↑` `↓` `Home` `End`                  | Move through the project tree                         |
| `←` `→`                               | Close or open an item, or step out to its parent      |
| `↑` `↓` in a number field             | Change the value step by step (`Shift`: ten steps)    |
| `Esc` on the map                      | Stop setting points by click                          |
| `B` / `V`                             | Edit map / preview (outside of text fields)           |
| `Space` in the preview                | Play / pause                                          |
| `←` `→` in the preview                | One frame back / forward (`Shift`: one second)        |
| `←` `→` on a timeline bar             | Move the vehicle's start by 0.1 s (`Shift`: 1 s)      |
| `Shift` while dragging a bar          | Snap to whole frames instead of tenths of a second    |

### Project structure

| Path              | Purpose                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `apps/desktop`    | Windows app: Electron shell that runs the server and shows the editor               |
| `apps/editor`     | Browser GUI (React + Vite)                                                          |
| `apps/server`     | Local Fastify server for projects, geocoding, routing, render jobs                  |
| `packages/core`   | Data model (Zod schemas), inheritance, migrations and geo math; no UI, fully tested |
| `packages/scene`  | Remotion compositions used by both the preview and the export                       |
| `packages/styles` | Map styles and themes                                                               |
| `examples`        | Example trip "Portugal 2026"                                                        |

### Project files

Projects are plain JSON files in `data/projects/<name>/project.json`; the `data/` folder is not part of the repository. Every file carries a `schemaVersion`. When a file is loaded, older formats are migrated and the content is validated, so mistakes such as a swapped coordinate or a track with a single waypoint are reported with their exact location, e.g. `groups[0].etappen[1].tracks[0].waypoints[0].lngLat[1]`. Files are written atomically, and deleted projects move to `data/.trash/`. To open the example, copy `examples/portugal-2026/` into `data/projects/`.

The local server exposes the projects:

| Request                                   | Result                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/projects`                       | List with ID, name, folder and last change                              |
| `POST /api/projects` with `{"name": "…"}` | A new, empty project                                                    |
| `GET /api/projects/:id`                   | The complete project; if its file is broken, a 422 listing the problems |
| `PUT /api/projects/:id`                   | Save a project; invalid ones are rejected with a list of problems       |
| `DELETE /api/projects/:id`                | Move the project to the trash                                           |
| `GET /api/geocode?q=&bias=lng,lat,zoom`   | Place search (Photon), cached and at most one request per second        |
| `GET /api/reverse?lng=&lat=`              | The place at a point                                                    |
| `GET /api/airports?q=`                    | Airport search by IATA or ICAO code, name and town                      |
| `POST /api/route`                         | The route of one track (openrouteservice, OSRM or local), cached        |

### Data sources

The tool relies on open data and free services, including OpenStreetMap, OpenFreeMap, openrouteservice, Photon and OurAirports. Exported videos will carry an optional attribution corner, and the full credits will be listed here.

- **Place search:** [Photon](https://photon.komoot.io) by komoot, with data © OpenStreetMap contributors. The browser never calls Photon directly; the local server caches results in `data/cache/geocode/` and sends at most one request per second.
- **Airports:** [OurAirports](https://ourairports.com/data/), released to the public domain. Only large and medium airports with an IATA code are kept.
- **Routing:** [openrouteservice](https://openrouteservice.org) © HeiGIT, and as a way out OSRM on the [FOSSGIS routing server](https://routing.openstreetmap.de/about.html), both with data © OpenStreetMap contributors. Requests go through the local server, which caches them in `data/cache/routes/` and throttles them per service (openrouteservice: one request every 1.5 s, OSRM: one per second). The edit map credits both and links to [OpenStreetMap's "fix the map"](https://www.openstreetmap.org/fixthemap). Flights, trains and ferries are computed locally.

### License

The code in this repository is released under the [MIT License](LICENSE). Remotion is used under its own [license](https://www.remotion.dev/license), which is free for individuals and small companies. Map data © OpenStreetMap contributors.

---

## Deutsch

Travel Route Animator ist ein lokales Tool, das Reiserouten in Kartenanimationen für Reisevideos verwandelt: Ein Zug fährt von Salzburg nach Wien, ein Flugzeug zieht einen Bogen über den Globus nach Porto, mehrere Autos fahren gleichzeitig zu verschiedenen Zielen. Routen werden in einer Oberfläche angelegt, in einer Live-Vorschau geprüft und als Videodatei exportiert, die direkt in Premiere Pro oder einem anderen Schnittprogramm weiterverarbeitet werden kann.

### Status

**Frühe Entwicklung.** Das Fundament steht: ein pnpm-Monorepo, CI und ein Remotion-Aufbau, der MapLibre-Karten als MP4 rendert. Das Datenmodell existiert als validierte Schemas, und der lokale Server speichert Projekte als Dateien. Der Editor listet Projekte auf, baut ihre Struktur (Gruppen, Etappen, Fahrzeuge) in einem Projektbaum mit Drag & Drop auf und bearbeitet jedes Element in einem Eigenschaften-Bereich. Eingaben werden mit denselben Schemas geprüft wie auf dem Server, Probleme werden direkt am Feld erklärt. Änderungen werden automatisch gespeichert und lassen sich rückgängig machen. Wegpunkte kommen per Ortssuche, Flughafen-Code (`VIE`, `OPO`) oder Klick auf die interaktive Karte dazu; die Karte schlägt dabei einen Namen wie „Silves, Faro“ vor. Auf der Karte lassen sich Punkte ziehen, und ein Klick auf die Linie fügt einen Formpunkt ein, der die Route lenkt. Autos, Fahrräder und Fußwege bekommen echte Routen von openrouteservice (OSRM als Ausweg), auf Wunsch ohne Autobahnen, Maut oder Fähren; Flüge folgen dem Großkreis, auch über die Datumsgrenze, Züge und Fähren fahren auf einer geglätteten Kurve durch ihre Punkte. Routen passen sich beim Bearbeiten an, werden im Projekt gespeichert und für dieselben Punkte nie zweimal angefragt. Eine Etappe lässt sich per Skript als MP4 rendern: Linien wachsen, Fahrzeuge fahren und drehen sich mit der Straße, mehrere parallel mit eigenem Start und eigener Dauer, sie halten an Stopps, und die Kamera folgt einem Fahrzeug, hält alle im Bild oder zeigt den Überblick. Ein 4K-Export sieht genauso aus wie 1080p, nur schärfer. Im Editor läuft dieselbe Animation in einer Live-Vorschau, gezeichnet von genau der Komposition, die auch der Export rendert, auf Wunsch mit Hilfslinien für sichere Bereiche im Hochformat. Eine Timeline darunter zeigt jedes Fahrzeug als Balken mit seinen Stopps; wer einen Balken oder seine Enden zieht, legt fest, wann das Fahrzeug startet und wie lange es fährt, und sieht jede Änderung sofort in der Vorschau. Exportiert wird direkt aus dem Editor: Ein Render-Dialog legt Format, Auflösung, Bildrate und Dateiname fest, der lokale Server rendert einen Auftrag nach dem anderen, und eine Render-Liste zeigt den Fortschritt, die Restzeit und was die fertige Datei wirklich ist, mit Knöpfen zum Öffnen des Ordners und zum Kopieren des Pfads. Die Videos sind H.264-MP4 mit BT.709-Kennzeichnung, fertig für Premiere Pro.

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
pnpm data:airports
pnpm dev
```

`pnpm data:airports` lädt einmalig die Flughafenliste (siehe Datenquellen). `pnpm dev` startet den Editor unter <http://127.0.0.1:5173> und den Server unter <http://127.0.0.1:5174>. Beide sind nur lokal erreichbar. Einstellungen stehen in einer `.env`-Datei (Vorlage: `.env.example`): `SERVICE_CONTACT` geht an kostenlose Dienste wie Photon und OSRM, wie es deren Fair-Use-Regeln erbitten (eine Profil-URL genügt). Routen für Auto, Rad und zu Fuß brauchen einen kostenlosen [openrouteservice](https://openrouteservice.org/dev/)-Key in `ORS_API_KEY`; er bleibt auf dem lokalen Server und wird nie geloggt. Fehlt er, erklärt der Editor das und bietet OSRM an.

| Befehl               | Was er tut                                               |
| -------------------- | -------------------------------------------------------- |
| `pnpm dev`           | Editor und Server mit automatischem Neuladen             |
| `pnpm test`          | Alle Tests (Vitest)                                      |
| `pnpm test:coverage` | Tests mit Abdeckungsbericht (wie im CI)                  |
| `pnpm lint`          | ESLint, Warnungen zählen als Fehler                      |
| `pnpm typecheck`     | TypeScript in allen Paketen                              |
| `pnpm format`        | Alles mit Prettier formatieren                           |
| `pnpm data:airports` | Flughafenliste laden und nach `data/airports/` filtern   |
| `pnpm render:etappe` | Eine Etappe eines Projekts als MP4 rendern (siehe unten) |
| `pnpm studio`        | Die Etappen-Komposition in Remotion Studio öffnen        |
| `pnpm app`           | Die Windows-App bauen und starten (siehe unten)          |
| `pnpm app:installer` | Den Windows-Installer bauen (siehe unten)                |

Zum Rendern einer Etappe wählt man sie (oder eines ihrer Fahrzeuge) im Editor und klickt auf **Rendern**. Seitenverhältnis, Auflösung und Bildrate starten mit den Projekt-Standards und gelten nur für diesen Render. Das Video landet in `output/<projekt>/` und heißt nach Etappe, Format und Zeit, z. B. `lissabon-algarve_16x9_1080p_20261029-1530.mp4`. Während des Renderns heißt es `….partial.mp4`; ein abgebrochener oder fehlgeschlagener Render hinterlässt nichts. Der Server bündelt die Szene einmal beim Start und rendert mit der GPU; `RENDER_GL` in der `.env` wählt ein anderes OpenGL-Backend, falls Renders scheitern.

Derselbe Render geht auch auf der Kommandozeile, mit einer Projektdatei und dem Namen der Etappe:

```bash
pnpm render:etappe --file examples/portugal-2026/project.json --etappe "Wohin morgen?"
```

`--aspect 9:16`, `--resolution 2160p` und `--fps 30` überschreiben die Ausgabe-Einstellungen des Projekts, `--gl vulkan` probiert ein anderes OpenGL-Backend (Standard `angle`, die GPU). Straßenrouten, die im Projekt noch fehlen, holt das Skript vom lokalen Server; läuft er nicht, startet das Skript ihn dafür und beendet ihn danach wieder. Beim ersten Rendern lädt Remotion einmalig Chrome Headless Shell herunter (etwa 100 MB). Remotion Studio ist im ganzen Netzwerk erreichbar, nicht nur lokal (Remotion bietet dafür keine Einstellung), also nur in vertrauenswürdigen Netzen starten.

### Windows-App

`pnpm app` baut den Editor, das Szenen-Bundle und eine Electron-Hülle nach `apps/desktop/dist` und startet die App: ein Fenster, kein Terminal, kein Browser. Der lokale Server läuft in der App unter <http://127.0.0.1:5175>, also auch parallel zu `pnpm dev`. Die App hält ihre Projekte in `%APPDATA%\Routen-Animator` und ihre Videos in `Videos\Routen-Animator`. Beim ersten Start bietet sie an, die Projekte aus dem `data`-Ordner des Repos zu kopieren; die Originale bleiben, wo sie sind. Statt der `.env` hat die App eigene Einstellungen (Datei → Einstellungen): den openrouteservice-Key, den Windows für dein Benutzerkonto verschlüsselt aufbewahrt, den Kontakt für freie Dienste, den Videoordner und das OpenGL-Backend fürs Rendern. Beim ersten `pnpm app` lädt Electron einmalig sein Programm herunter (etwa 100 MB).

`pnpm app:installer` baut den Installer: `apps/desktop/release/Routen-Animator Setup <version>.exe`. Er installiert die App nur für deinen Windows-Benutzer (ohne Admin-Rechte), mit Startmenü-Eintrag und Desktop-Verknüpfung. Die installierte App bringt ihren eigenen Chrome Headless Shell und ffmpeg mit und rendert damit sofort auch offline. Der Installer ist nicht signiert, deshalb meldet Windows SmartScreen beim ersten Start „Der Computer wurde durch Windows geschützt“: auf „Weitere Informationen“ und dann „Trotzdem ausführen“ klicken. Ist Smart App Control eingeschaltet, blockiert Windows einen unsignierten Build ganz und bietet kein „Trotzdem ausführen“ an; dann startet `pnpm app` die App. Beim Deinstallieren bleiben Projekte und Videos erhalten. `apps/desktop/release/win-unpacked/Routen-Animator.exe` ist dieselbe App ohne Installation.

### Tastenkürzel im Editor

| Tasten                                     | Aktion                                                               |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `Strg+Z` / `Strg+Umschalt+Z` oder `Strg+Y` | Rückgängig / Wiederholen (außerhalb von Textfeldern)                 |
| `F2`                                       | Ausgewähltes Element umbenennen                                      |
| `Entf`                                     | Ausgewähltes Element löschen (mit Rückfrage bei Gruppen und Etappen) |
| `↑` `↓` `Pos1` `Ende`                      | Durch den Projektbaum wandern                                        |
| `←` `→`                                    | Element zu- oder aufklappen bzw. zum übergeordneten springen         |
| `↑` `↓` in einem Zahlenfeld                | Wert schrittweise ändern (`Umschalt`: zehn Schritte)                 |
| `Esc` auf der Karte                        | Punkte setzen per Klick beenden                                      |
| `B` / `V`                                  | Bearbeiten / Vorschau (außerhalb von Textfeldern)                    |
| `Leertaste` in der Vorschau                | Abspielen / Anhalten                                                 |
| `←` `→` in der Vorschau                    | Einen Frame zurück / vor (`Umschalt`: eine Sekunde)                  |
| `←` `→` auf einem Timeline-Balken          | Start des Fahrzeugs um 0,1 s verschieben (`Umschalt`: 1 s)           |
| `Umschalt` beim Ziehen eines Balkens       | Auf ganze Frames statt Zehntelsekunden einrasten                     |

### Projektstruktur

| Pfad              | Zweck                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `apps/desktop`    | Windows-App: Electron-Hülle, die den Server startet und den Editor zeigt                            |
| `apps/editor`     | Oberfläche im Browser (React + Vite)                                                                |
| `apps/server`     | Lokaler Fastify-Server für Projekte, Ortssuche, Routing und Render-Jobs                             |
| `packages/core`   | Datenmodell (Zod-Schemas), Vererbung, Migrationen und Geo-Mathematik; ohne UI, vollständig getestet |
| `packages/scene`  | Remotion-Kompositionen für Vorschau und Export                                                      |
| `packages/styles` | Kartenstile und Themes                                                                              |
| `examples`        | Beispielreise „Portugal 2026“                                                                       |

### Projektdateien

Projekte sind einfache JSON-Dateien unter `data/projects/<name>/project.json`; der Ordner `data/` gehört nicht zum Repository. Jede Datei trägt eine `schemaVersion`. Beim Laden werden ältere Formate migriert und der Inhalt geprüft, sodass Fehler wie eine vertauschte Koordinate oder ein Track mit nur einem Wegpunkt mit genauer Fundstelle gemeldet werden, z. B. `groups[0].etappen[1].tracks[0].waypoints[0].lngLat[1]`. Dateien werden atomar geschrieben, gelöschte Projekte landen in `data/.trash/`. Um das Beispiel zu öffnen, `examples/portugal-2026/` nach `data/projects/` kopieren.

Der lokale Server stellt die Projekte bereit:

| Anfrage                                  | Ergebnis                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/projects`                      | Liste mit ID, Name, Ordner und letzter Änderung                                 |
| `POST /api/projects` mit `{"name": "…"}` | Ein neues, leeres Projekt                                                       |
| `GET /api/projects/:id`                  | Das komplette Projekt; ist seine Datei kaputt, eine 422 mit Liste der Probleme  |
| `PUT /api/projects/:id`                  | Projekt speichern; ungültige werden mit einer Liste der Probleme abgelehnt      |
| `DELETE /api/projects/:id`               | Projekt in den Papierkorb verschieben                                           |
| `GET /api/geocode?q=&bias=lng,lat,zoom`  | Ortssuche (Photon), zwischengespeichert, höchstens eine Anfrage pro Sekunde     |
| `GET /api/reverse?lng=&lat=`             | Der Ort an einem Punkt                                                          |
| `GET /api/airports?q=`                   | Flughafensuche nach IATA- oder ICAO-Code, Name und Ort                          |
| `POST /api/route`                        | Die Route eines Tracks (openrouteservice, OSRM oder lokal), zwischengespeichert |

### Datenquellen

Das Tool nutzt offene Daten und kostenlose Dienste, darunter OpenStreetMap, OpenFreeMap, openrouteservice, Photon und OurAirports. Exportierte Videos bekommen eine abschaltbare Attribution-Ecke, die vollständigen Credits stehen künftig hier.

- **Ortssuche:** [Photon](https://photon.komoot.io) von komoot, Daten © OpenStreetMap-Mitwirkende. Der Browser ruft Photon nie direkt auf; der lokale Server speichert Ergebnisse in `data/cache/geocode/` zwischen und schickt höchstens eine Anfrage pro Sekunde.
- **Flughäfen:** [OurAirports](https://ourairports.com/data/), gemeinfrei (Public Domain). Übernommen werden nur große und mittlere Flughäfen mit IATA-Code.
- **Routing:** [openrouteservice](https://openrouteservice.org) © HeiGIT, als Ausweg OSRM auf dem [FOSSGIS-Routing-Server](https://routing.openstreetmap.de/about.html), beide mit Daten © OpenStreetMap-Mitwirkende. Anfragen laufen über den lokalen Server, der sie in `data/cache/routes/` zwischenspeichert und pro Dienst drosselt (openrouteservice: eine Anfrage alle 1,5 s, OSRM: eine pro Sekunde). Die Bearbeitungskarte nennt beide und verlinkt auf [„fix the map“ von OpenStreetMap](https://www.openstreetmap.org/fixthemap). Flüge, Züge und Fähren werden lokal berechnet.

### Lizenz

Der Code in diesem Repository steht unter der [MIT-Lizenz](LICENSE). Remotion wird unter seiner eigenen [Lizenz](https://www.remotion.dev/license) genutzt, die für Einzelpersonen und kleine Firmen kostenlos ist. Kartendaten © OpenStreetMap-Mitwirkende.
