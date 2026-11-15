"""Cutting the words of a list out of one breath: where to cut, and what to put between the words so that they can be cut.

Spoken in a list, the words run almost into one another, and the model says only roughly where one ends and the next begins. Cutting
halfway between those two marks leaves the tail of one word on the front of the next. So each cut is made at the quietest place between
the two words. The model shuts a p, t, k or ch in silence, and that is a gap to cut in. Every other join has sound in it, the hum of a b, d
or g, the tail of a hiss, or the voice itself, so between two words that would run together the model is given a word of no use to us that
is shut in silence at both ends, and the cut is made in that.
"""

from __future__ import annotations

import random

import numpy as np

from phones import SILENT_STOPS, first_sound, last_sound

# How much of a list's own silence is looked at around the model's marks, in seconds, when a cut is looked for.
REACH = 0.03
# How much quieter than the quietest place a frame may be and still count as part of the gap, in dB.
WITHIN = 6.0
# How much is kept before the first word and after the last, which have no neighbour to be cut from.
BEFORE_FIRST = 0.2
AFTER_LAST = 0.3


def flows(left: str, right: str) -> bool:
    """
    Whether the word on the right runs into the word on the left, with no silence between them to cut in. The model shuts a p, t, k or
    ch in silence, so a join with one of those on either side is a gap. Every other join has sound in it: the hum of a b, d or g, the
    tail of a hiss, or the voice itself.
    """
    return last_sound(left) not in SILENT_STOPS and first_sound(right) not in SILENT_STOPS


def with_carriers(order: list[str], phonemes: dict[str, str], carriers: list[str], rng: random.Random) -> list[tuple[str | None, str]]:
    """
    The order as the model is given it, as (id, phonemes), with a carrier between two words that would run together and one at the end, so that
    the model never ends on a word that is kept. A carrier is a word that is shut in silence at both ends, and its id is none: it is thrown away.
    """
    items: list[tuple[str | None, str]] = []
    for i, key in enumerate(order):
        if i and flows(phonemes[order[i - 1]], phonemes[key]):
            items.append((None, rng.choice(carriers)))
        items.append((key, phonemes[key]))
    items.append((None, rng.choice(carriers)))
    return items


def quietest(envelope: np.ndarray, step: float, low: float, high: float) -> float:
    """
    The middle of the longest stretch of the quietest sound between two times, in seconds. A stretch is the frames within `WITHIN` of the quietest
    one, so a gap that is a little deeper but narrow is not chosen over a wide one that is nearly as quiet. The envelope is in steps of `step` seconds.
    """
    first, last = max(0, int(low / step)), min(len(envelope), int(high / step) + 1)
    if last - first < 2:
        return (low + high) / 2
    window = envelope[first:last]
    quiet = np.flatnonzero(window <= window.min() + WITHIN)
    runs = np.split(quiet, np.flatnonzero(np.diff(quiet) > 1) + 1)
    run = max(runs, key=len)
    return (first + (run[0] + run[-1]) / 2) * step


def cut_marks(marks: list[tuple[float, float]], envelope: np.ndarray, step: float, length: float) -> list[tuple[float, float]]:
    """
    Where to cut each word out of the breath, as (from, to) in seconds. `marks` are the times the model says each word begins and ends,
    and `length` is how long the breath is. Between two words the cut is at the quietest place around the join.
    """
    cuts: list[tuple[float, float]] = []
    for i, (start, end) in enumerate(marks):
        low = quietest(envelope, step, marks[i - 1][1] - REACH, start + REACH) if i > 0 else max(0.0, start - BEFORE_FIRST)
        high = quietest(envelope, step, end - REACH, marks[i + 1][0] + REACH) if i + 1 < len(marks) else min(length, end + AFTER_LAST)
        cuts.append((low, high))
    return cuts
