# Contributing

Thank you for helping. This is a game for small children, so the bar for what goes into it is a little different from other projects.

## What the game promises

A change should keep these true. Tests guard most of them.

- No account, no advertising, no analytics, no tracking and no network call that is not a request for the game's own files. `tests/architecture/open-source.test.ts` scans the repository for secrets, personal addresses and hosting words.
- Nothing is ever called wrong. A wrong answer rests, and the right one shines after a try or two. Nothing is locked, and a card can always be closed.
- It plays with no connection once it is ready, and progress is kept on the device first.
- It starts small. `pnpm build` fails when the first download, the offline set or the spoken lessons pass their budgets in `tools/assets/check/budgets.ts`.
- It is original. Do not add pictures, sound, words or maps taken from the television series, its toys or its websites, and do not add reference images of them to the repository. The unicorns, places and music here are drawn, written and synthesized by this project's own code.

## Set up

You need Node 22.12 or newer (`.node-version` names the one used here) and pnpm 11.22.0.

```sh
pnpm install
pnpm dev
```

The game is at http://localhost:5173/. Add `?test` to the address to expose `window.__ua`, the handle that the browser tests use to read and steer the game.

Three programs are needed only to rebuild the pictures and sound, and a fresh checkout does not need them, because the generated files in `public/assets` are committed.

```sh
brew install webp ffmpeg lame
```

On Debian or Ubuntu that is `apt-get install webp ffmpeg lame`. The browser tests need `pnpm exec playwright install chromium webkit` once.

