# Assets and size

Where every picture, sound and word of the game comes from, and what keeps the download small.

## Where things come from

| What | Made by | Licence |
|---|---|---|
| Unicorn, grown-up, scenery and effect sprites | A software 3D rasterizer in `tools/art`, which renders hard-pixel frames from meshes written as code | The licence of the repository |
| Maps | TypeScript in `tools/maps/author`, compiled to `public/assets/maps` | The licence of the repository |
| Music, ambience and sound effects | The synthesizer in `src/audio/synth` and the scores and patches in `tools/audio` | The licence of the repository |
| The spoken lessons | The speech model Qwen3-TTS 1.7B, in a voice designed for the game and cloned from two reference clips in `tools/voice/refs`, run once and offline. `tools/voice/README.md` pins the versions | The files are the game's. The model is Apache License 2.0 |
| The type | Fredoka, from the `@fontsource-variable/fredoka` package, and the title lettering cut from it by `tools/art/wordmark.py` | SIL Open Font License 1.1 |
| The tone matrix | Adapted from ToneMatrix Redux by Wolfy | GPL-3.0-only, in `src/wonder/games/tonematrix` |

No picture, sound or word comes from the television series, its toys, a stock library or an image model. The reference notes in `assets/source/reference` are written in plain words and hold no official pictures. [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) holds the notices that the licences above ask for, and `pnpm notices --check` fails when it is out of date.

`docs/ART_BIBLE.md` says how the art is meant to look, and `docs/ARCHITECTURE.md` says how the renderer and the synthesizer work. `docs/ASSET_REPORT.md` is written by `pnpm assets:validate --report` and lists every kind of file with its size, the memory it takes and the loudness of the sound.

## What the build weighs

All sizes are as sent compressed. `pnpm build` prints them for each release, and they move a little with every change.

| | Size | Files |
|---|---|---|
| To the first playable moment: the page, the code, the herd, the forest and its sound | about 4.3 MiB | about 50 |
| Kept on the device for play with no connection | about 11.2 MiB | about 140 |
| Spoken lessons, kept as they are heard or all at once | about 23.7 MiB | about 2,560 |

`pnpm assets:validate` holds the assets to these budgets (`tools/assets/check/budgets.ts`) before the app itself is counted, and `pnpm build` runs it first.

| Budget | Limit |
|---|---|
| First playable download | 5 MiB |
| The game kept for offline play | 15 MiB |
| The spoken lessons | 36 MiB |
| Graphics memory, eight facings | 160 MiB |
| Graphics memory, fine facings of all six unicorns | 272 MiB |
| Decoded audio in a crossfade | 48 MiB |

## What keeps it small

**The spoken lessons are not part of the first visit.** They are two thirds of the bytes in the game, and a child hears only the lessons they reach. The service worker keeps the files of the game, and keeps a lesson the first time it is played. The Offline page keeps all of them when a parent asks. A release plan puts every file in one of three groups, `boot`, `rest` and `voice`, and `tools/build/build-sw.ts` writes it into `sw.js`.

**Pictures are lossless WebP.** Every sprite sheet is written with `cwebp -lossless -z 8`, then read back and compared pixel by pixel, so a sheet that does not match fails the build. The pictures went from 11.4 MiB to 6.4 MiB with no visible difference. A lossy format would be smaller and would soften the hard pixel edges that the art depends on. `tools/lib/webp.ts` is the one place that runs the encoder.

**Sound is packed at the rate it is played at.** The audio engine asks for a 32 kHz context, so `tools/assets/audio.ts` renders and packs at 32 kHz and does not carry samples the context would throw away. Music and ambience are variable-rate MP3, and the sound effects are packed into three sheets. Together they went from 5.1 MiB to 3.5 MiB.

**Phaser is a file of its own.** `vite.config.ts` puts Phaser in the chunk `phaser-<hash>.js` (1.37 MB, 357 kB compressed). It only changes when Phaser does, and a new release borrows it from the older one because its name carries the hash. The code of the game is the other chunk (1.13 MB, 383 kB compressed), and what a visitor rarely needs is loaded when asked for: the notices on the About page, the reading computer, the memory table and the abacus, and each map with its sprites.

**The voice stays at a middle quality.** The clips are 24 kHz mono MP3 at VBR quality 5. In a trial the sentences alone went from 11.2 MiB at quality 5 to 8.7 MiB at quality 7, and the words and letters would shrink by about the same share. Quality 7 has not been adopted. The check that proves the clips are as understandable as their masters (`tools/voice/verify.py`) takes hours to run again, and nobody has listened to the result, so the cost in the quiet sounds (`s`, `f`, `th`) that a child learns letters from is not known.

## Ideas that are not done

These are guesses until they are measured.

- Quality 7 for the spoken lessons, once a person has listened to a sample and `verify.py` agrees. It would save about a fifth of them.
- A custom Phaser build without the parts the game never calls. Phaser 4 exports only its prebuilt bundle, so this means building its source with a list of what to leave out.
- Opus for the voice. From codec comparisons it should be about half the size at the same clarity, but browsers differ in the containers they play, and a fallback would store every clip twice.

## Making the assets again

A fresh checkout does not need to. The generated files in `public/assets` are committed, and the build only reads them. To change one, install the encoders (`brew install webp ffmpeg lame`, or `apt-get install webp ffmpeg lame`) and follow "Rebuild assets" in [`CONTRIBUTING.md`](../CONTRIBUTING.md). The voice has a Python setup of its own in `tools/voice/README.md`.
