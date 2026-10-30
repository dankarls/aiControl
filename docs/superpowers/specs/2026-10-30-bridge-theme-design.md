# Bridge theme

A 3D spaceship bridge you stand on and read at a glance, inspired by classic TV starships. Sessions, alerts and limits appear on the ship itself: its stations, signs, lights and the view outside. It sits beside the Office as a second scene theme, with its own look.

A throwaway study outside the repo settled the look and the data mapping. This spec records those decisions; the study is the visual reference for the port.

## Goals

- See what needs you, and what is working, from anywhere on the bridge without reading text.
- Feel like a spaceship: real depth through the window, neon light, moving displays. Not flat, and not toon-shaded like the Office.
- Let users choose the room's colours.
- Stay fast and readable, and respect reduced motion, as `AGENTS.md` asks of every theme.

## Non-goals

- Crew or characters. Stations are unattended.
- Chair spin. Looking around is enough.
- Approving or answering requests in the scene. That stays in the HTML panel.
- The Office's hire menu and minigames. Sessions are started from the list view, whose controls already do this.
- Star Trek names, ships or insignia. The ship and marks are original, and the UI uses no franchise terms.

## Look

**Signals** are the only things allowed to compete for attention:

| Colour | Meaning |
|---|---|
| Red `#ff4a33` | Needs you |
| Teal `#39e0c8` | Working |
| Pale blue `#9fb4e0` | Idle |
| Orange `#ff8426` | Near a limit (80% or more) |

**Rules for everything else**

- No gold, brass, tan or amber anywhere, including lights and the planet.
- Not mostly black and grey. Screen backgrounds stay dark so that text reads.
- Decoration may be colourful and alive, but must stay clear of the signal hues.
- Chairs are muted in every colour option and stay below the bloom threshold, so they never draw the eye.
- The ship outside must not resemble a Star Trek ship: no saucer and no twin nacelles.
- Light does the work: neon strips on the deck, ceiling and wall ribs with glow on the floor, a pulse chasing round the deck, a live radar, traces and spectrum on the rear displays, and a dramatic planet and nebula outside.

## Colour options

The colours are ordinary entries in the theme menu, built the way Orbit builds auto, light and dark: `bridge-neon`, `bridge-violet` and `bridge-arctic`, named Bridge neon, Bridge violet and Bridge arctic, each with `look: 'bridge'` and `scheme: 'dark'`.

- None is the main one. They share the same room, effects and data displays.
- Each is one entry in `client/bridge/palettes.js`, so adding a colour takes a single entry: wall, ceiling, trim, console, chair, seat, door, rail, floor tints, neon and three decorative tones.
- Switching between them repaints materials and redraws canvases without remounting the scene.

## Structure

`client/bridge/` is a new module, downloaded only when a Bridge option is chosen.

| File | Job |
|---|---|
| `bridge.js` | Mounts the scene, runs the frame loop, exposes the scene interface |
| `palettes.js` | The colour options |
| `ship.js` | Pure: snapshot to ship state, station assignment |
| `room.js` | Hull, deck, rails, ceiling, door, chairs, stations |
| `displays.js` | Canvas drawing for tiles, signs, alcoves and live displays |
| `lights.js` | Lights, neon and how each ship state drives them |
| `space.js` | Starfield, nebula, planet, the ship outside, warp streaks |
| `post.js` | Bloom and final tone pass |
| `camera.js` | First-person view and overview |
| `bridge.css` | Scene overlays |

Split further if a file grows hard to hold in mind; `displays.js` and `room.js` are the likely ones.

**Generalising the scene seam.** `client/main.js` and `client/style.css` assume the Office is the only scene.

- `syncOffice()` becomes `syncScene()`, driven by a small table from look to `{ load, name }`.
- `data-office-list` and `data-office-fallback` become `data-scene-list` and `data-scene-fallback`.
- The rule that gives the scene the whole page matches any scene theme, through a `data-scene` attribute set from the table, rather than `data-theme-choice=office`.
- The list-or-scene preference stays in its existing storage key, so nobody's choice resets, and is shared by both scenes.
- Picking any scene theme from the menu opens its scene, as picking the Office does today.
- The Office's behaviour does not change.

**Scene interface.** Both scenes export `webglAvailable()` and a mount function taking the existing hooks, returning `{ update, unmount, pick, panelClosed, talkTo, fire }` with today's meanings. Bridge uses `openPanel`, `nextWaiting`, `showList`, `isUnread` and `describe`, and ignores `spawn` and `showShots`.

**Reused from `client/office/`:** `player.js`, `path.js`, `overview.js` and the session helpers in `status.js`. None of them depends on `toon.js`. `camera.js` does, so Bridge has its own. `toon.js` is not used at all. Those helpers need two adaptations:

- **Round room.** `free()` and `resolveStep()` clamp to a rectangle. A room object may add an `inside(point)` test, which the Bridge uses for its circle and the Office leaves out. `walkGrid()` covers `0..width` and `0..depth`, so the Bridge's world is offset to put the circle in that square.
- **Two floor levels.** The bridge has a sunken centre and a raised deck, joined by steps through gaps in the rails, while the helpers walk on one flat level. Walking stays 2D: rails and consoles are colliders, and the Bridge's camera sets its height from a pure `floorHeight(x, z)`, eased so the steps feel like steps.

**App touchpoints for a new look:** `client/themes.js` (entries), `client/themes.css` (tokens for the chrome), `client/theme-effects.css` (chrome treatment), `client/theme-console.js` (status line wording), `client/alerts.js` (sounds), `client/style.css` (brand and status variants, swatch and preview).

## Data on the ship

| Data | Where it appears |
|---|---|
| Session title, status, plan, model, context, cost | That session's station: tile row, lit block under the rail, ceiling cove |
| Working sessions | Warp factor on the left sign equals the count; streaks in the window; teal arcs on the drive ring; teal floor glow |
| Sessions needing you | Red alert; right sign "N WAITING" and the next one's name; comm panel lowers over the window with the request; red pulsing strips |
| Waiting count and next | Left arm console |
| Projects and subagents | Deck display and shuttles alcove |
| 5-hour and weekly limits | Engineering alcove and arm console crystals |
| Cost | Credits alcove |
| Machine name | Door plate |

Sessions with a `parentId` are subagents. They appear as shuttles and never take a station.

## Ship state

`shipState(snapshot, now)` in `ship.js` is pure and returns the mode, warp factor, waiting count, next waiting session and limit details.

- **Limit:** any account's usage window at 100%, using the same expiry rule as `client/usage-presentation.js`, so an expired window does not count. Engine offline, all stop, emergency red, out of warp. Takes priority over everything else, and waiting sessions still show.
- **Hail:** one or more sessions with status `question` or `permission`. Layers on warp if others are working.
- **Warp:** one or more working sessions.
- **Orbit:** otherwise.

`assignStations(sessions, previous, now)` is also pure. There are ten stations.

- A session keeps its station for as long as it exists, so stations can be learned by position.
- A new session takes a free station, nearest the front first.
- With more sessions than stations, a waiting session with no station displaces the longest-idle one. Others without a station count towards "+N" on the deck display, and stay reachable through `n` and the list.
- A closed session's station clears after `VACANT_MS`, as Office desks do.

## Controls

- WASD or arrows to walk, click the floor to walk there, drag to look, Tab for the overview.
- Clicking a station turns to it and opens the session's panel. `n` does the same for the next waiting session.
- `pick` highlights the stations matching the current filter.
- `fire` darkens that station straight away.

## Failure and fallback

- WebGL unavailable, the module failing to load, or an error on mount or update: unmount and fall back to the list with a toast, as the Office does.
- Disconnected or error from `update`: signs read "NO SIGNAL", stations dim, and the ship drops out of warp. The error stays clear rather than leaving stale data looking live.
- Phones open on the list until the scene is picked, as the Office does.

## Performance and motion

- Static canvases redraw only when their data changes. Live displays redraw at 10 Hz at most, at low resolution.
- Bloom runs at reduced resolution and pixel ratio is capped. Lamps are instanced.
- No rendering while the tab is hidden or the list is showing.
- Reduced motion: no streak movement, chase, blinking, sweep or pulsing. Signals stay on as solid colour, so meaning is never carried by motion alone.

## Porting risk

The study uses three.js r128; the app uses 0.186.1, which treats light units and colour management differently. The room, materials and bloom are ported first and compared against the study's renders in orbit, warp, hail and limit before anything is built on them.

The study's look has only been checked in still frames under software rendering. Motion and frame rate must be checked on a real GPU during the build.

## Testing

Automated, with `node --test` like the rest of the repo:

- `tests/bridge-ship.test.mjs`: mode priority, warp factor, expired windows, waiting order, and station stability, displacement, overflow and vacancy.
- `tests/bridge-palettes.test.mjs`: for each option, decorative colours stay a minimum hue distance from red, teal and orange, nothing falls in the gold hue range, and chair and seat colours stay under the bloom threshold's brightness.
- Scene seam: both looks resolve through the table, and existing Office, navigation and theme tests still pass.
- Round room: `resolveStep` and pathfinding stay inside the circle and around colliders, and rectangular behaviour is unchanged. `floorHeight` returns the right level on the deck, in the centre and on the steps.

By hand, on a real GPU: each colour option in each ship state, walking, clicking, overview, phone layout, reduced motion, and frame rate with ten sessions.

## Build order

1. Generalise the scene seam and mount an empty Bridge scene.
2. Port the room, materials, lights and bloom; compare with the study.
3. Add palettes and the theme menu entries.
4. Add `ship.js` and its tests.
5. Add stations and displays, on live data.
6. Add alerts, warp, limits and the view outside.
7. Add movement, overview, picking and reduced motion.
8. Finish the chrome: tokens, status wording, sounds.
9. Update the README: feature line, screenshots and a one-line disclaimer that the theme is unaffiliated with any franchise.