## Before you open a pull request

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm assets:validate
pnpm notices --check
pnpm test:e2e --project=phone
```

`pnpm test` runs the unit tests, which include the architecture tests under `tests/architecture`. They fail on a dependency that points the wrong way, on a pure layer that reads the clock or the browser, on a unit that does not scale with the screen, on a new licence that is not listed, and on private information. Run all four browser projects (`pnpm test:e2e`) when you change what is on the screen. Run `pnpm build` and then `pnpm smoke` when you change the service worker, the loading of assets or `vite.config.ts`.

A test says what a player or a parent can see. Prefer a test that plays the game through the same handle a person would use to one that reads a private field.

Keep a change small and say in the description what a person would notice. Comments say why, not what. Do not leave a commented-out line, a note about a person, or a sentence that is only true today.

## How the code is laid out

[`README.md`](README.md) lists the folders and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) says how they fit together. The short version is that `src/shared`, `src/content`, `src/domain` and `src/learning` are plain TypeScript with no Phaser and no browser, and `tests/architecture/layers.test.ts` keeps them that way. Phaser lives in `src/game` and `src/render`, and the DOM lives in `src/ui`.

## Make changes

### Add a prop reaction

A reaction is what a spell does to a prop near the caster. Reactions repeat, do no harm, and never change where anyone can walk.

1. Define the prop in `src/content/props.ts` if it is new. Set `tap` to `none` for a prop that only magic reaches, and give it an `initial` state if the reaction should be kept in the save.
2. Add a `Reaction` to `REACTIONS` in `src/content/magic.ts`. Use `persist` for a change that stays, or `seconds` for a moment that passes, and pick an effect from `EFFECT_IDS` in `src/content/activities.ts`.
3. If the reaction needs a new kind of saved state, add it to `SavedPropState` in `src/shared/save.ts`. A new kind leaves every older save valid. Changing the shape of an existing kind needs a new schema version.
4. Draw it. `src/render/prop-visuals.ts` chooses the sprite layers from the prop, its state and its moment. New sprites go in a recipe under `tools/assets/env/kit` and are registered in `tools/assets/env/registry.ts`. A new effect look goes in `src/render/fx/library.ts`.
5. Place an instance with `interactable` in the map's file under `tools/maps/author`, then run `pnpm assets:build env`.
6. Add the cases to `tests/domain/behaviors.test.ts` and `tests/render/prop-visuals.test.ts`. `tests/maps/maps.test.ts` already checks that every reaction has a prop to act on.

### Add a map

1. Add the id to `MAP_IDS` in `src/shared/ids.ts`. That file is part of the unicorn frame cache key, so the next `pnpm assets:build` redraws every unicorn frame once. It resumes if interrupted.
2. Write `tools/maps/author/<id>.ts` with `MapBuilder`. A copy of `tools/maps/author/treasure-house.ts` is the smallest start. Add the map to `AUTHORS` in `tools/maps/author/all.ts`.
3. If the floor is new, add a biome to `BIOMES` in `tools/art/world/terrain.ts`.
4. Give every portal a way back from the other map, and a name that is used for one destination only, since a bubble at the edge of the screen is kept by the name of its portal. The maps test fails for a portal that strands the herd and for a name that leads to two places.
5. Run `pnpm assets:build maps`. It writes the Tiled JSON to `assets/maps` and the compiled map to `public/assets/maps`. You can open the `.tmj` files in Tiled to look, but edit the TypeScript, which rewrites them.
6. Run `pnpm typecheck`. It points at each `Record<MapId, ...>` that needs an entry, such as `PLACE_NAMES` in `src/ui/parent/text.ts`, `EXIT_LOOKS` in `src/content/exits.ts` and `OPEN_AIR` in `src/content/seasons.ts`, which says whether the seasons reach the place. Choose the place's music and ambience in `src/shared/audio.ts`.
7. Look at the result with `pnpm exec tsx tools/maps/overview.ts <id> --overlay` and `pnpm exec tsx tools/qa/tour.ts <id> out.png`, and extend `tests/maps/maps.test.ts`.

### Add a unicorn

The herd is six unicorns, one for each magic, so this is the longest change.

1. Add the id to `UNICORN_IDS` and the magic to `MAGIC_KINDS` in `src/shared/ids.ts`. Both change the frame cache key.
2. Describe the unicorn in `src/content/unicorns.ts`, and give its spell a `SpellDef` in `src/content/magic.ts`.
3. Write its model under `tools/art/unicorn/characters` and list it in that folder's index. `tools/art/unicorn/turnaround.ts` and `tools/art/unicorn/clip-sheet.ts` draw review sheets while you work. The walk and idle are drawn in 32 facings, by turning the model about in steps of 11.25 degrees. Six of them are on the first sheet and the other 26 on five or six fine sheets. The first sheet has the northwest and southwest facings turned over for northeast and southeast, which is what a unicorn shows until its fine sheets are in, so look at how its markings read turned (`docs/ART_BIBLE.md` says why that is allowed).
4. Add its voice and spell sounds in `src/shared/audio.ts` and `tools/audio/catalog.ts`.
5. Place its encounter with `encounter` in a map file under `tools/maps/author`.
6. Run `pnpm assets:build` and then `pnpm test`. The save schemas are built from `UNICORN_IDS`, so they accept the new id, and saves written before it existed stay valid.

### Add a word to the spelling

A word is one entry in the table in `src/content/lexicon.ts`, and the entry's name is its spelling in lower case letters.

1. Pick the things in the world that give it. A thing is named by the content id it already has. That is `life.<kind>` for a creature, `unicorn.<id>` for a friend, and `prop.<definition id>` for a fruit tree, a crop bed or a heap of treasure. Several things can give one word, and one thing can give several, easiest first.
2. Pick the picture. It is a sprite the game already draws, from the `life` or `produce` bundle, or a unicorn's portrait, or a picture drawn for the word alone. `tools/qa/word-sheet.ts` lays every word's picture out in its frame so you can judge each by eye.
3. Add the entry with the helper that fits (`creature`, `crop`, `treasure` or `friend`), and name the effect that shimmers where the thing stands when the word is spelled. A word with a picture of its own goes in the `things` table instead, with the effect and the things that give it. Draw its picture as a function in a file under `tools/art/world/words`, a 48 by 48 drawing that `tools/art/world/words-preview.ts` shows at any size, and run `pnpm assets:build env` to put it in the `produce` bundle. `tests/tools/word-art.test.ts` fails while a word in `things` has no drawing or a drawing has no word.
4. Put the word on a page in `PAGES` at the bottom of the same file. A page has an id, a title, a word for its emblem and one to twelve words. The book fits twelve words on a page down to a phone of 568 by 320 pixels held sideways and 360 by 640 held upright, and puts the tabs in two rows when the sheet is narrow.
5. Run `pnpm exec vitest run tests/learning`. `tests/learning/lexicon.test.ts` fails when a word has a letter outside a to z or is too long for the card, when a picture is not in the atlases the game loads, when a thing named is not in the game or cannot be tapped, when no real map has the thing in it, and when a word is on no page.
6. Give it a voice. Run `pnpm voice:lines`, then `generate.py` from `tools/voice` (it makes only the clips that are new), then `pnpm assets:build speech`. `tools/voice/README.md` has the setup. `pnpm assets:validate` fails while a clip is missing, and `tests/tools/voice-lines.test.ts` fails while `tools/voice/lines.json` is out of date.

A new place brings a page. Add its words as above and then a page for them in `PAGES`. The Spell Book, the Learning page and the cheer for a finished page read `PAGES` and nothing else, and the teacher asks for a word by the content id of the thing that was tapped, so a place needs no other code.

### Add a place to start at

A place to start is one entry in `START_PLACES` in `src/shared/places.ts`: a label, a map and a spawn on that map. The start screen's switch, the parent's Play page and the settings all read that table, so nothing else needs code. `tests/maps/start-places.test.ts` checks that the map and the spawn exist, that Wildstar is put at the head of the spawn alone and with the whole herd, and that nobody is stuck. A table with more than two places draws a switch with more sides, and a tap on a side picks that side.

### Change what reading asks

Reading is a computer by the palace, across from the piano. What a child is asked is the course in `src/content/reading/`: 85 stages in 13 chapters, one file for each chapter in `src/content/reading/stages/`. A stage says which sounds it teaches, the words that can be read with the sounds taught so far, a few words that cannot be sounded out, and sentences. A word is written as its sounds (`snow=s.n.ow:oh`), and the parser cuts it into the tiles a child touches. `pnpm course:report` prints how many words and sentences there are, how hard each chapter is and every problem the checks found. `tests/learning/course.test.ts` fails on a course that has a problem, is too small or does not get harder, and `tests/learning/course-check.test.ts` and `tests/learning/course-parse.test.ts` say what each check catches. `pnpm course:sim` plays three kinds of child through the course and says how many rounds each takes.

A third skill is an entry in `SKILLS` and `SKILL_SINCE` in `src/shared/learning.ts`, a row in `LADDERS` in `src/learning/ladders.ts` (the compiler asks for it), a session behind ports like the spelling card's `Teacher` in `src/game/teacher.ts`, and room in `MAX_BOOK_CHARS` in `src/learning/exchange.ts`, which grows with the number of skills. A profile's `schemaVersion` is the least version that holds what is in it (`versionOf`), so a book that does not hold the new skill stays on the old version, and a copy of the game that does not know a skill leaves a book that holds it alone. `tests/learning/profile.test.ts` fails on a new skill that is not set up that way.

### Rebuild assets

Every runtime image, map and sound is generated, and the generated files in `public/assets` are committed so a fresh checkout can build without rendering.

- `pnpm assets:build` runs everything. Unicorn frames are cached under `assets/source/frames` by a hash of the art code, so only changed art is redrawn.
- `pnpm assets:build env` redraws grown-ups, scenery and maps. `npcs`, `maps` and `audio` do one part each.
- Pictures are written as lossless WebP and the build reads them back and compares every pixel, so a sheet that does not match fails the build. `docs/ASSETS.md` says how the sizes are kept down.
- `FORCE_AUDIO=1 pnpm assets:build audio` re-renders sound that is already built. The WAV masters stay in `assets/source/audio` with the hash of the code that made and packed them. An edit to that code, a comment included, fails `tests/tools/audio-record.test.ts` until `pnpm assets:build audio` has run and what it rewrites there is committed.
- `pnpm assets:build speech` packs the voice, one MP3 for each line, from the masters in `assets/source/voice` (`FORCE_SPEECH=1` packs them again). It slows a sentence to 1.5 times as long and a word to 1.25 times, with the pitch unchanged (`PACE` in `src/shared/audio.ts`), and sets every clip to -12 LUFS. A speech model made the masters, offline and once, and `tools/voice/README.md` says how to make them again and what is pinned. `pnpm voice:lines` writes `tools/voice/lines.json` from the lines the game can say in `src/learning/lines.ts`, and a test fails when the two disagree. `pnpm voice:times` copies the time of each word of each recorded sentence from the report into `src/content/reading/line-times.json`, and a test fails when that file is not what the report says.
- `pnpm assets:validate --report docs/ASSET_REPORT.md` rewrites the report with sizes, memory estimates and loudness.
- The `*-preview.ts` scripts under `tools/art` and the files under `tools/qa` photograph the game or an asset. `tools/qa/shot.ts`, `tools/qa/tour.ts`, `tools/qa/zoom.ts`, `tools/qa/fx-film.ts` and `tools/qa/npc-film.ts` need the development server running. So do `tools/qa/card-shot.ts`, which photographs the spell card at any screen size and help level, and `tools/qa/word-sheet.ts`. `tools/qa/perf.ts` counts draw calls and times frames in the palace garden, and `--ua silk --modes off,on` plays it as a Fire tablet in standard and then low-end mode. Read its counts and not its times, because the browser draws in software.
- The screen of the reading computer has a lab page, `tools/lab/reading.html`, with the real screen and the real course and none of the game around them. `tools/qa/reading-lab.ts` opens it, `tools/qa/reading-sweep.ts` walks every state of it at 31 screen sizes and fails on anything cut off, over another thing or too small to touch, and `tools/qa/reading-shot.ts` photographs it. A lab page plays no sound.

## Dependencies and licences

A new package must be under a licence that the AGPL can carry. Run `pnpm notices` after you add one, so that `THIRD_PARTY_NOTICES.md` holds its notice, and commit the result. `tests/architecture/licences.test.ts` fails on a package whose licence is not on the allowed list in `tools/licenses/notices.ts` and on a notices file that is out of date. Code adapted from another project needs its licence text, its author's name in the file and a line in `THIRD_PARTY_NOTICES.md`.

By sending a change you agree that it is licensed under the GNU Affero General Public License version 3, as the rest of the project is. The files of the tone matrix are the one exception, and they are `GPL-3.0-only`.

## Reporting a problem

Open an issue that says what you did and what you saw. For a security problem, read [`SECURITY.md`](SECURITY.md) first.
