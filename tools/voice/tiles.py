"""Does what a child hears when she touches the tiles of a word match what the voice says the word is?

    python tools/voice/tiles.py              check every word of the reading course
    python tools/voice/tiles.py frog snow    say what was found for these words, and check them

A word is cut into tiles, and each tile says a sound. The sounds one after the other are meant to be the word, and the voice says the word
with the phonemes that Misaki gives it, so the two can be set side by side without a model: the tiles of `snow` say `s`, `n` and a long o, and
Misaki gives `snˈO`. A word whose tiles say something else (a vowel that should be long, an `s` that should be a `z`, a `c` that should be
soft) is a word that would teach her a sound that is not in it.

A vowel that is not stressed is said as a short weak sound whatever the letter, so a tile that makes one may be any vowel. Nothing else is
let through, except what is written down in `tiles-ok.json` with the reason, which is for the words where a person has looked and decided
that the tiles are right.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ALLOWED = ROOT / "tools/voice/tiles-ok.json"
OVERRIDES = ROOT / "tools/voice/overrides.json"

# What each sound a tile can say is, in Misaki's alphabet, as the ways it may be heard in a word. The first is the one the sound clip makes.
# Misaki writes the diphthongs as one capital letter: A eɪ, I aɪ, O oʊ, W aʊ, Y ɔɪ.
PHONES: dict[str, tuple[str, ...]] = {
    "a": ("æ",), "b": ("b",), "c": ("k",), "d": ("d",), "e": ("ɛ",), "f": ("f",), "g": ("ɡ",), "h": ("h",), "i": ("ɪ",), "j": ("ʤ",), "k": ("k",), "l": ("l",),
    "m": ("m",), "n": ("n",), "o": ("ɑ", "ɔ"), "p": ("p",), "q": ("kw",), "r": ("ɹ",), "s": ("s",), "t": ("t",), "u": ("ʌ",), "v": ("v",), "w": ("w",), "x": ("ks",),
    "y": ("j",), "z": ("z",),
    "sh": ("ʃ",), "ch": ("ʧ",), "th": ("θ", "ð"), "ng": ("ŋ",), "nk": ("ŋk",), "oo": ("u",), "uu": ("ʊ",), "ow": ("W",), "oy": ("Y",), "aw": ("ɔ", "ɑ"),
    "ar": ("ɑɹ",), "or": ("ɔɹ",), "er": ("ɜɹ", "əɹ"), "air": ("ɛɹ",), "ing": ("ɪŋ",),
    "ay": ("A",), "ee": ("i",), "eye": ("I",), "oh": ("O",), "yoo": ("ju", "u"),
}
# The sounds that have a vowel in them, so the tiles that make them are the ones that can be unstressed.
VOWEL_SOUNDS = {"a", "e", "i", "o", "u", "oo", "uu", "ow", "oy", "aw", "ar", "or", "er", "air", "ing", "ay", "ee", "eye", "oh", "yoo"}
VOWELS = "æɛɪɑɔʌʊəiuAIOWYɜ"
# What the voice may say in place of a vowel that is not stressed: a short weak vowel, with or without an r after it.
WEAK = f"[{VOWELS}]ɹ?"
# What Misaki writes that is the same sound as another, so that the two are one for the comparison.
NORMAL = str.maketrans({"ᵻ": "ɪ", "ᵊ": "ə", "T": "t", "ɾ": "t", "g": "ɡ", "ː": ""})


def normal(phonemes: str) -> str:
    """The phonemes of a word as they are compared: no marks of stress, and the variants of one sound written one way."""
    return re.sub("[ˈˌ]", "", phonemes).translate(NORMAL).replace("ɚ", "əɹ").replace("ɝ", "ɜɹ")


def stressed_syllable(phonemes: str) -> int | None:
    """Which syllable has the main stress, counted from 0 by the vowels before the mark, or None when the voice put no stress on the word."""
    at = phonemes.find("ˈ")
    return None if at < 0 else sum(ch in VOWELS for ch in normal(phonemes[:at]))


@dataclass(frozen=True)
class Tile:
    letters: str
    sound: str | None
    #: The first tile of a later part of a longer word.
    gap: bool = False


def ways(tile: Tile, stressed: bool) -> list[str]:
    """What the voice may say for a tile. A syllable that is not stressed may hold any weak vowel, and `le` at the end of a word is said `əl`."""
    assert tile.sound is not None
    found = [re.escape(way) for way in PHONES[tile.sound]]
    if tile.letters == "le":
        found.append("əl")
    if tile.sound in VOWEL_SOUNDS and not stressed:
        found.append(f"[{VOWELS}]ŋ" if tile.sound == "ing" else WEAK)
    return found


def pattern(tiles: list[Tile], phonemes: str) -> str:
    """The regular expression that the phonemes of a word have to match for the tiles to say it, tile by tile."""
    stress = stressed_syllable(phonemes)
    sounding = [tile for tile in tiles if tile.sound is not None]
    parts: list[str] = []
    syllable = -1
    for i, tile in enumerate(sounding):
        assert tile.sound is not None
        if tile.sound in VOWEL_SOUNDS:
            syllable += 1
        stressed = stress is not None and syllable == stress
        found = ways(tile, stressed)
        before = sounding[i - 1] if i > 0 else None
        after = sounding[i + 1] if i + 1 < len(sounding) else None
        doubled = tile.gap and before is not None and before.letters == tile.letters and before.sound == tile.sound
        syllabic = tile.sound in VOWEL_SOUNDS and not stressed and after is not None and i + 2 == len(sounding) and after.sound in ("n", "l", "m")
        if tile.sound == "n" and after is not None and after.sound in ("c", "k", "g"):
            found.append("ŋ")
        one = "(?:" + "|".join(found) + ")"
        parts.append(one + "?" if doubled or syllabic else one)
    return "^" + "".join(parts) + "$"


def says(tiles: list[Tile], phonemes: str) -> bool:
    return re.match(pattern(tiles, phonemes), normal(phonemes)) is not None


def heard(tiles: list[Tile]) -> str:
    """What the tiles say one after the other, as the first way of hearing each."""
    return "".join(PHONES[tile.sound][0] for tile in tiles if tile.sound is not None)


def course() -> dict:
    out = subprocess.run(["pnpm", "exec", "tsx", "tools/voice/export-course.ts"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def main() -> int:
    from speak import Kokoro

    wanted = set(sys.argv[1:])
    everything = [w for w in course()["words"] if not w["tricky"]]
    allowed: dict[str, str] = json.loads(ALLOWED.read_text()) if ALLOWED.exists() else {}
    overrides: dict[str, dict] = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
    kokoro = Kokoro()
    wrong: list[str] = []
    needless: list[str] = []
    for word in everything:
        tiles = [Tile(t["letters"], t["sound"], t["gap"]) for t in word["tiles"]]
        # The clip is made from the phonemes the generator is given, so a pronunciation that was put right by hand is the one that is checked.
        phonemes = overrides.get(f"word.{word['id']}", {}).get("phonemes", "").rstrip(".") or kokoro.phonemes(word["id"])
        fine = says(tiles, phonemes)
        if word["id"] in wanted:
            print(f"{word['id']:<12} tiles {' '.join(t.letters + ':' + str(t.sound) for t in tiles)}  say {heard(tiles)}  voice {phonemes}  {'fine' if fine else 'DIFFERENT'}")
        if not fine and word["id"] not in allowed:
            wrong.append(f"stage {word['stage']:>2}  {word['id']:<12} tiles say {heard(tiles):<14} voice says {phonemes:<16} ({' '.join(t.letters + ':' + str(t.sound) for t in tiles)})")
        if fine and word["id"] in allowed:
            needless.append(word["id"])
    unknown = sorted(set(allowed) - {w["id"] for w in everything})
    for line in wrong:
        print(line)
    for word in needless:
        print(f"{word} is in tiles-ok.json and the voice says it as its tiles do, so it does not need to be")
    for word in unknown:
        print(f"{word} is in tiles-ok.json and is not a word of the course to sound out")
    print(f"{len(everything)} words to sound out, {len(wrong)} that the voice says differently from their tiles, {len(needless) + len(unknown)} in tiles-ok.json that do not belong")
    return 1 if wrong or needless or unknown else 0


if __name__ == "__main__":
    sys.exit(main())
