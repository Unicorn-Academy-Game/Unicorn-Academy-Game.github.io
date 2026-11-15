"""Draws the masters as sheets of spectrograms for a person to look through, since looking is the one check that does not need a speaker.

    python tools/voice/review.py                 every clip, grouped
    python tools/voice/review.py 'letter.*'      only these (ids with * as a wildcard, separated by commas)

A voiced sound shows as rows of bright bands that stay level or glide, a hissing sound as a smear high up, and a click as a thin
vertical line. A clip that starts or ends with a bar, or has a stretch of smear in the middle of a vowel, is worth a listen.
The sheets go in `assets/source/_scratch/voice-review`, which is not kept.
"""

from __future__ import annotations

import fnmatch
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import soundfile as sf  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MASTERS = ROOT / "assets/source/voice"
OUT = ROOT / "assets/source/_scratch/voice-review"
COLUMNS = 6
PER_SHEET = 30


def main() -> int:
    patterns = [p.strip() for p in sys.argv[1].split(",")] if len(sys.argv) > 1 else ["*"]
    report = json.loads((MASTERS / "report.json").read_text())["clips"] if (MASTERS / "report.json").exists() else {}
    ids = [p.stem for p in sorted(MASTERS.glob("*.wav")) if any(fnmatch.fnmatch(p.stem, pattern) for pattern in patterns)]
    OUT.mkdir(parents=True, exist_ok=True)
    groups: dict[str, list[str]] = {}
    for clip_id in ids:
        groups.setdefault(clip_id.split(".")[0], []).append(clip_id)
    for kind, members in groups.items():
        for page in range(0, len(members), PER_SHEET):
            chunk = members[page : page + PER_SHEET]
            rows = (len(chunk) + COLUMNS - 1) // COLUMNS
            fig, axes = plt.subplots(rows, COLUMNS, figsize=(3.1 * COLUMNS, 1.8 * rows), squeeze=False)
            for ax in axes.flat:
                ax.axis("off")
            for ax, clip_id in zip(axes.flat, chunk):
                audio, rate = sf.read(MASTERS / f"{clip_id}.wav")
                ax.axis("on")
                ax.specgram(audio, NFFT=512, Fs=rate, noverlap=448, cmap="magma", vmin=-110, vmax=-20)
                ax.set_ylim(0, 8000)
                note = report.get(clip_id, {"status": "ok", "heard": ""})
                ax.set_title(f"{clip_id}  {len(audio) / rate:.2f}s  {'' if note['status'] == 'ok' else 'REVIEW '}{note['heard'][:22]!r}", fontsize=7, pad=2)
                ax.tick_params(labelsize=5, length=2)
            fig.tight_layout(pad=0.4)
            name = f"{kind}-{page // PER_SHEET + 1}.png"
            fig.savefig(OUT / name, dpi=90)
            plt.close(fig)
            print(OUT / name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
