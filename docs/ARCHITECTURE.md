# Architecture

This page is for someone who wants to change the code. The [README](../README.md) lists the folders. This page says how the parts fit together, and which rule is checked where.

## The one rule

Dependencies point one way:

```text
shared  <-  content  <-  domain    <-  game, render, ui, audio, input, persistence, wonder
shared  <-  content  <-  learning  <-  game, ui, persistence
```

`src/shared`, `src/content`, `src/domain` and `src/learning` are plain TypeScript. They may not read the clock, call `Math.random`, touch the DOM or the network, or import Phaser. Time and chance come in as arguments. That is what lets a test play a thousand games without a browser, and what lets a save resume the exact random stream.

`tests/architecture/layers.test.ts` enforces this by reading every file: it checks the imports of each layer and searches the code, with comments and strings removed, for the banned names. `src/sw` and `src/offline` have their own, smaller rules, because the service worker runs where there is no page.

## From page load to play

`src/main.ts` makes the DOM layer (`Ui`) and calls `boot`. `src/boot/boot.ts` runs the start in order and each step has a file of its own in `src/boot`:

1. Read the saved world, settings and learning book from IndexedDB (`src/boot/kept.ts`). A save from a newer version of the game is refused, not rewritten.
2. Load the pictures for the herd and the first map (`src/boot/graphics.ts`).
3. Start a world (`src/boot/world.ts`), the audio (`src/boot/sound.ts`) and the parent panel (`src/boot/parent.ts`).
4. Build the learning tables, the screens and the title (`src/boot/learning.ts`, `src/boot/tables.ts`, `src/boot/screens.ts`, `src/boot/title.ts`).

The reading computer, the memory table, the maths table, the About notices and the parent's reading text are separate chunks. They are loaded with `import()` the first time they are needed, from `src/boot/tables.ts` and the parent pages. `tests/architecture/lazy-course.test.ts` fails if anything the first page loads can reach them with a plain import, which is how the first download stays small.

`window.__ua` exposes the running game to the browser tests, only with `?test` or in the development server (`src/boot/debug.ts`).

## One step of the game

`GameController` in `src/game/controller.ts` is the only thing that steps the world. It owns the simulation, its picture, the camera and the order in which things happen across a change of place.

- The simulation runs at a fixed step, `CONFIG.stepHz`. A frame takes as many steps as the accumulated time asks for, at most `CONFIG.maxStepsPerFrame`, and drops the rest instead of spiralling. The picture is drawn between the previous and the current position of each actor.
- Input becomes a `Command` (`tap`, `steer`, `enter-code` and so on, in `src/domain/types.ts`) and goes in through `dispatch`. `step` moves the world on. `drainEvents` returns what happened, and the controller turns events into sound, effects and calls to the screens.
- Views in `src/render` read world state and never write to it.
- A failure in a frame or an event is counted and carried past (`src/game/faults.ts`), because Phaser draws the next frame only if the last one returned.

## The simulation

`src/domain` is a function of a seed, a map and a list of commands.

- **Randomness.** One `Rng` (mulberry32, 32 bits of state) per stream. The unicorns, the creatures and the fruit each have their own, so a creature's whim never changes what a unicorn does. A save stores `rngState`.
- **Walkable ground.** There is no navmesh. Obstacles are compiled to signed distance functions (`src/domain/nav/obstacles.ts`) and put in a spatial hash. A point is walkable when its clearance is at least the foot radius. `Nav.slide` pushes a body out along the gradient of the clearance, so it slides along a pond edge. Routes are A\* on a 32 unit grid over typed arrays, with eight-way moves that never cut a corner, then simplified and rounded only where the rounded corner still fits.
- **The herd.** Followers do not chase the leader. The leader leaves breadcrumbs with arc length (`src/domain/trail.ts`), and each follower stands at its own arc length behind (`src/domain/slots.ts`), plus a sideways offset that is scaled down where the trail doubles back and bounded by the room the spot has to spare. A follower that is stuck walks back by a route, and as a last resort relocates onto the trail.
- **Systems.** `systems/` holds one file for each concern: the leader and her steering, keeping her on ground a finger can move her from (`footing`), the herd, idle activities, encounters with friends who have not been found, spells and what they do to props, pickups, locks, the rainbow, the creatures and the grown-ups.
- **Invariants.** `checkInvariants` returns a readable line for each rule that is broken, such as an actor off walkable ground, one that moved too far in a step, or an anchor with more holders than room. The domain tests call it after every step.
- **The census.** `tools/qa/census-core.ts` plays the simulation headless from every starting map, with idle spells, taps, door walks and several ways of holding a finger, and counts what a child would see as wrong: a unicorn that changes what it is doing several times a second, one that jumps, two that stand on each other.

## Learning

The learning mode is optional and sits beside the game, not in it.

- `src/shared/learning.ts` holds the shapes of what a parent chooses and what the learner has done. The profile is versioned, and a copy of the game that does not know a skill leaves a profile that holds one alone.
- `src/learning` is the engine. `learn` takes a skill, a word's progress, an attempt, the time and the level a new word starts at, and returns the new progress. It reads no clock. `src/learning/reading` plans a round of the reading course, and `src/learning/play` holds the rules of the memory and maths tables.
- `src/content/reading` is the course as data: stages in chapters, written as sounds (`snow=s.n.ow:oh`) and parsed into the tiles a child touches. `pnpm course:report` checks it.
- Sessions are `src/game/teacher.ts` (the spelling card), `src/game/reader.ts`, `src/game/memory-game.ts` and `src/game/maths-game.ts`. They talk to the screens in `src/ui/learning` through the interfaces in the `*-ports.ts` files, so a session runs under a test with no DOM.
- `src/persistence/learner.ts` keeps the profile. An entry that cannot be read is quarantined, not dropped, and two copies of a profile merge without losing a star.

