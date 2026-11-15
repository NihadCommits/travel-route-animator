# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Project files carry their own `schemaVersion`
(currently 7); older files are migrated when they are opened.

## [1.0.0] - 2026-11-15

The first release: everything needed to go from a trip plan to a finished map animation in
Premiere Pro, running locally on free map and routing data.

### Added

- **Projects and editing:** projects as JSON files with validated schemas and migrations; a
  project tree (groups, stages, vehicles) with drag and drop, an inspector with checks at the
  field, autosave, undo and redo.
- **Places:** waypoints from a place search (Photon), airport codes (OurAirports) or a click on
  the map; draggable points and shape points on an interactive edit map.
- **Routes:** road, cycling and walking routes from openrouteservice with OSRM as a way out,
  cached and throttled on the local server; flights as great circles, trains and ferries on a
  smooth curve; tracks imported from GPX files and DJI subtitle files.
- **Animation:** a deterministic engine (every frame a pure function of scene and frame
  number) with several vehicles per stage, stops, easing and a camera that follows, frames or
  overviews; route options as dashed lines.
- **Vehicles:** 3D planes in ten aircraft types and 3D cars in six body types, built from their
  dimensions; own PNG or animated GIF images as vehicles.
- **Maps:** five built-in themes and a theme editor, place names in the local language,
  German or English, labels by kind, satellite imagery (MapTiler key), 3D terrain with
  hillshading, colour relief and contour lines.
- **Storytelling:** stages chained into one video with cuts, camera flights or fades; 3D
  arrivals, dive-in and dive-out; photo and place pins that pop up along the way; counters for
  kilometres, travel time and metres climbed; a height profile; titles.
- **Preview and timeline:** a live preview drawn by the same composition as the export, a
  timeline with draggable vehicle bars, safe-area guides for vertical video.
- **Export:** H.264, ProRes 422 HQ, ProRes 4444 with alpha and PNG sequences in any aspect
  ratio up to 4K; presets; a transparent overlay mode; a render queue that survives restarts;
  credits next to every video; vehicle motion data for After Effects, Premiere Pro, CSV and
  JSON.
- **Templates:** stages and groups saved as templates for other projects; return trips in one
  click.
- **Windows app:** an Electron app with its own settings and an installer that renders
  offline.
- **Quality:** unit tests with Vitest (coverage gates on the data model), an end-to-end test of
  the main flow with Playwright, CI on every pull request.

### How it got here

Built module by module, one pull request each, from 20 October to 15 November 2026.

| Module                             | Pull requests | Merged     |
| ---------------------------------- | ------------- | ---------- |
| M0 Foundation and spike            | #1            | 2026-10-20 |
| M1 Data model and project files    | #2            | 2026-10-21 |
| M2 Editor and project tree         | #3, #4        | 2026-10-23 |
| M3 Places and waypoints            | #5, #6        | 2026-10-26 |
| M4 Routing                         | #7, #8        | 2026-10-27 |
| M5 Animation engine                | #9            | 2026-10-27 |
| M6 Preview and timeline            | #10           | 2026-10-29 |
| M7 Export                          | #11           | 2026-10-30 |
| M7b Windows app                    | #12, #13      | 2026-10-31 |
| M8 Vehicles, 3D and flights        | #14, #15      | 2026-11-12 |
| M9 Map styles and themes           | #16, #17      | 2026-11-12 |
| M10 Chained stages and transitions | #18           | 2026-11-13 |
| M11 Arrival, dive-in and dive-out  | #19           | 2026-11-13 |
| M12 Terrain and elevation          | #20           | 2026-11-13 |
| M13 Export Pro                     | #21           | 2026-11-14 |
| M14 Import, pins and templates     | #22           | 2026-11-15 |
| M15 Portfolio polish and release   | #23           |            |

[1.0.0]: https://github.com/NihadCommits/travel-route-animator/releases/tag/v1.0.0
