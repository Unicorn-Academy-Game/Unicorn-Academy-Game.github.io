"""The listeners. One hears words, one hears sounds, and a clip has to be understood by both before it is kept.

They are not ears. They catch a clip that says the wrong thing, runs two sounds together or leaves a letter half spoken.
Whether a clip is pleasant is a question for a person, and the review sheets exist so one can look first.
"""

from __future__ import annotations

import os
import re
import warnings
from collections.abc import Callable

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
from huggingface_hub import snapshot_download  # noqa: E402
from scipy.signal import resample_poly  # noqa: E402

WHISPER = ("Systran/faster-whisper-small.en", "d1d751a5f8271d482d14ca55d9e2deeebbae577f")
PHONES = ("facebook/wav2vec2-lv-60-espeak-cv-ft", "ae45363bf3413b374fecd9dc8bc1df0e24c3b7f4")
SAMPLE_RATE = 24000

_ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def number_words(n: int) -> str:
    if n == 100:
        return "one hundred"
    if n < 20:
        return _ONES[n]
    tens, ones = divmod(n, 10)
    return _TENS[tens] if ones == 0 else f"{_TENS[tens]} {_ONES[ones]}"


def letters_only(text: str) -> str:
    """What a recogniser wrote, as lowercase letters with numbers spelled out, so it can be compared with what was meant."""
    spelled = re.sub(r"\d+", lambda m: f" {number_words(int(m.group()))} " if int(m.group()) <= 100 else m.group(), text.lower())
    return re.sub(r"[^a-z]", "", spelled)


