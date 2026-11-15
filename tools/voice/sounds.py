"""What each letter sounds like, made by cutting the sound out of syllables and words the model speaks well.

The model says a lone sound badly. A `b` by itself comes out with a click in front, an `s` as a word, and a lone vowel is read as another
one. It speaks a syllable or a plain word well, so every sound here is cut out of one, where the model says the sound begins and ends, and
the listeners judge the cut. There are two shapes:

- A vowel is cut out of a plain word (`sat`, `bed`, `sit`, `hot`, `sun`), from its middle, where the consonants on either side have not
  bent it, and made longer without changing it. A take is kept only when the word it came from was understood.
- A consonant is the sound and a breath of the vowel after it, the way a teacher says it: `buh`, `fuh`, `luh`. It is short, because a
  consonant by itself, with no vowel, is not something the model will say so that a listener hears it.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import parselmouth
from parselmouth.praat import call
from scipy.signal import welch

import dsp
from judge import shape_of
from speak import SAMPLE_RATE, Kokoro, Spoken


@dataclass(frozen=True)
class Sound:
    """What a letter sounds like: the sound in the model's alphabet, the shape it is cut in, and for a consonant the vowel it is said before and how much of it is kept."""

    phonemes: str
    shape: str
    vowel: str = "ʌ"
    breath: float = 0.1


# The sound the letter makes at the start of a word, as a child is taught it. `c` and `g` are the hard ones, `q` and `x` are two sounds.
SOUNDS: dict[str, Sound] = {
    "a": Sound("æ", "vowel"), "b": Sound("b", "syllable"), "c": Sound("k", "syllable"), "d": Sound("d", "syllable"), "e": Sound("ɛ", "vowel"),
    "f": Sound("f", "syllable"), "g": Sound("ɡ", "syllable"), "h": Sound("h", "syllable", "ɑ"), "i": Sound("ɪ", "vowel"), "j": Sound("ʤ", "syllable"),
    "k": Sound("k", "syllable"), "l": Sound("l", "syllable"), "m": Sound("m", "syllable"), "n": Sound("n", "syllable"), "o": Sound("ɑ", "vowel"),
    "p": Sound("p", "syllable"), "q": Sound("kw", "syllable"), "r": Sound("ɹ", "syllable"), "s": Sound("s", "syllable"), "t": Sound("t", "syllable", "ɑ", breath=0.08),
    "u": Sound("ʌ", "vowel"), "v": Sound("v", "syllable"), "w": Sound("w", "syllable"), "x": Sound("ks", "syllable"), "y": Sound("j", "syllable", breath=0.08),
    "z": Sound("z", "syllable"),
}

