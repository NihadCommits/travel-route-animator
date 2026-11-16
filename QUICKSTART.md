# Quick start: Travel Route Animator on your computer

[Deutsche Version](QUICKSTART.de.md)

Travel Route Animator turns trips into animated maps for your videos: train, plane, car, bike or on foot, on a flat map, in 3D or on the globe. What comes out is a video file for Premiere Pro, DaVinci Resolve or any other editor.

There are two ways to install it:

| Way                          | For whom                                            | What you need                  |
| ---------------------------- | --------------------------------------------------- | ------------------------------ |
| **A: Windows app** (easiest) | Everyone on Windows 10 or 11, no programming needed | One download, one installer    |
| **B: From the source code**  | Mac, Linux, or if you want to work on the code      | Node.js, pnpm, Git, a terminal |

**The user interface is in German.** Below, every button is named as it appears, with its meaning in brackets.

---

## Way A: the Windows app

### 1. What you need

- Windows 10 or 11, 64-bit
- About 1 GB of free space
- An internet connection while you work (maps and routes come from the web)
- A graphics card helps when rendering, but an ordinary laptop works

### 2. Download

1. Open the [Releases](https://github.com/NihadCommits/travel-route-animator/releases/latest) page.
2. Under **Assets**, download the file that starts with `Routen-Animator` and ends in `.exe` (about 230 MB).

### 3. Install

1. Double-click the downloaded file.
2. Windows will probably say **"Windows protected your PC"**. That is because the app is not signed with a paid certificate, not because of a virus. Click **More info**, then **Run anyway**.
3. Follow the installer. It needs no admin rights and puts a shortcut on your desktop.

**Does Windows block the app completely, with no "Run anyway"?** Then _Smart App Control_ is on, which only allows signed programs. Please do not switch it off: it can only be turned back on by reinstalling Windows. Use [way B](#way-b-from-the-source-code) instead.

### 4. First start

1. Start **Routen-Animator** from the desktop shortcut.
2. Answer **"Bestehende Projekte übernehmen?"** (bring in existing projects?) with **Nicht jetzt** (not now). It is only for people who already used the source code version.
3. The project list already holds the example trip **"Portugal 2026"**. Open it, pick a stage on the left and click **Vorschau** (preview) at the top. Space plays it.

The example works without signing up anywhere. For your own trips, two free keys are worth it (next step).

### 5. Free keys (recommended)

| Key                  | What for                              | Without it                                                              |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| **openrouteservice** | Real routes for car, bike and walking | A fallback service (OSRM) works, without "avoid motorways" and the like |
| **MapTiler**         | Satellite imagery as the map          | All other map styles still work                                         |

How to get them:

- **openrouteservice:** sign up at [openrouteservice.org/dev](https://openrouteservice.org/dev/#/signup), create a free **Standard** key (token) in the dashboard and copy it.
- **MapTiler:** sign up at [cloud.maptiler.com](https://cloud.maptiler.com/account/keys/) and copy the key under **API keys**. The free plan is for non-commercial use only.

To enter them: in the app, **Datei → Einstellungen** (File → Settings), paste the keys, **Speichern** (save). Windows keeps them encrypted for your user account; the app never shows them again.

In the same window, **Kontakt für freie Dienste** (contact for free services) is optional: a link to you, e.g. your Instagram or GitHub profile, which goes to the free services that ask for one. No e-mail address needed.

### 6. Your first own video

Example: a train from Salzburg to Vienna.

1. In the project list, click **Neues Projekt** (new project), type a name, **Anlegen** (create).
2. At the bottom left, click **+ Gruppe** (group), type a name such as "Hinreise", press Enter.
3. Move the mouse over the group, click its **+**, name the stage (e.g. "Salzburg – Wien"), press Enter.
4. Move over the stage, click its **+**, choose **Zug** (train).
5. On the right under **Wegpunkte** (waypoints), type "Salzburg Hbf" into the search and pick the suggestion. Then "Wien Hbf". The route appears on the map.
6. Click the stage on the left. On the right, set **Dauer der Fahrt** (duration), the view (2D, tilted 3D, globe), camera and map style.
7. Click **Vorschau** (preview) at the top and press space. In the timeline below, drag the train's bar to change when it starts and how long it drives.
8. Click **Rendern** (render) at the top right. Under **Vorlage** (preset), pick e.g. "YouTube 1080p 25p" or "Reel 1080×1920 30p" and click **Rendern**.
9. The render list shows the progress. When the video is done, **Ordner öffnen** (open folder) shows where it is: `Videos\Routen-Animator` by default.

Drag the MP4 file into your video editor.

### 7. What else it can do

| Feature                                                                 | Where                                                                                                                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A flight with a 3D plane over the globe                                 | Vehicle **Flugzeug** (plane), waypoints by airport code (`VIE`, `OPO`), stage view **Globus**                                             |
| Several vehicles, or route options                                      | More vehicles in the same stage; on the stage **Als Optionen darstellen** (show as options)                                               |
| A recording from a watch, Strava, Garmin or a drone                     | When choosing a vehicle: **Aus Datei importieren (GPX, FIT, DJI) …** (import from file, see below)                                        |
| Photos and place names that pop up                                      | On the stage, **Fotos und Orte**: **Foto hinzufügen** (phone photo with location) or **Ort hinzufügen**                                   |
| Kilometres, travel time, metres climbed, speed, heart rate, time of day | On the stage under **Bausteine** (blocks): **Baustein hinzufügen**, then drag the block in the preview to its place                       |
| A look for all overlays, miles instead of kilometres                    | **Stil der Einblendungen** (overlay style) on the project, a group or a stage; **Als eigenen Stil speichern …** keeps it for all projects |
| Map looks, your own theme                                               | **Kartenstil** (map style): pick a theme or **Theme bearbeiten …**; map **Gelände** (terrain) or **Satellit**                             |
| 3D terrain for mountains                                                | View **3D geneigt** (tilted), switch on **3D-Gelände**                                                                                    |
| 3D arrival, dive onto the destination                                   | On the stage, **Anfang und Ende** (start and end)                                                                                         |
| A whole group as one video with transitions                             | Select the group, **Rendern**, **Ganze Gruppe als ein Video**; the transition is set on the group                                         |
| Return trips and templates                                              | Right-click a stage: **Rückfahrt anlegen** (return trip), **Als Vorlage speichern** (save as template); **Aus Vorlage …** at the bottom   |
| Your own image or GIF as the vehicle                                    | On the vehicle under **Fahrzeug-Icon**                                                                                                    |
| A transparent overlay for Premiere                                      | When rendering, preset **Overlay ProRes 4444 (transparent)**                                                                              |
| Credits for the video description                                       | A `.credits.txt` file next to every video                                                                                                 |

#### A hike or ride from your watch or app (from version 1.2.0)

How to bring a real recording with time, height and heart rate into the tool:

- **Garmin Connect** (in the browser): open the activity, the gear at the top right, **Export Original**. Import the ZIP as it is, no need to unpack it.
- **Strava** (in the browser): open the activity, the **…** menu, **Export Original** (or **Export GPX**).
- **Komoot and other apps:** download the tour as **GPX**.

With timestamps the vehicle moves at the recorded pace (on the vehicle under **Tempo**: "Wie aufgezeichnet", as recorded), and the stage can show the blocks **Geschwindigkeit** (speed), **Puls** (heart rate) and **Uhrzeit** (time of day). For planned routes without a recording, the clock runs from a typed **Abfahrt** (departure).

### 8. If something does not work

| Problem                                    | Fix                                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The map stays grey                         | Check the internet connection; the maps come from OpenFreeMap online                                                                                             |
| A car route is missing or a notice appears | Enter the openrouteservice key (step 5), or choose OSRM in the notice                                                                                            |
| Satellite is greyed out                    | Enter the MapTiler key (step 5)                                                                                                                                  |
| Rendering fails or the video is black      | **Datei → Einstellungen → Grafik beim Rendern** (graphics for rendering): try another entry, e.g. `angle-egl` or `swangle` (slower, but works almost everywhere) |
| Settings cannot be saved                   | Not while a video renders; wait for the render to finish                                                                                                         |
| Windows blocks the app                     | See step 3                                                                                                                                                       |

### 9. Where your data lives

- Projects: `%APPDATA%\Routen-Animator` (type it into the Explorer address bar)
- Videos: `Videos\Routen-Animator` (can be changed in the settings)
- Uninstalling (Windows Settings → Apps) keeps your projects and videos.
- To update, download the new version from the Releases page and install it over the old one.

---

## Way B: from the source code

For Mac, Linux, or if you want to work on the code. The tool then runs in your browser. It is tested on Windows; Mac and Linux should work but have not been checked.

### 1. Install the tools (once)

1. **Node.js 24 LTS** from [nodejs.org](https://nodejs.org/).
2. **Git** from [git-scm.com](https://git-scm.com/).
3. Open a terminal (Windows: "Terminal" or "PowerShell", Mac: "Terminal") and install **pnpm**:

   ```bash
   npm install -g pnpm@12
   ```

### 2. Get the project and set it up

```bash
git clone https://github.com/NihadCommits/travel-route-animator.git
cd travel-route-animator
pnpm install
pnpm data:airports
```

`pnpm install` fetches all building blocks (a few minutes the first time), `pnpm data:airports` fetches the airport list.

Then create the settings file: on Windows `copy .env.example .env`, on Mac and Linux `cp .env.example .env`. Open `.env` in a text editor and fill in what you need:

- `ORS_API_KEY=` your openrouteservice key (see way A, step 5)
- `MAPTILER_API_KEY=` your MapTiler key for satellite imagery
- `SERVICE_CONTACT=` optionally a link to you

Copy the example trip into `data/projects/` (Windows: `xcopy /E /I examples\portugal-2026 data\projects\portugal-2026`, Mac/Linux: `mkdir -p data/projects && cp -r examples/portugal-2026 data/projects/`).

### 3. Start

```bash
pnpm dev
```

Open <http://127.0.0.1:5173> in your browser (Chrome, Edge or Firefox). Stop it with `Ctrl+C` in the terminal. The first render downloads a browser of its own for rendering (about 100 MB). Videos go to the `output/` folder.

From here, everything in way A from step 6 applies. Instead of **Datei → Einstellungen**, there is the `.env` file; restart `pnpm dev` after changing it.

### 4. Update

```bash
git pull
pnpm install
```

More for developers is in the [README](README.md).
