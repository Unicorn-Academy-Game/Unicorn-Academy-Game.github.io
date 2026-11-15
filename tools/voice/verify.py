"""Listens to the clips the way the game plays them: the MP3 files that `pnpm assets:build` made, decoded as a browser decodes them.

    python tools/voice/verify.py                       every clip the manifest names
    python tools/voice/verify.py 'letter.*,word.f*'    only these (ids with * as a wildcard, separated by commas)

The masters were heard when they were made. This is the check that the loudness setting and the encoder left every clip as clear as its
master was, and that none of them is a rattle, which the listeners cannot hear. It uses the two listeners and the rules of `generate.py`, and it exits
with 1 when a clip is not understood or rattles. It also lists the clips that the sound listener wrote a sound before or after the word for, which
is how a puff of air from the word before it in a list is heard. That is for a person to look at, and it does not fail.

A piece of a sentence (`lead.34`, `last.5`) is checked for a rattle and no more. It is heard in the question it is part of, by `questions.py`.
"""

from __future__ import annotations

import fnmatch
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

import dsp
import group_sounds
import sounds
from generate import DEEP_SHARE, same_sound
from judge import SAMPLE_RATE, Judge, accepted, grade, grade_line
from speak import Kokoro

ROOT = Path(__file__).resolve().parents[2]
SHIPPED = ROOT / "public/assets"
REPORT = ROOT / "assets/source/voice/report.json"


def decode(path: Path) -> np.ndarray:
    """The clip as a browser decodes it: mono, at the rate the listeners expect."""
    command = ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"]
    return np.frombuffer(subprocess.run(command, capture_output=True, check=True).stdout, dtype=np.float32)


def main() -> int:
    patterns = [p.strip() for p in sys.argv[1].split(",")] if len(sys.argv) > 1 else ["*"]
    clips = json.loads((SHIPPED / "manifest.json").read_text())["audio"]["speech"]["clips"]
    made = json.loads(REPORT.read_text())["clips"]
    ids = [clip_id for clip_id in sorted(clips) if any(fnmatch.fnmatch(clip_id, pattern) for pattern in patterns)]
    judge = Judge()
    # A sentence is graded by its words, and two words that sound alike are not told apart, which the model's own phonemes say.
    same = same_sound(Kokoro()) if any(clip_id.startswith("line.") for clip_id in ids) else None
    started = time.time()
    failed: list[str] = []
    edged: list[str] = []
    for clip_id in ids:
        audio = decode(SHIPPED / clips[clip_id]["file"])
        deep = dsp.deep_share(audio)
        if deep >= DEEP_SHARE:
            failed.append(clip_id)
            print(f"  {clip_id:<22} {'RATTLE':<14} {deep:.0%} of the voice is under 130 Hz", flush=True)
            continue
        if "sentence" in made[clip_id]:
            # A piece of a sentence is made to be heard in it, beside the pieces it was cut from, and a piece heard alone is not what the game plays. What
            # is held to being understood is the question the pieces make, which `questions.py` listens to.
            print(f"  {clip_id:<22} {'a piece':<14} heard in its question, by questions.py", flush=True)
            continue
        if clip_id.startswith("sound."):
            # A sound is not a word, so only the sound listener hears it, and it has to write the sound that was meant. Its hum was measured when it was made.
            key = clip_id.removeprefix("sound.")
            written = judge.sounds(audio)
            ok = group_sounds.understood(key, written) if key in group_sounds.GROUPS else sounds.understood(key, written)
            if not ok:
                failed.append(clip_id)
            print(f"  {clip_id:<22} {'ok' if ok else 'NOT UNDERSTOOD':<14} heard sounds {written!r}  master heard {made[clip_id]['heardSounds']!r}", flush=True)
            continue
        heard = judge.listen(audio)
        if clip_id.startswith("line."):
            graded = grade_line(heard, made[clip_id]["said"], made[clip_id]["phonemes"], same)
        else:
            graded = grade(heard, made[clip_id]["said"], made[clip_id]["phonemes"], accepted(clip_id))
        if not graded.understood:
            failed.append(clip_id)
        if any(graded.edges):
            edged.append(clip_id)
        print(f"  {clip_id:<22} {'ok' if graded.understood else 'NOT UNDERSTOOD':<14} heard {heard.words!r}  sounds off by {graded.error:.2f}  master heard {made[clip_id]['heard']!r}", flush=True)
    print(f"{len(ids)} clips heard in {time.time() - started:.0f} s, {len(failed)} not understood{': ' + ', '.join(failed) if failed else ''}")
    if edged:
        print(f"{len(edged)} have a sound before or after the word that was not meant, for a person to look at: {', '.join(edged)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