# A vowel is cut from one of these words, which have the vowel in the middle between consonants that do not bend it much, and the words
# the word listener has to hear for the take to be kept. Each is also spoken with the vowel drawn out, which the model does with `ː`.
VOWEL_WORDS: dict[str, list[tuple[str, set[str]]]] = {
    "æ": [("sˈæt", {"sat"}), ("bˈæd", {"bad"}), ("hˈæt", {"hat"}), ("kˈæp", {"cap", "cab"})],
    "ɛ": [("bˈɛd", {"bed"}), ("sˈɛt", {"set"}), ("hˈɛn", {"hen"}), ("pˈɛt", {"pet"})],
    "ɪ": [("sˈɪt", {"sit"}), ("bˈɪd", {"bid"}), ("hˈɪt", {"hit"}), ("pˈɪn", {"pin"}), ("lˈɪd", {"lid"}), ("kˈɪd", {"kid"}), ("tˈɪn", {"tin"})],
    "ɑ": [("hˈɑt", {"hot"}), ("pˈɑt", {"pot"}), ("sˈɑk", {"sock"}), ("tˈɑp", {"top"})],
    "ʌ": [("sˈʌn", {"sun"}), ("bˈʌd", {"bud"}), ("kˈʌp", {"cup"}), ("hˈʌt", {"hut"})],
}
# Where the vowel has to be, in Hz, as (lowest, highest) first formant and (lowest, highest) second, measured the way `dsp.vowel` does. The
# model's plain short i (`sit`) is at about 760 and 2160 and sounds like the `uh` of its `u`, so a child hears `i` and `u` and `a` as one sound, and its
# `ee` (`see`) is at about 500 and 2450. A child has to be taught the short i of `pig`, so the sound is held between the two: brighter than the
# model's short i, and not as high as `ee`, which the course teaches as its own tile.
BETWEEN: dict[str, tuple[tuple[float, float], tuple[float, float]]] = {"ɪ": ((540.0, 690.0), (2220.0, 2500.0))}
# Where the model says the vowel begins and ends, and the share of it that is kept: the middle, where the consonants have not bent it.
VOWEL_KEEP = 0.7
# How long a vowel is made. The model's own are a tenth of a second, and a sound that short is hard to hear.
VOWEL_SECONDS = 0.4
# The most a sound is lengthened, which is as much as Praat's overlap-add allows, and the longer it is stretched the less like speech it gets.
MOST_LENGTHENED = 3.0
# How long a sound takes to rise and to fall, in seconds. A syllable is cut where the vowel is still sounding, so it has to die away over most of
# the breath, or `generate.py` finds it ending loud.
RISE, FALL = 0.01, 0.1
# What the sound listener may write for a consonant, as the consonant and `V` for a vowel after it of any kind.
AFTER = {"", "V"}
# The sound listener writes a `z` as `s`. Whether it is a `z` is the hum's to say.
WRITTEN_AS = {"z": ("z", "s")}
# It also cannot tell `s` from `z`, or `f` from `v`, so these are told apart by the hum that voice puts under the hiss: the
# level of what is below 500 Hz against what is above 2 kHz, in dB, as (at least, at most). In the model's own takes `s` is at -26 to -18,
# `z` at 1 to 4.5, `f` at -16 to -9 and `v` at 12 to 18.
HUM: dict[str, tuple[float | None, float | None]] = {"s": (None, -8.0), "z": (-3.0, None), "f": (None, -6.0), "v": (3.0, None)}


@dataclass(frozen=True)
class Way:
    """One way of making a sound: the syllable or word it is cut from, how fast it is spoken, where along the rows of style, and which noise."""

    carrier: str
    speed: float
    style: int
    seed: int

    def describe(self) -> dict:
        return {"carrier": self.carrier, "speed": self.speed, "style": self.style, "seed": self.seed}


@dataclass
class Cut:
    """A sound as it was cut, and, for a vowel, the whole word it was cut from and what the word listener must write for it to count."""

    way: Way
    audio: np.ndarray
    whole: np.ndarray | None = None
    words: set[str] | None = None
    #: A consonant by itself, without the breath after it, for measuring the hum under it.
    lone: np.ndarray | None = None


# Noise and rows of style to make a sound with. A round has these four, and a later round has the next four, further along the rows.
ROUNDS = [
    [(1, 0), (2, 6), (3, 12), (4, 18)], [(5, 2), (6, 8), (7, 14), (8, 20)], [(9, 4), (10, 10), (11, 16), (12, 22)],
    [(13, 1), (14, 7), (15, 13), (16, 19)], [(17, 3), (18, 9), (19, 15), (20, 21)],
]
SPEEDS = {"vowel": (0.55, 0.7), "syllable": (0.7, 0.85)}


def hum(audio: np.ndarray) -> float:
    """How loud the voice's hum is under a sound, in dB: what is below 500 Hz against what is above 2 kHz."""
    f, power = welch(audio, SAMPLE_RATE, nperseg=min(len(audio), 512))
    low, high = power[(f >= 80) & (f <= 500)].sum(), power[(f >= 2000) & (f <= 8000)].sum()
    return float(10 * np.log10(max(low, 1e-12) / max(high, 1e-12)))


def hummed(letter: str, lone: np.ndarray) -> bool:
    """Whether a consonant has the hum its letter needs, which is none for `s` and `f` and some for `z` and `v`. Others are not asked."""
    low, high = HUM.get(letter, (None, None))
    level = hum(lone)
    return (low is None or level >= low) and (high is None or level <= high)


