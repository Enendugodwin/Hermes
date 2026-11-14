# Design system

HERMES uses the **Mission Control** visual language for Earth observation: a deep-space field,
graphite glass surfaces, hairline separators, one mission-orange accent, signal green for healthy
systems and a map that owns the workspace. The intent is a professional satellite operations
console — cinematic but scientifically calm — not a generic analytics dashboard.

The reference direction is a dark geospatial mission-control UI; the implementation is adapted to
Hermes, not copied from it.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| Background | `#080C11` | Page canvas, map fallback, status bar |
| Surface | `#111820` | Glass panels, sidebar, header, popovers |
| Elevated surface | `#1B2631` | Floating controls, hovered rows |
| Text primary (ink) | `#E8EDF2` | Headings, values |
| Text secondary (muted) | `#9AA8B5` | Body copy, labels |
| Faint | `#70808F` | Metadata, hints, axis text |
| Border | `#E8EDF2` at 6–12% | Hairlines, controls, panel edges |
| Mission orange | `#F28A43` | Primary action, active nav, map controls |
| Fire amber | `#FFB45C` | Low fire activity, chart line |
| Alert red | `#E65C50` | High fire activity, critical alerts |
| Signal green | `#72C98B` | Healthy system status, verified data only |
| Azure | `#6FA8FF` | MODIS sensor identity, informational state |

Fire colours (`#FFB45C`, `#F28A43`, `#E65C50`) are **semantic data colours** reserved for severity
scales and the disclaimer. Orange is also the interaction accent, but green is never decorative:
it means a system is healthy.

## Typography

| Role | Font | Size / weight |
| --- | --- | --- |
| Headings | Inter (500) | 28–34px, tracking −0.02em |
| Body | Inter (300) | 13–14px / 1.65 |
| Labels | Inter (500) | 9–11px uppercase, tracking 0.16–0.22em |
| Measurements / IDs | IBM Plex Mono | 11–20px, tabular |

Measurements, coordinates, timestamps, source codes and endpoint paths are always monospaced so
instrument readings stay unambiguous.

## Surfaces and depth

- Floating information panels use `.glass-panel`: a vertical graphite gradient at 84–90% opacity,
  an 18px backdrop blur with 130% saturation, a 1px hairline border and one deep lift shadow.
- Map overlays sit above a vignette so white text remains legible over bright NASA imagery.
- Radii stay in the family 3 / 4 / 6 / 8px. Cards are not over-rounded.
- Shadows are used only on floating surfaces; flat content uses separators, not shadows.

## Layout rhythm

Base unit 6px. Steps used: 6, 8, 10, 12, 14, 18, 22, 28. Card padding 14–18px, control height 32px,
header 56px, sidebar 248px (68px rail).

The Overview is a map-first workspace:

- full-bleed map between the header and status bar;
- mission strip top-left and map toolbar top-right;
- collapsible glass panel left (global activity) and right (sensor network / detection detail);
- temporal explorer bottom-centre;
- mobile summary strip with a bottom-sheet entry to the panels.

## Map language

- Default basemap is NASA GIBS Blue Marble (`BlueMarble_NextGeneration`), attributed in the UI.
- Fire layers: gridded density cells below zoom 6, individual detections at closer zooms.
- Cell colour is density, not FRP, so one intense detection cannot recolour a whole cell.
- MODIS and VIIRS have distinct sensor outline colours; severity uses the fire ramp.
- The harmonised view removes VIIRS detections already associated with MODIS and marks duplicates.
- Controls: 2D/3D camera, layers, sensors, heatmap, imagery, harmonised view, full screen.

## Motion

Minimal: 150ms colour and border transitions, 240ms panel entry, 4s breathing pulse for live
indicators, 700ms camera pitch. All motion is disabled under `prefers-reduced-motion`.

## Components

| Component | Recipe |
| --- | --- |
| Primary action | Mission-orange fill, `#0A0F14` label, 4px radius |
| Secondary action | Glass control: hairline border, 4% white fill, muted label |
| Glass panel | Graphite gradient, 18px blur, hairline border, collapse chevron |
| Metric | 9px label, 26–27px mono figure, faint hint |
| Badge | 3px radius, semantic hairline and label, 10px uppercase |
| Nav item | 4px radius, quiet by default, orange icon + 2px left rule when active |
| Popover | Glass card, 6px radius, lift shadow |
| Sensor row | Colour dot, name, count, share bar, reporting state |
| Temporal explorer | SVG area line, active days, peak day, period presets |

## Constraints

- One interaction accent (orange); green is reserved for healthy systems.
- No invented data. Empty, loading and error states are explicit; synthetic rows are labelled.
- Every measurement has a unit, a source and a date where the API provides one.
- Borders are hairlines at 6–12% white — never a solid light stroke.
- Panels collapse; the map may reclaim the screen.
- Never introduce a new radius, font size or spacing value outside the families above.
