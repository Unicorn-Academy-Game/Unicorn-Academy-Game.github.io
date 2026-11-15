"""Clips that are said beside others in a question: cut out of a whole sentence, in the place they are said, and not spoken alone.

A number spoken by itself falls, as the last word of a sentence does, and a question joined from such clips falls after every word: it
is a list. The same words cut out of a sentence keep the pitch and the length they have there, and so the pieces of a question that are
laid end to end are one voice saying one sentence. A line in `lines.json` names the sentence it is cut from as its `frame`, with its words
in square brackets: `What is [thirty-four] plus five?`

The sentence is spoken whole, and each piece is cut out at the quietest place between its words and its neighbours' (`cuts.py`). A piece
that starts the sentence is trimmed at the front and one that ends it at the back, and the cuts in the middle are left where they fall,
with the half of the quiet on each side that belongs to that join, so that the pieces fit together as they did in the sentence.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

import cuts
import dsp
from dsp import SAMPLE_RATE
from times import PUNCTUATION

# The loudness of the loudest 400 ms of the sentence a piece is cut from, in LUFS, which is what `PIECE_LUFS` in `src/shared/audio.ts` is. Every
# piece is made at this level, and the packer turns every piece up by the same amount, so a word keeps the level it was spoken at.
SENTENCE_LUFS = -16.0
# The highest a sample may be in the master, as a share of full scale.
HEADROOM = 0.98
# How far under its sentence a piece may be, in LU, before it is turned up to that. A sentence falls away at its end as speech does, and the model lets
# it fall further than a speaker would, so the last word of a question, which is the number a child is asked to find, comes out as much as 12 LU under
# the start of it. A short word also reads low on the meter, which measures 400 ms and pads what is shorter with quiet.
MOST_UNDER = 6.0
# How finely the sound is read for the quiet between two words, in seconds.
STEP = 0.0025
# The rise at the front of a piece and the fall at the back, in seconds. Short, since at a join one piece falls to nothing as the next rises from it.
EDGE = 0.003

FRAME = re.compile(r"^(?P<before>[^\[\]]*)\[(?P<piece>[^\[\]]+)\](?P<after>[^\[\]]*)$")


@dataclass(frozen=True)
class Frame:
    """The sentence a clip is cut from, in three parts: the words before the piece, the piece, and the words after it."""

    before: str
    piece: str
    after: str

    @property
    def sentence(self) -> str:
        return " ".join(part for part in (self.before, self.piece, self.after) if part)

    @property
    def opens(self) -> bool:
        """Whether the piece starts the sentence."""
        return not self.before

    @property
    def closes(self) -> bool:
        """Whether the piece ends the sentence."""
        return not self.after


def parse(frame: str) -> Frame:
    """A sentence with one piece in square brackets. The marks after the piece, a question mark at the end, belong to it."""
    found = FRAME.match(frame)
    if not found:
        raise ValueError(f"{frame!r} is not a sentence with one piece of it in square brackets")
    before, piece, after = (part.strip() for part in found.group("before", "piece", "after"))
    if after and not re.search(r"\w", after):
        piece, after = piece + after, ""
    return Frame(before, piece, after)


@dataclass(frozen=True)
class Spoken:
    """The sentence as the model is given it, and where the piece is in it, counted in words."""

    phonemes: str
    piece: str
    first: int
    last: int


def phonemes_of(frame: Frame, phonemize: Callable[[str], str]) -> Spoken:
    """The phonemes of the whole sentence, from the phonemes of its three parts, and which words of them are the piece."""
    parts = [(role, phonemize(text)) for role, text in (("before", frame.before), ("piece", frame.piece), ("after", frame.after)) if text]
    at = 0
    piece, first, last = "", 0, 0
    for role, phonemes in parts:
        count = len([word for word in phonemes.split(" ") if word.rstrip(PUNCTUATION)])
        if role == "piece":
            piece, first, last = phonemes, at, at + count - 1
        at += count
    return Spoken(" ".join(phonemes for _, phonemes in parts), piece, first, last)


def level(audio: np.ndarray) -> tuple[np.ndarray, float]:
    """The sentence set to `SENTENCE_LUFS`, and by how many dB it was turned. A sentence whose peak would pass the headroom is turned less."""
    gain = SENTENCE_LUFS - dsp.momentary_loudness(audio)
    top = dsp.peak(audio)
    if top > 0:
        gain = min(gain, float(dsp.db(HEADROOM / top)))
    return audio * 10 ** (gain / 20), float(gain)


def lifted(piece: np.ndarray) -> tuple[np.ndarray, float]:
    """The piece, turned up by as much as it is more than `MOST_UNDER` LU under the level of its sentence, and by no more than the headroom allows, and by how many dB."""
    lift = max(0.0, SENTENCE_LUFS - dsp.momentary_loudness(piece) - MOST_UNDER)
    top = dsp.peak(piece)
    if top > 0:
        lift = min(lift, float(dsp.db(HEADROOM / top)))
    return piece * 10 ** (lift / 20), lift


def piece_of(audio: np.ndarray, spans: list[tuple[float, float]], first: int, last: int) -> np.ndarray:
    """The words from `first` to `last` of the sentence, cut at the quietest place between each and its neighbour. `spans` are the times of every word."""
    where = cuts.cut_marks(spans, dsp.envelope(audio, STEP), STEP, len(audio) / SAMPLE_RATE)
    return audio[int(where[first][0] * SAMPLE_RATE) : int(where[last][1] * SAMPLE_RATE)]


def trimmed(piece: np.ndarray, frame: Frame) -> np.ndarray:
    """The piece with the quiet cut off where it starts or ends the sentence, which has nothing to join to there, and left alone where it is a join."""
    start, end = dsp.trim_bounds(piece)
    return piece[start if frame.opens else 0 : end if frame.closes else len(piece)]


def edged(piece: np.ndarray) -> np.ndarray:
    """The piece with a click-free rise and fall. The level is not touched: it is the sentence's."""
    return dsp.fade(piece, head=EDGE, tail=EDGE)