## Saved data

IndexedDB through `idb`, with every record checked by a zod schema in `src/shared/save.ts` and `src/shared/learning.ts`. `src/persistence` has the store, the keeper that saves the world as it is played, and the settings. A visit is `kept`, `fresh` or `incognito` (`src/persistence/visit.ts`). `incognito` writes nothing at all. A parent can download the world and the Spell Book and load them at another address.

## Pictures

Almost every picture is generated, by `tools/art`:

- A CPU rasterizer (`tools/art/core`) renders meshes at 4x supersampling into a G-buffer. Each pixel then votes for a material variant, weighted by a priority, and ends as an index into a palette ramp, never an RGB value, so recolouring is a ramp edit. Inner lines come from depth gaps between parts, and the outline is lighter on the lit side. Ramps are built in Oklab.
- The unicorn is a model written as code, posed by two-bone IK. Clips are functions from a frame to a `Pose`, and the body bob is solved from the planted hooves.
- Frames are cached under `assets/source/frames` by a hash of the files that change how a frame looks. `packAtlas` trims, de-duplicates, packs and pads the frames, and throws when a page overflows.
- Sheets are lossless WebP. `tools/lib/webp.ts` decodes each file again and compares it pixel by pixel with the sheet it came from.
- A unicorn is drawn at 32 facings. The first sheet draws six of them, and the game shows two more by turning the northwest and southwest frames over. The other 26 come from fine sheets loaded after play starts, or never on a low-end device. `pnpm assets:validate` fails if a turned clip is not exactly its partner.
- `pnpm assets:validate` also holds every size to its budget (`tools/assets/check/budgets.ts`), and `docs/ASSET_REPORT.md` is written by it.

At run time Phaser draws the maps and actors. Everything that stands on the ground sorts by the y of its feet. A device profile (`src/render/profile.ts`) is one record of switches, so no code asks which device it is on.

## Sound

- The music, ambience and effects of the maps are rendered offline by `tools/audio` with a seeded DSP library. Loudness is set with a K-weighted meter written in the repo and cross-checked against `ffmpeg`.
- The mini-games and the spelling sounds are synthesized live (`src/audio/synth`, `src/wonder/engine`). Cost is counted in Web Audio nodes, not in voices, because the audio thread visits every sounding node even at zero gain. `src/audio/synth/budget.ts` says how much may sound at once and which sound makes way. Everything passes a soft ceiling so overlapping sounds do not clip.
- The generative accompaniment in `src/wonder/engine/band.ts` runs on the audio clock a sixteenth at a time, a moment ahead, so the beat does not move with the frame rate. All its chords come from one pentatonic scale.
- The spoken lessons are made once, offline, with a speech model, by the Python scripts in `tools/voice`, then packed by `pnpm assets:build speech`.

## Offline play

`src/sw/precache.ts` keeps one release on the device. A file is kept only if it is the file the build recorded: status 200, no redirect, the right content type and the right SHA-256, so a hotel sign-in page can never be kept as the game's code. Each release has its own caches. A hashed file may be borrowed from an older release, which is why Phaser is a chunk of its own. The build puts every file in a group (`boot`, `rest` or `voice`), and `tools/build/build-sw.ts` writes the plan into `sw.js`. Everything the worker touches comes in through `Ports`, so its rules run under a test.

`pnpm smoke` plays the finished build under a folder in Chromium, keeps it, goes offline and reloads. [`docs/DEPLOY.md`](DEPLOY.md) has the rest.

## Mini-games

`src/wonder/engine` is a small engine of its own: a stage, a painter, particles, a script of timed cues, the band, a shuffle bag that deals every item before any repeats (`src/wonder/engine/bag.ts`), and a star meter in which doing the same thing again is worth less each time (`src/wonder/engine/novelty.ts`). Each game in `src/wonder/games` is built from these. The tone matrix is adapted from another project and is under its own licence (`src/wonder/games/tonematrix/NOTICE.md`).

## Tests

| Where | What |
|---|---|
| `tests/**` and `src/**/*.test.ts` | Unit tests (Vitest, node). |
| `tests/architecture` | Layers, lazy chunks, licences, and a scan of the repository for private information. |
| `tests/e2e` | Playwright against the Vite server on a phone, a high-density phone, a desktop and WebKit. They play the game through `window.__ua`. |
| `pnpm smoke` | The built site under a folder, kept and then offline. |
| `tools/qa` | The census, the perf counter, and tools that photograph the game. Not part of `pnpm test`. |

## Words used in the code

| Word | Meaning |
|---|---|
| herd | Wildstar and the friends who follow her. |
| trail, slot | The path the leader walked, and the place on it where a follower stands. |
| anchor | A place a unicorn can use, such as a seat, with a limit on how many at once. |
| encounter | A friend who has not been found yet, waiting in a clearing. |
| portal | A door between two maps. The herd goes through together. |
| prop, reaction | A thing in a map, and what a spell does to it. |
| wonder | A mini-game. |
| table, desk | A place where a learning game is played, and the object that runs it. |
| stage, chapter | A step of the reading course, and a group of them. |
| strand, family | A kind of sum, and the set of kinds that make up Level 0 or Level 1. |
| profile, book | What the learner has done, and the Spell Book that shows it. |
| visit | One opening of the game, `kept`, `fresh` or `incognito`. |
| release | One build. Its id is a hash of its files. |
