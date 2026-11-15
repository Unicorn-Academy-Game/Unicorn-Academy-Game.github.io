"""Listens to the maths game's questions as the game says them, from the files the game plays, and says how they sound.

    pnpm exec tsx tools/voice/export-questions.ts /tmp/questions.json 12
    python tools/voice/questions.py /tmp/questions.json --assets public/assets --sample 80 --json /tmp/now.json --wav /tmp/now

A question is said by several clips laid end to end as `VoiceBank` lays them: each begins when the one before it ends, and after a clip that does not
run on there is a quiet of `GAP` seconds. `export-questions.ts` writes the quiet that follows each clip, so this does not have its own idea of it.

For each question it reports how long it is, how much of it is dead air (a stretch of quiet inside it that a speaker would not leave), how natural
the predictor finds it (`mos.py`), and how many words of it the word listener got wrong. Those are measures, and not ears: the same questions from
two builds of the voice (`--assets`) say which sounds more like speech, and a question far below the rest is the one to listen to.
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dsp import SAMPLE_RATE  # noqa: E402

# A quiet inside a question counts as dead air when it is at least this long, in seconds, and is more than this far under the loudest sound, in dB.
LONGEST_BREATH = 0.08
QUIET_DB = -45.0


def decode(path: Path) -> np.ndarray:
    """A file of the voice as mono floats at the rate the voice is made at."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def lay_out(clips: list[np.ndarray], after: list[float]) -> np.ndarray:
    """The clips as the game plays them: each one when the one before it ends, and `after[i]` seconds of quiet after the i-th."""
    parts: list[np.ndarray] = []
    for clip, quiet in zip(clips, after):
        parts.append(clip)
        parts.append(np.zeros(round(quiet * SAMPLE_RATE), dtype=np.float32))
    return np.concatenate(parts)


def dead_air(audio: np.ndarray) -> float:
    """Seconds of quiet between the first sound and the last that are at least `LONGEST_BREATH` long. The lead-in and the tail are not counted."""
    hop = round(0.01 * SAMPLE_RATE)
    frames = len(audio) // hop
    if frames == 0:
        return 0.0
    rms = np.sqrt(np.mean(audio[: frames * hop].reshape(frames, hop) ** 2, axis=1) + 1e-12)
    loud = np.flatnonzero(20 * np.log10(rms / rms.max()) > QUIET_DB)
    if len(loud) == 0:
        return 0.0
    quiet = np.diff(loud) - 1
    return float(sum(run for run in quiet if run * 0.01 >= LONGEST_BREATH) * 0.01)


def sample_of(questions: list[dict], count: int, seed: int) -> list[dict]:
    """`count` questions, the same number from each strand and level so that a kind with many questions does not crowd out one with few, and the same ones every time."""
    if count >= len(questions):
        return questions
    cells: dict[tuple[str, int], list[dict]] = {}
    for question in questions:
        cells.setdefault((question["strand"], question["level"]), []).append(question)
    rng = random.Random(seed)
    for cell in cells.values():
        rng.shuffle(cell)
    picked: list[dict] = []
    while len(picked) < count and any(cells.values()):
        for cell in cells.values():
            if cell and len(picked) < count:
                picked.append(cell.pop())
    return picked


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("questions", type=Path, help="what export-questions.ts wrote")
    parser.add_argument("--assets", type=Path, default=Path("public/assets"), help="the directory of the manifest and the speech directory the game plays")
    parser.add_argument("--sample", type=int, default=60, help="how many questions to listen to")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--json", type=Path, help="write what was measured")
    parser.add_argument("--wav", type=Path, help="write each question as it is played")
    parser.add_argument("--no-words", action="store_true", help="skip the word listener, which is the slow part")
    args = parser.parse_args()

    from judge import Judge, word_misses
    from mos import utmos

    clips = json.loads((args.assets / "manifest.json").read_text())["audio"]["speech"]["clips"]
    questions = sample_of(json.loads(args.questions.read_text())["questions"], args.sample, args.seed)
    judge = None if args.no_words else Judge()
    cache: dict[str, np.ndarray] = {}

    def load(clip_id: str) -> np.ndarray:
        if clip_id not in cache:
            if clip_id not in clips:
                raise SystemExit(f"the manifest in {args.assets} has no clip {clip_id}")
            cache[clip_id] = decode(args.assets / clips[clip_id]["file"])
        return cache[clip_id]

    rows = []
    for i, question in enumerate(questions):
        audio = lay_out([load(clip_id) for clip_id in question["say"]], question["after"])
        row = {
            "strand": question["strand"], "level": question["level"], "prompt": question["prompt"], "say": question["say"],
            "seconds": round(len(audio) / SAMPLE_RATE, 2), "deadAir": round(dead_air(audio), 2), "utmos": round(utmos(audio), 3),
        }
        if judge:
            row["heard"] = judge.words(audio)
            row["misses"] = word_misses(row["heard"], question["prompt"])
        rows.append(row)
        if args.wav:
            args.wav.mkdir(parents=True, exist_ok=True)
            sf.write(args.wav / f"{i:03d}-{question['strand']}-{question['level']}.wav", audio, SAMPLE_RATE, subtype="PCM_16")
        print(f"  {i + 1:>3}/{len(questions)} {row['utmos']:.2f} mos  {row['deadAir']:.2f}s dead  {row.get('misses', '-')} missed  {question['prompt']}", flush=True)

    def mean(key: str) -> float:
        return statistics.fmean(row[key] for row in rows)

    summary = {"questions": len(rows), "utmos": round(mean("utmos"), 3), "utmosWorst10": round(statistics.fmean(sorted(r["utmos"] for r in rows)[:10]), 3), "deadAir": round(mean("deadAir"), 2), "seconds": round(mean("seconds"), 2)}
    if judge:
        summary |= {"withMisses": sum(1 for r in rows if r["misses"]), "misses": sum(r["misses"] for r in rows)}
    print(json.dumps(summary))
    for row in sorted(rows, key=lambda r: r["utmos"])[:8]:
        print(f"  lowest: {row['utmos']:.2f}  {row['prompt']}  {row['say']}")
    if args.json:
        args.json.write_text(json.dumps({"assets": str(args.assets), "summary": summary, "rows": rows}, indent=1, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