def distance(a: str, b: str) -> int:
    """Edits it takes to turn one string into the other."""
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        row = [i]
        for j, cb in enumerate(b, 1):
            row.append(min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = row
    return previous[-1]


def similarity(a: str, b: str) -> float:
    """1 for the same, down to 0 for nothing in common."""
    longest = max(len(a), len(b))
    return 1.0 if longest == 0 else 1 - distance(a, b) / longest


# The two sides write sounds differently, so both are turned into one small alphabet. Sounds that a child could not tell apart
# in a word, and that the two listeners disagree about all the time, are one letter there.
_DIPHTHONGS = [("eɪ", "A"), ("aɪ", "I"), ("oʊ", "O"), ("əʊ", "O"), ("aʊ", "W"), ("ɔɪ", "Y"), ("oɪ", "Y"), ("dʒ", "ʤ"), ("tʃ", "ʧ")]
_SAME = str.maketrans({"ɪ": "i", "ᵻ": "i", "ɨ": "i", "ʌ": "ə", "ᵊ": "ə", "ɐ": "ə", "ɜ": "ə", "e": "ɛ", "æ": "a", "ɒ": "ɑ", "ɔ": "ɑ", "o": "ɑ", "ʊ": "u", "g": "ɡ", "r": "ɹ", "ɻ": "ɹ", "ɾ": "d", "ʔ": "", "ʰ": ""})


def reduce_sounds(text: str) -> str:
    for long, short in _DIPHTHONGS:
        text = text.replace(long, short)
    text = text.replace("ɚ", "əɹ").replace("ɝ", "əɹ")
    text = re.sub(r"[ˈˌː\s.,!?;:—…‿'\"-]", "", text)
    return text.translate(_SAME)


_VOWEL_SOUNDS = set("aɛiɑəuAIOWY")


def shape_of(sounds: str) -> str:
    """What the sound listener wrote for a lone sound, as consonants with a `V` for a vowel of any kind, so `b a` and `bʌ` are one shape."""
    return re.sub("V+", "V", "".join("V" if ch in _VOWEL_SOUNDS else ch for ch in reduce_sounds(sounds).replace("ħ", "h")))


class Heard:
    def __init__(self, words: str, sounds: str) -> None:
        self.words = words
        self.sounds = sounds


# How many sounds the sound listener may get wrong, as a share of the sounds in the clip, and still be taken to have understood it.
UNDERSTOOD = 0.25
# What the word listener may write for a letter said by itself. It is a soft sign: a letter is only a sound, and a recogniser reads sounds as words.
HEARD = {
    "a": "a eh ay hey", "b": "b be bee", "c": "c see sea si", "d": "d dee de", "e": "e ee", "f": "f eff ef", "g": "g gee ji", "h": "h aitch age",
    "i": "i eye aye", "j": "j jay", "k": "k kay okay", "l": "l el ell", "m": "m em", "n": "n en and", "o": "o oh owe", "p": "p pea pee",
    "q": "q queue cue", "r": "r are our", "s": "s es ess", "t": "t tea tee", "u": "u you ewe", "v": "v vee", "w": "w doubleu", "x": "x ex",
    "y": "y why wye", "z": "z zee zed",
}
# And for a word that sounds like another word, as the ways of writing the line, separated by spaces. A soft sign, as for the letters.
HOMOPHONES = {"bee": "bee be b", "berry": "berry barry", "hay": "hay hey"}
# The words of the reading course that sound like another word of it. The listener cannot tell which was meant, and any of them is right.
for _group in (
    "bare bear", "be bee b", "been bin", "blew blue", "buy by bye", "for four", "hall haul", "knight night", "knot not", "know no", "pair pear pare", "sea see c",
    "stair stare", "their there theyre", "to too two", "wear where", "wood would",
    # And two that the word listener writes as a name, which says the same.
    "dug doug", "wren ren",
):
    for _word in _group.split():
        if _word not in ("b", "c", "pare", "theyre"):
            HOMOPHONES[_word] = _group


def accepted(clip_id: str) -> set[str] | None:
    """The only ways the word listener may write a clip, when the plain words are not enough: a letter, or a word that another word sounds like."""
    kind, _, name = clip_id.partition(".")
    ways = HEARD.get(name) if kind == "letter" else HOMOPHONES.get(name) if kind in ("word", "shout") else None
    return set(ways.split()) if ways else None


def edge_inserts(heard: str, expected: str) -> tuple[int, int]:
    """
    How many sounds the sound listener wrote before the sounds that were meant, and how many after them, as (before, after). Both are in
    `reduce_sounds` letters. The sounds are lined up by the fewest edits, and a sound written where none was meant is counted only when it
    comes before the first sound that lines up with a meant one, or after the last. A sound written in the middle of a word is not counted.
    A clip that has a puff of air in front of it is written with a stop that was not meant: `d ɑɹ t` for `are`.
    """
    # The cost of lining up the first i sounds written with the first j sounds meant.
    cost = [[i + j if i == 0 or j == 0 else 0 for j in range(len(expected) + 1)] for i in range(len(heard) + 1)]
    for i in range(1, len(heard) + 1):
        for j in range(1, len(expected) + 1):
            cost[i][j] = min(cost[i - 1][j] + 1, cost[i][j - 1] + 1, cost[i - 1][j - 1] + (heard[i - 1] != expected[j - 1]))
    # Back from the end, a step at a time: a sound written and not meant is `+`, a sound meant and not written is `-`, and the rest line up.
    steps: list[str] = []
    i, j = len(heard), len(expected)
    while i or j:
        if i and j and cost[i][j] == cost[i - 1][j - 1] + (heard[i - 1] != expected[j - 1]):
            steps.append("=")
            i, j = i - 1, j - 1
        elif i and cost[i][j] == cost[i - 1][j] + 1:
            steps.append("+")
            i -= 1
        else:
            steps.append("-")
            j -= 1
    steps.reverse()
    before = next((n for n, step in enumerate(steps) if step != "+"), len(steps))
    after = next((n for n, step in enumerate(reversed(steps)) if step != "+"), len(steps))
    return before, 0 if before == len(steps) else after


class Grade:
    """What the two listeners made of a clip. `error` is the share of the meant sounds that the sound listener got wrong."""

    def __init__(self, error: float, words_ok: bool, understood: bool | None = None, misses: int | None = None, edges: tuple[int, int] = (0, 0)) -> None:
        self.error = error
        self.words_ok = words_ok
        #: For a sentence, how many words the word listener got wrong.
        self.misses = misses
        #: How many sounds the sound listener wrote before and after the meant ones, as (before, after).
        self.edges = edges
        self._understood = understood

    @property
    def understood(self) -> bool:
        return self.words_ok or self.error <= UNDERSTOOD if self._understood is None else self._understood


def grade(heard: Heard, said: str, sounds: str, ways: set[str] | None = None) -> Grade:
    """
    Whether the listeners understood a clip: the word listener wrote what was meant (or one of the `ways` of writing it), or the sound
    listener wrote sounds close to the sounds that were meant. Either is enough, because each is fooled in ways the other is not.
    """
    expected, written_sounds = reduce_sounds(sounds), reduce_sounds(heard.sounds)
    error = distance(written_sounds, expected) / max(len(expected), 1)
    written = letters_only(heard.words)
    words_ok = written in ways if ways else similarity(written, letters_only(said)) >= 0.8
    return Grade(error, bool(words_ok), edges=edge_inserts(written_sounds, expected))


# A word the word listener writes as one that the course writes as two, since a child reads `can not` as two words.
APART = {"cannot": ("can", "not")}


def words_of(text: str) -> list[str]:
    """The words a recogniser wrote, in lower case, with numbers spelled out and no marks."""
    spelled = re.sub(r"\d+", lambda m: f" {number_words(int(m.group()))} " if int(m.group()) <= 100 else m.group(), text.lower().replace("'", ""))
    return [part for word in re.findall(r"[a-z]+", spelled) for part in APART.get(word, (word,))]


def word_misses(heard: str, said: str, same: Callable[[str, str], bool] = lambda a, b: False) -> int:
    """
    How many words of a sentence the word listener got wrong: the fewest words to change, drop or add to turn what it wrote into what was
    said. A word that sounds the same as the one that was said (`two` for `to`) is not wrong, since the listener cannot know which was meant.
    """
    want, got = words_of(said), words_of(heard)
    previous = list(range(len(got) + 1))
    for i, meant in enumerate(want, 1):
        row = [i]
        for j, written in enumerate(got, 1):
            row.append(min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (0 if written == meant or same(written, meant) else 1)))
        previous = row
    return previous[-1]


