"""What kind of sound a line begins and ends with, read from the phonemes the model is given, in its own alphabet.

A line that begins with a vowel, a burst or a hiss begins loud, since each of them starts at once, and a line that ends in a burst or a hiss
has something after its voice that is meant. Anything else begins and ends softly, or with voice, and noise after that is not meant.
"""

from __future__ import annotations

VOWELS = set("iuɑɔəɛɪʊʌæAIOWYoeaɜɐɒ")
BURSTS = set("ptkbdɡgʧʤ")
HISSES = set("fvsszʃʒθðhx")
# A stop that is breathed and not voiced is shut in silence. A voiced stop (b, d, g) is shut with a hum, which is sound and not a gap.
SILENT_STOPS = set("ptkʧ")


def first_sound(phonemes: str) -> str:
    return next((ch for ch in phonemes if ch not in "ˈˌ \"'"), "")


def last_sound(phonemes: str) -> str:
    return next((ch for ch in reversed(phonemes) if ch.isalpha()), "")


def opens_loud(phonemes: str) -> bool:
    return first_sound(phonemes) in VOWELS | BURSTS | HISSES


def ends_with_voice(phonemes: str) -> bool:
    return last_sound(phonemes) not in BURSTS | HISSES


def count_sounds(phonemes: str) -> int:
    """How many sounds the model is given, which is how long a word is to say: its letters in the model's alphabet, without the marks of stress and length."""
    return sum(1 for ch in phonemes if ch.isalpha() and ch != "ː")
