"""What a group of letters sounds like (sh, ow, ar, ing), made by cutting the sound out of words the model speaks well, as `sounds.py` does for a letter.

A group is one touch of a tile in the reading computer, and the sound is the one a child is taught for it. The model says a lone sound badly, so each
is cut out of a word, and the listeners judge the cut. There are four shapes, by where the sound sits in a word and by how the model says it:

- breath: a consonant group that starts a word (sh, ch, th). It is the sound and a breath of the vowel after it, as a letter's is.
- end: a vowel that a word can end on (the oo of moo, the ow of cow, the oy of boy, the aw of saw, the ar of car, the or of for, the er of her,
  the air of hair). It is cut from where the vowel begins to where the word ends. Nothing follows it to bend it, and the glide or the r in it is
  kept, which a cut from the middle of the word would lose.
- middle: a vowel that no word ends on (the oo of book). It is cut from the middle of a word and made longer, as the vowels of the letters are.
- coda: a sound that ends a word (the ng of ring, the nk of pink, the ing of sing), cut from where the model says it begins to where the word ends.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np

import dsp
import sounds
from judge import shape_of
from speak import SAMPLE_RATE, Kokoro


@dataclass(frozen=True)
class Group:
    """One group's sound: what it is in the model's alphabet, the shape it is cut in, the words it is cut from, and what the sound listener may write for it."""

    phonemes: str
    shape: str
    #: The words the sound is cut from, as the model is given them, and the ways the word listener may write each. The sound has to be in the word once.
    carriers: tuple[tuple[str, frozenset[str]], ...] = ()
    #: What the sound listener may write for the cut, as `shape_of` gives it: consonants and a `V` for a vowel of any kind.
    writes: frozenset[str] = frozenset({"V"})
    #: For a breath, the vowel the sound is said before and how much of it is kept.
    vowel: str = "ʌ"
    breath: float = 0.1


def words(*written: str) -> frozenset[str]:
    return frozenset(written)


def carriers(*pairs: tuple[str, frozenset[str]]) -> tuple[tuple[str, frozenset[str]], ...]:
    return pairs


# The keys are the group sounds of `src/content/reading/sounds.ts`, and a test holds the two lists together.
GROUPS: dict[str, Group] = {
    "sh": Group("ʃ", "breath", writes=words("ʃ", "ʃV")),
    "ch": Group("ʧ", "breath", writes=words("ʧ", "ʧV")),
    # The sound listener cannot tell the soft sound of th from an f and an s, so it is told from the voiced one, and from the s, by the hum under it.
    "th": Group("θ", "breath", writes=words("θ", "θV", "f", "fV", "s", "sV")),
    "oo": Group(
        "u", "end", carriers(("mˈu", words("moo")), ("tˈu", words("two", "to", "too")), ("zˈu", words("zoo")), ("hˈu", words("who")), ("blˈu", words("blue", "blew"))),
    ),
    "uu": Group("ʊ", "middle", carriers(("bˈʊk", words("book")), ("lˈʊk", words("look")), ("ɡˈʊd", words("good")), ("fˈʊt", words("foot")))),
    "ow": Group(
        "W", "end", carriers(("kˈW", words("cow")), ("nˈW", words("now")), ("hˈW", words("how")), ("wˈW", words("wow")), ("bˈW", words("bow"))), words("V", "Vw", "wV"),
    ),
    "oy": Group("Y", "end", carriers(("bˈY", words("boy")), ("tˈY", words("toy")), ("ʤˈY", words("joy")), ("sˈY", words("soy"))), words("V", "Vj", "jV")),
    "aw": Group(
        "ɔ", "end",
        carriers(("sˈɔ", words("saw")), ("pˈɔ", words("paw")), ("lˈɔ", words("law")), ("ɹˈɔ", words("raw")), ("ʤˈɔ", words("jaw")), ("klˈɔ", words("claw")), ("dɹˈɔ", words("draw"))),
    ),
    "ar": Group(
        "ɑɹ", "end", carriers(("kˈɑɹ", words("car")), ("fˈɑɹ", words("far")), ("bˈɑɹ", words("bar")), ("ʤˈɑɹ", words("jar")), ("stˈɑɹ", words("star"))), words("V", "Vɹ"),
    ),
    "or": Group(
        "ɔɹ", "end",
        carriers(("fˈɔɹ", words("for", "four")), ("mˈɔɹ", words("more")), ("dˈɔɹ", words("door")), ("stˈɔɹ", words("store")), ("ʃˈɔɹ", words("shore"))), words("V", "Vɹ"),
    ),
    "er": Group(
        "ɜɹ", "end",
        carriers(("hˈɜɹ", words("her")), ("fˈɜɹ", words("fur")), ("sˈɜɹ", words("sir")), ("stˈɜɹ", words("stir")), ("bˈɜɹ", words("burr")), ("pˈɜɹ", words("purr"))), words("V", "Vɹ"),
    ),
    "air": Group(
        "ɛɹ", "end",
        carriers(("hˈɛɹ", words("hair")), ("fˈɛɹ", words("fair", "fare")), ("pˈɛɹ", words("pair", "pear", "pare")), ("bˈɛɹ", words("bear", "bare")), ("ʃˈɛɹ", words("share"))), words("V", "Vɹ"),
    ),
    "ng": Group("ŋ", "coda", carriers(("sˈɪŋ", words("sing")), ("ɹˈɪŋ", words("ring")), ("kˈɪŋ", words("king")), ("sˈɔŋ", words("song"))), words("ŋ", "n")),
    "ing": Group("ɪŋ", "coda", carriers(("sˈɪŋ", words("sing")), ("ɹˈɪŋ", words("ring")), ("kˈɪŋ", words("king")), ("wˈɪŋ", words("wing"))), words("Vŋ", "Vn")),
    "nk": Group(
        "ŋk", "coda", carriers(("pˈɪŋk", words("pink")), ("sˈɪŋk", words("sink")), ("bˈæŋk", words("bank")), ("θˈɪŋk", words("think"))), words("ŋk", "nk", "ŋVk", "nVk"),
    ),
}

# How fast each shape is spoken. A vowel at the end of a word was spoken slowly at first, so that its glide would have time to be heard, and the model
# rattles at the end of a word it is made to say slowly: in the takes of ow and oy at half speed more than half of the voice was at 80 Hz. At its own
# speed it does that in about one take in ten, and the glide is there, since the model gives a diphthong a quarter of a second.
SPEEDS = {"breath": (0.7, 0.85), "end": (1.0, 0.9), "middle": (0.55, 0.7), "coda": (0.55, 0.7)}
# The hum under the hiss of a consonant group, as (at least, at most), measured as `sounds.hum` measures it on the sound without its breath. In the model's own
# takes `sh` is at -31 to -27, `ch` at -26 to -22 and `th` at -10 to -9. An `s` is at -26 to -18, an `f` at -16 to -9 and a voiced sound is above 3. So `th` has
# more under it than an `s` has and none of the hum of a voice, and the listener is left to tell it from an `f`, which nothing here can.
HUM: dict[str, tuple[float | None, float | None]] = {"sh": (None, -8.0), "ch": (None, -8.0), "th": (-14.0, -3.0)}


def hum_ok(key: str, lone: np.ndarray) -> bool:
    low, high = HUM.get(key, (None, None))
    level = sounds.hum(lone)
    return (low is None or level >= low) and (high is None or level <= high)


def understood(key: str, heard: str) -> bool:
    """Whether what the sound listener wrote for a cut is the sound."""
    return shape_of(heard) in GROUPS[key].writes


def cuts(kokoro: Kokoro, key: str, round: int) -> Iterator[sounds.Cut]:
    """Every way of making this group's sound in this round: the words it is cut from, the speeds, and four noises and styles. One at a time, since each is heard."""
    group = GROUPS[key]
    ph = group.phonemes
    for seed, style in sounds.ROUNDS[round]:
        for speed in SPEEDS[group.shape]:
            if group.shape == "breath":
                ps = ph + "ˈ" + group.vowel
                spoken = kokoro.say(ps, speed, seed, style)
                start, end = sounds.span(spoken, 0, len(ph))
                yield sounds.Cut(sounds.Way(ps, speed, style, seed), sounds.piece(spoken.audio, start, end + group.breath), lone=sounds.piece(spoken.audio, start, end))
                continue
            for template, written in group.carriers:
                for drawn in ("", "ː") if group.shape in ("end", "middle") else ("",):
                    ps = template.replace(ph, ph + drawn)
                    spoken = kokoro.say(ps, speed, seed, style)
                    marks = spoken.starts()
                    if group.shape == "coda":
                        at = len(ps) - len(ph)
                        start, end = sounds.span(spoken, at, len(ph))
                        audio = sounds.piece(spoken.audio, start, end)
                    elif group.shape == "end":
                        start, _ = sounds.span(spoken, ps.index(ph), len(ph + drawn))
                        audio = dsp.trim_speech(sounds.piece(spoken.audio, start, marks[-1][1]), vowel_first=True)
                    else:
                        start, end = sounds.span(spoken, ps.index(ph), len(ph + drawn))
                        audio = sounds.lengthen(sounds.middle(sounds.piece(spoken.audio, start, end), sounds.VOWEL_KEEP), sounds.VOWEL_SECONDS)
                    if len(audio) < 0.06 * SAMPLE_RATE:
                        continue
                    yield sounds.Cut(sounds.Way(ps, speed, style, seed), audio, spoken.audio, written)


def recipe() -> dict:
    """Everything that decides how a group's sound is made, so that changing any of it makes the sounds again."""
    return {
        "groups": {
            key: [group.phonemes, group.shape, [[template, sorted(written)] for template, written in group.carriers], sorted(group.writes), group.vowel, group.breath]
            for key, group in GROUPS.items()
        },
        "speeds": SPEEDS, "hum": HUM, "rounds": sounds.ROUNDS, "keep": sounds.VOWEL_KEEP, "seconds": sounds.VOWEL_SECONDS,
        "fade": [sounds.RISE, sounds.FALL],
    }