def understood(letter: str, heard: str) -> bool:
    """Whether what the sound listener wrote for a sound is the sound. A vowel only has to be a vowel, since the five are too alike in a tenth of a second for it."""
    made = SOUNDS[letter]
    shape = shape_of(heard)
    if made.shape == "vowel":
        return "V" in shape
    return shape in {shape_of(written) + after for written in WRITTEN_AS.get(made.phonemes, (made.phonemes,)) for after in AFTER}


def placed(phonemes: str, audio: np.ndarray) -> bool:
    """Whether a vowel is where it has to be (`BETWEEN`). A vowel with no place held for it always is, and so is a clip that has too little voice to measure."""
    held = BETWEEN.get(phonemes)
    found = dsp.vowel(audio) if held else None
    if held is None or found is None:
        return held is None
    (f1_low, f1_high), (f2_low, f2_high) = held
    f1, f2 = found.whole
    return f1_low <= f1 <= f1_high and f2_low <= f2 <= f2_high


def lengthen(audio: np.ndarray, seconds: float) -> np.ndarray:
    """The same sound for longer, by repeating its own periods. A sound that is long enough is left as it is."""
    have = len(audio) / SAMPLE_RATE
    if have >= seconds:
        return audio
    factor = min(MOST_LENGTHENED, seconds / have)
    heard = parselmouth.Sound(audio.astype(np.float64), sampling_frequency=SAMPLE_RATE)
    made = call(heard, "Lengthen (overlap-add)", 100, 500, factor)
    return made.values[0].astype(np.float32)


def span(spoken: Spoken, at: int, size: int) -> tuple[float, float]:
    """Where `size` phonemes that start `at` places along the phonemes the model was given begin and end, in seconds."""
    marks = spoken.starts()
    return marks[at][0], marks[at + size - 1][1]


def piece(audio: np.ndarray, start: float, end: float) -> np.ndarray:
    return audio[int(start * SAMPLE_RATE) : int(end * SAMPLE_RATE)]


def middle(audio: np.ndarray, keep: float) -> np.ndarray:
    """The middle `keep` of a sound, so what the sounds on either side did to its ends is left out."""
    cut = int(len(audio) * (1 - keep) / 2)
    return audio[cut : len(audio) - cut]


def cuts(kokoro: Kokoro, letter: str, round: int) -> list[Cut]:
    """Every way of making this letter's sound in this round: the words or syllable it is cut from, the speeds, and four noises and styles."""
    made = SOUNDS[letter]
    ph = made.phonemes
    found: list[Cut] = []
    for seed, style in ROUNDS[round]:
        for speed in SPEEDS[made.shape]:
            if made.shape == "vowel":
                for template, words in VOWEL_WORDS[ph]:
                    for drawn in ("", "ː"):
                        ps = template.replace(ph, ph + drawn)
                        at = ps.index(ph)
                        spoken = kokoro.say(ps, speed, seed, style)
                        start, end = span(spoken, at, len(ph + drawn))
                        heard = middle(piece(spoken.audio, start, end), VOWEL_KEEP)
                        if len(heard) < 0.03 * SAMPLE_RATE:
                            continue
                        found.append(Cut(Way(ps, speed, style, seed), lengthen(heard, VOWEL_SECONDS), spoken.audio, words))
            else:
                ps = ph + "ˈ" + made.vowel
                spoken = kokoro.say(ps, speed, seed, style)
                start, end = span(spoken, 0, len(ph))
                found.append(Cut(Way(ps, speed, style, seed), piece(spoken.audio, start, end + made.breath), lone=piece(spoken.audio, start, end)))
    return found


def recipe() -> dict:
    """Everything that decides how a sound is made, so that changing any of it makes the sounds again."""
    return {
        "sounds": {letter: [made.phonemes, made.shape, made.vowel, made.breath] for letter, made in SOUNDS.items()},
        "words": {vowel: [[template, sorted(words)] for template, words in found] for vowel, found in VOWEL_WORDS.items()},
        "between": {vowel: [list(low_high) for low_high in held] for vowel, held in BETWEEN.items()}, "keep": VOWEL_KEEP, "seconds": VOWEL_SECONDS, "most": MOST_LENGTHENED, "fade": [RISE, FALL], "after": sorted(AFTER), "writtenAs": WRITTEN_AS, "hum": HUM,
        "rounds": ROUNDS, "speeds": SPEEDS,
    }