def grade_line(heard: Heard, said: str, sounds: str, same: Callable[[str, str], bool] = lambda a, b: False) -> Grade:
    """
    Whether the listeners understood a sentence. A sentence is long enough for the word listener to be right about every word, so it has to
    be, or wrong about one word with the sound listener agreeing that the sounds were close. The sound listener alone is not enough, since it
    writes sounds that are close to the meant ones for a sentence that has a word dropped or doubled.
    """
    expected = reduce_sounds(sounds)
    error = distance(reduce_sounds(heard.sounds), expected) / max(len(expected), 1)
    misses = word_misses(heard.words, said, same)
    return Grade(error, misses == 0, understood=misses == 0 or (misses == 1 and error <= UNDERSTOOD), misses=misses)


class Judge:
    def __init__(self) -> None:
        self._whisper = None
        self._phones = None

    def _load_whisper(self):
        if self._whisper is None:
            from faster_whisper import WhisperModel

            root = snapshot_download(WHISPER[0], revision=WHISPER[1])
            self._whisper = WhisperModel(root, device="cpu", compute_type="int8")
        return self._whisper

    def _load_phones(self):
        if self._phones is None:
            from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

            # It only writes down sounds. Turning words into sounds is the other direction, and needs eSpeak on the machine.
            processor = Wav2Vec2Processor.from_pretrained(PHONES[0], revision=PHONES[1], do_phonemize=False)
            model = Wav2Vec2ForCTC.from_pretrained(PHONES[0], revision=PHONES[1]).eval()
            self._phones = (processor, model)
        return self._phones

    @staticmethod
    def _wave(audio: np.ndarray, quiet: float = 0.3) -> np.ndarray:
        """The clip at the rate the listeners use, with a moment of quiet around it so a word that starts or stops at once is still heard."""
        small = resample_poly(audio.astype(np.float32), 2, 3).astype(np.float32)
        pad = np.zeros(int(16000 * quiet), np.float32)
        return np.concatenate([pad, small, pad])

    def words(self, audio: np.ndarray) -> str:
        segments, _ = self._load_whisper().transcribe(
            self._wave(audio), language="en", beam_size=5, temperature=0.0, condition_on_previous_text=False, without_timestamps=True, vad_filter=False
        )
        return " ".join(s.text.strip() for s in segments).strip()

    def sounds(self, audio: np.ndarray) -> str:
        import torch

        processor, model = self._load_phones()
        wave = self._wave(audio)
        wave = (wave - wave.mean()) / (wave.std() + 1e-7)
        with torch.no_grad():
            logits = model(torch.from_numpy(wave)[None]).logits
        return processor.batch_decode(logits.argmax(-1))[0]

    def listen(self, audio: np.ndarray) -> Heard:
        return Heard(self.words(audio), self.sounds(audio))
