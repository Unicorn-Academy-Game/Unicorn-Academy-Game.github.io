"""When each word of a recorded sentence begins and ends, from the model's own timing of what it was asked to say.

The model gives every character of the phonemes it is handed a length of its own before it speaks, and the audio is built from those lengths,
so the time of a word in the audio is the sum of the lengths before it. This is exact for the take that was spoken, which no recogniser's
word times are, and the game uses it to light each word as the voice reaches it. A recogniser is used to check it afterwards (`verify.py`).
"""

from __future__ import annotations

PUNCTUATION = ".,!?;:"


def word_spans(phonemes: str, marks: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """
    Where each word of a phoneme string begins and ends, in seconds, given where each character of the string begins and ends.
    A word ends where its last sound ends, and not where the pause that follows it ends, so a comma is not part of the word before it.
    """
    spans: list[tuple[float, float]] = []
    at = 0
    for part in phonemes.split(" "):
        letters = part.rstrip(PUNCTUATION)
        if letters:
            spans.append((marks[at][0], marks[at + len(letters) - 1][1]))
        at += len(part) + 1
    return spans


def in_clip(spans: list[tuple[float, float]], lead: float, seconds: float) -> list[list[float]]:
    """The spans as they are in a clip that starts `lead` seconds into the audio they were measured in and lasts `seconds`, to a thousandth of a second."""
    return [[round(min(max(start - lead, 0.0), seconds), 3), round(min(max(end - lead, 0.0), seconds), 3)] for start, end in spans]
