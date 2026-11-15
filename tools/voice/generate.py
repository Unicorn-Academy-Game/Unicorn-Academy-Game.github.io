"""Makes the voice of the game: every clip in `lines.json`, spoken by a model, checked by two listeners, and kept as a lossless master.

    python tools/voice/generate.py                    make what is missing or out of date
    python tools/voice/generate.py --only 'word.*'    make these again (ids, with * as a wildcard, separated by commas)
    python tools/voice/generate.py --only 'word.*' --new   make only those of them that have no master yet
    python tools/voice/generate.py --force            make everything again

Each clip is spoken several times, a little differently each time, and measured. The takes that pass are heard by two listeners that are
not the speaker, and the good take that is most like the other good takes is the one that is kept.

A letter or a word is the hardest thing to ask of the model, because it has almost nothing to go on. A letter said alone comes out with a
click and a clipped vowel, and a lone word can come out as another word (`duck` as `dark`) or with a sound in front of it (`z` for `fish`).
So these are also spoken together, the whole alphabet in one breath and the words of a kind in one breath (a long kind in a few breaths, a
group at a time), in several orders, and each is cut out where the model says it begins and ends. Those cuts and the lone takes are judged together, and the best of them is kept.

The masters are 16-bit mono at 24 kHz in `assets/source/voice`, and `pnpm assets:build` turns them into the files the game plays.
"""

from __future__ import annotations

import argparse
import fnmatch
import gc
import hashlib
import io
import json
import random
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

import cuts
import dsp
import frames
import group_sounds
import sounds
import times
from judge import HEARD, PHONES, WHISPER, Heard, Judge, accepted, edge_inserts, grade, grade_line, letters_only, reduce_sounds
from phones import count_sounds, ends_with_voice, opens_loud
from speak import REPO, REVISION, SAMPLE_RATE, VOICE, Kokoro

ROOT = Path(__file__).resolve().parents[2]
LINES = ROOT / "tools/voice/lines.json"
OVERRIDES = ROOT / "tools/voice/overrides.json"
OUT = ROOT / "assets/source/voice"
REPORT = OUT / "report.json"
# Change this when the way clips are made changes, so that every clip is made again.
GENERATOR = 3

# How slowly each kind of clip is spoken. Slower than talk between grown-ups, as one speaks to a child learning.
SPEEDS = {"word": 0.85, "shout": 0.85, "open": 0.9, "again": 0.9, "can": 0.9, "cheer": 0.9, "star": 0.9, "page": 0.9, "milestone": 0.9, "everything": 0.9, "press": 0.9, "read": 0.9, "line": 0.85, "play": 0.9, "num": 0.85, "maths": 0.9}
LETTER_SPEED = 0.8
# Each line is spoken once for each of these, moving along the model's rows of style, and with a seed of its own.
STYLES = [0, 4, 8, 12, 16, 20]
# A sentence is long, and each take costs the model and both listeners several seconds, so it is spoken four ways and more only if too few were good.
LINE_STYLES = [0, 6, 12, 18]
# How long a clip of each kind may be, in seconds.
LENGTHS = {"letter": (0.18, 1.0), "sound": (0.15, 1.0), "word": (0.3, 1.6), "shout": (0.3, 1.6), "cheer": (0.25, 1.5), "num": (0.3, 1.6), "maths": (0.3, 4.0)}
SENTENCE_LENGTH = (0.7, 4.0)
# The longest silence inside a clip, by kind. A word or a letter has none to speak of, and a sentence breathes.
SILENCE = {"letter": 0.12, "word": 0.12, "shout": 0.12, "cheer": 0.15, "line": 0.6, "num": 0.12}
SENTENCE_SILENCE = 0.5

# The name of each letter, in the model's own phoneme alphabet. The model cannot be trusted to read a lone letter as its name.
NAMES = {
    "a": "ˈA", "b": "bˈi", "c": "sˈi", "d": "dˈi", "e": "ˈi", "f": "ˈɛf", "g": "ʤˈi", "h": "ˈAʧ", "i": "ˈI", "j": "ʤˈA",
    "k": "kˈA", "l": "ˈɛl", "m": "ˈɛm", "n": "ˈɛn", "o": "ˈO", "p": "pˈi", "q": "kjˈu", "r": "ˈɑɹ", "s": "ˈɛs", "t": "tˈi",
    "u": "jˈu", "v": "vˈi", "w": "dˈʌbᵊlju", "x": "ˈɛks", "y": "wˈI", "z": "zˈi",
}
# A letter is made two ways, and the best take of either is kept. Spoken in a list, every letter is said in the same plain way, but the
# model opens its vowels too far there. Spoken alone, a letter has a vowel closer to a plain word's, and a falling voice at the end.
LIST_TAKES = 8
SEPARATOR = "... "
ALONE = [(0.85, 0), (0.85, 8), (0.9, 4), (0.9, 12), (0.8, 0), (1.0, 0)]
# When fewer than two takes pass, more are made, six at a time, moving further along the rows of style.
MORE_ALONE = [(speed, style) for style in (2, 6, 10, 14, 18, 22) for speed in (0.8, 0.9, 1.0)]
WANTED_GOOD = 2
# A line that fewer than two of its six takes get past is spoken again, six more at a time, up to three times, between the rows of style
# of the first six. These are not in the fingerprint of a line, since they only matter to a line the first six did not settle, so a line
# that was settled keeps its take when they change. Make the lines that were not settled again with `--only` after changing them.
MORE_STYLES = [2, 6, 10, 14, 18, 22]
MORE_ROUNDS = 3
# A word is the hardest thing to ask of the model. With almost nothing to go on, it voices the `f` of `fish`, puts a `z` in front of `duck` and
# says it as `dark`. So the lines of these kinds are spoken together, a group in one breath and in several orders, and each is cut out where it is
# quietest between it and the next, as the letters are. A sentence is long enough to need no help.
LISTED = ("word", "shout", "cheer")
# How a group is made. It is in the fingerprint of the group and in the report of every clip made this way. A clip of these kinds that has no
# method in the report was made the first way, in plain orders and cut halfway between the model's marks, and it is kept: the hundred words of
# the Spell Book, with their shouts and cheers. To make one of those again, name it with `--only`.
METHOD = 2
# The model takes 510 phonemes in one breath, and a group has a carrier at the joins that need one, so a kind is spoken in groups of GROUP lines.
GROUP = 24
# The hundred words of the Spell Book were made the first way, so the words after them start a group of their own and none is spoken with them.
FIRST = 100
# Two words that run together cannot be cut apart, so the model is given one of these, shut in silence at both ends, between them and
# the cut is made in that. The carriers are not kept. A carrier is not used in a group that has the same word in it.
CARRIERS = ("kit.", "pit.", "top.", "cup.", "tip.", "pat.", "cap.", "pot.")
# A group is spoken PER_ROUND orders at a time, and the takes that pass the measures are heard. A line that has too few that were understood and
# clean (`Verdict.clean`) waits for the next round, up to MAX_ORDERS orders. Speaking is quick next to listening, so this is where the extra takes are made.
PER_ROUND = 4
MAX_ORDERS = 16
# The shortest piece cut out of a breath that is looked at, in seconds. A shorter one is a cut that missed the word.
SHORTEST_PIECE = 0.1
# A word is at least this long for each sound it has, and never under MIN_WORD, in seconds. A word cut in the middle is short.
SECONDS_A_SOUND = 0.06
MIN_WORD = 0.12
# A word that has a hiss or a burst in it has little voice in it, so the share of a word that is voiced only has to be this much.
VOICED_WORD = 0.1
PUNCTUATION = ".,!?;:"
# The model says a clip now and then in a rattle at half its own pitch, mostly a back vowel (`all`, `were`, `cloud`, the ow of cow, the oy of boy) at
# the start of a word or at its end when the model is made to say it slowly. The listeners cannot hear it and `Pitch` cannot see it. A take with more
# than this share of its loud voice under 130 Hz is flagged, so it is never chosen over one that has none. Half is the line between a clip whose voice
# is deep and one that only drops at its last syllable, as an utterance does.
DEEP_SHARE = 0.5
# The measures below catch a letter whose vowel is the wrong one, which a recogniser can hear past, since it reads sounds as words.
# They are set from the model's own plain words (`bee`, `kay`, `eye`, `go`, `cue`, `eff`), measured the same way, with room to spare:
# the formants of a vowel are only found to within about 150 Hz, and the model does not say a vowel the same way twice. They are
# wide on purpose. They stop a vowel that ends in the wrong place, and leave the choice among the rest to the listeners.
#
# Where the second formant of a vowel has got to by its last third, in Hz, as (at least, at most). A long i, and the glides of `a` and
# `i` that end in one, finish high and forward: 2420 to 2690 Hz in the model's words. An `o` and a `you` finish back: 1070 to 1700.
END_F2: dict[str, tuple[float | None, float | None]] = {
    **{letter: (2200, None) for letter in "bcdegptvz"},
    **{letter: (2050, None) for letter in "ahjk"},
    **{letter: (1900, None) for letter in "iy"},
    "o": (None, 1900),
    **{letter: (None, 1600) for letter in "quw"},
}
# And where it is in the middle of the vowel, at least, where a vowel that starts back, as in `wee` for `e`, is caught: 2400 to 2680 Hz in the
# model's long i, and 2180 to 2310 in its `kay`, `jay` and `hey`.
MIDDLE_F2_MIN: dict[str, float] = {**{letter: 2100 for letter in "bcdegptvz"}, **{letter: 1950 for letter in "ahjk"}}
# The first formant of the vowel in `eff`, `ess`, `em` is about 950 Hz in the model's own words, as open as it goes. A letter with that
# vowel and a first formant much above this has an a-vowel.
TOO_OPEN = {letter: 1050 for letter in "flmnsx"}
# A letter that starts with a consonant has to start loud enough to hear it. This is the level of its first 25 ms, in dB below its loudest.
STARTS_WITH_CONSONANT = set("bcdgjkpqtvwz")
FAINT = -40.0
# A letter whose name is a lone vowel, and the second formant it has to have arrived at before the clip begins. The model speaks such a vowel
# with a glide in front, which `settle` cuts away, because a recogniser and a listener hear the glide as a consonant: `thee`, `wee`.
ARRIVES = {"e": 2300.0}
# A letter whose name starts with a vowel. What the model breathes before it is cut away, since a listener hears it as a consonant.
STARTS_WITH_VOWEL = set("aefhilmnorsx")


@dataclass(frozen=True)
class Take:
    """One way of speaking: how fast, where along the rows of style, and which noise."""

    speed: float
    style: int
    seed: int

    def describe(self) -> dict:
        return {"speed": self.speed, "style": self.style, "seed": self.seed}


@dataclass
class Verdict:
    audio: np.ndarray
    take: Take
    seconds: float
    heard: str
    sounds: str
    error: float
    understood: bool
    flags: list[str]
    pitch_hz: float
    pitch_span: float
    extra: dict
    listened: bool = True

    @property
    def valid(self) -> bool:
        return not self.flags and self.understood

    @property
    def clean(self) -> bool:
        """
        Valid, and the sound listener wrote no sound before or after the meant ones. A word cut out of a list can have the puff of air of the word
        before it on its front, which the word listener does not hear and the sound listener writes as a stop that was not meant, `d ɑɹ t` for `are`.
        """
        return self.valid and not any(self.extra.get("edges", (0, 0)))


def kind_of(clip_id: str) -> str:
    return clip_id.split(".")[0]


def tidy_at(audio: np.ndarray, phonemes: str) -> tuple[np.ndarray, float]:
    """A take of a line as it is looked at: cut to the sound, and with the hiss that follows the voice taken off where it is not meant. Also, where in the audio it starts."""
    start, end = dsp.speech_bounds(audio)
    clip = audio[start:end]
    return (dsp.cut_hiss(clip) if ends_with_voice(phonemes) else clip), start / SAMPLE_RATE


def tidy(audio: np.ndarray, phonemes: str) -> np.ndarray:
    return tidy_at(audio, phonemes)[0]


def line_bounds(text: str) -> tuple[float, float]:
    """How long a sentence may be, by its words: at least a fifth of a second for each, and at most two thirds of a second for each and a second over."""
    words = len(text.split())
    return 0.2 * words, 0.7 * words + 1.0


def same_sound(kokoro: Kokoro) -> Callable[[str, str], bool]:
    """Whether two written words are said the same, by the phonemes the model gets for them. The word listener cannot know which of two such words was meant."""
    cache: dict[str, str] = {}

    def sound(word: str) -> str:
        if word not in cache:
            cache[word] = reduce_sounds(kokoro.phonemes(word))
        return cache[word]

    return lambda a, b: sound(a) == sound(b)


def fingerprint(*parts: object) -> str:
    return hashlib.sha256(json.dumps([GENERATOR, REVISION, VOICE, *parts], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


def inspect(
    audio: np.ndarray,
    take: Take,
    kind: str,
    letter: str | None = None,
    extra: dict | None = None,
    opens_loud: bool = False,
    bounds: tuple[float, float] | None = None,
    voiced: float = 0.2,
) -> Verdict:
    """What can be measured of one take without a listener: how long, how loud, how clean at the ends, how voiced, and for a letter, its vowel."""
    flags: list[str] = []
    seconds = len(audio) / SAMPLE_RATE
    low, high = bounds or LENGTHS.get(kind, SENTENCE_LENGTH)
    if not low <= seconds <= high:
        flags.append(f"length {seconds:.2f}s")
    if dsp.peak(audio) >= 0.99:
        flags.append("clipped")
    start, end = dsp.edge_db(audio)
    # A vowel or a burst begins loud, and a clip that was cut at that very place on purpose does too, so only the other end is looked at there.
    if start > -28 and not opens_loud and letter not in STARTS_WITH_VOWEL:
        flags.append(f"loud at start {start:.0f}dB")
    if end > -28:
        flags.append(f"loud at end {end:.0f}dB")
    silence = dsp.longest_silence(audio)
    if silence > SILENCE.get(kind, SENTENCE_SILENCE):
        flags.append(f"silence {silence:.2f}s")
    if kind in ("letter", "word", "shout") and len(dsp.bursts(audio)) > 1:
        flags.append("two bursts of sound")
    pitch = dsp.Pitch(audio)
    if pitch.fraction < voiced:
        flags.append("hardly any voice")
    deep = dsp.deep_share(audio)
    if deep >= DEEP_SHARE:
        flags.append(f"rattle, {deep:.0%} of the voice is under 130Hz")
    measured: dict = {"deep": round(deep, 2)}
    if letter is not None:
        if letter in STARTS_WITH_CONSONANT:
            measured["startDb"] = round(dsp.onset_db(audio, 0.025))
            if measured["startDb"] < FAINT:
                flags.append(f"faint start {measured['startDb']}dB")
        shape = dsp.vowel(audio)
        if shape is not None:
            measured["vowel"] = shape.describe()
            f1, _ = shape.whole
            if letter in TOO_OPEN and f1 > TOO_OPEN[letter]:
                flags.append(f"vowel too open {f1:.0f}Hz")
            if letter in MIDDLE_F2_MIN and shape.middle[1] < MIDDLE_F2_MIN[letter]:
                flags.append(f"vowel is back in the middle {shape.middle[1]:.0f}Hz")
            if letter in END_F2:
                low, high = END_F2[letter]
                ends = shape.late[1]
                if (low is not None and ends < low) or (high is not None and ends > high):
                    flags.append(f"vowel ends at {ends:.0f}Hz, which is not where the name of {letter} ends")
    return Verdict(
        audio=audio, take=take, seconds=seconds, heard="", sounds="", error=1.0, understood=False, flags=flags, pitch_hz=pitch.median, pitch_span=pitch.span,
        extra={"pitchJump": round(pitch.jump, 1), **measured, **(extra or {})}, listened=False,
    )


def listen(
    verdict: Verdict, judge: Judge, said: str, sounds: str, ways: set[str] | None = None, same: Callable[[str, str], bool] | None = None, shipped: bool = False
) -> Verdict:
    """
    Has the two listeners hear the take, and says whether they understood it. A sentence is graded by its words, with `same` to say which words sound alike.
    With `shipped` a take that was understood is also heard as the game plays it, at the level the packer sets it to and a little either side
    of that, and has to be understood at all three.
    """
    heard = judge.listen(verdict.audio)
    graded = grade(heard, said, sounds, ways) if same is None else grade_line(heard, said, sounds, same)
    verdict.heard, verdict.sounds = heard.words, heard.sounds
    verdict.error = graded.error
    verdict.understood = graded.understood
    verdict.extra["wordsOk"] = graded.words_ok
    if graded.misses is not None:
        verdict.extra["wordMisses"] = graded.misses
    if any(graded.edges):
        verdict.extra["edges"] = list(graded.edges)
    verdict.listened = True
    if shipped and verdict.understood:
        for offset in PACKED_OFFSETS:
            packed = as_packed(verdict.audio, offset)
            played = judge.listen(packed)
            again = grade(played, said, sounds, ways) if same is None else grade_line(played, said, sounds, same)
            if not again.understood:
                # What the encoder left of it is what the report says was heard, so that a clip left for a person to look at shows what it came to.
                verdict.heard, verdict.sounds, verdict.error, verdict.understood = played.words, played.sounds, again.error, False
                verdict.extra["wordsOk"] = again.words_ok
                where = "as the packer sets it" if offset == 0 else f"{offset:+.0f} dB from where the packer sets it"
                verdict.extra["shipped"] = f"not understood once encoded, {where}"
                break
            if offset == 0 and (deep := dsp.deep_share(packed)) >= DEEP_SHARE:
                # The take was measured before the encoder, and a take that is near the line can be over it once it is encoded, which `verify.py` then finds.
                verdict.flags.append(f"rattle once encoded, {deep:.0%} of the voice is under 130Hz")
    return verdict


def listen_to(
    verdicts: list[Verdict],
    judge: Judge,
    said: str,
    sounds: str,
    ways: set[str] | None = None,
    same: Callable[[str, str], bool] | None = None,
    fallback: int | None = None,
    shipped: bool = False,
) -> None:
    """
    Has the listeners hear the takes that passed the measures and have not been heard yet. They are the slow part, and a take with a flag can never
    be chosen over one without, so a flagged take is only heard when no take is clean and none was understood. Then every flagged take is heard,
    or the `fallback` with the fewest flags when that is given, so that the best of a poor lot is at least one that was understood.
    """
    unheard = [v for v in verdicts if not v.listened]
    clean = [v for v in unheard if not v.flags]
    if clean:
        chosen = clean
    elif any(v.valid for v in verdicts):
        chosen = []
    else:
        flagged = sorted(unheard, key=lambda v: len(v.flags))
        chosen = flagged if fallback is None else flagged[:fallback]
    for verdict in chosen:
        listen(verdict, judge, said, sounds, ways, same, shipped)


def choose(verdicts: list[Verdict]) -> tuple[Verdict, int, str]:
    """
    The take that was understood and is most like the other good takes, so an odd one never wins. A take with a sound written before or after
    the word is passed over for one that has none, however alike the others are. Returns it, how many were good and a status.
    """
    good = [v for v in verdicts if v.valid]
    if not good:
        best = min(verdicts, key=lambda v: (len(v.flags) + (0 if v.understood else 1), v.error))
        return best, 0, "review"
    pool = [v for v in good if v.clean] or good
    if len(pool) == 1:
        return pool[0], len(good), "ok"
    far = np.array([[dsp.alike(a.audio, b.audio) if a is not b else 0.0 for b in pool] for a in pool])
    typical = far.sum(axis=1) / (len(pool) - 1)
    scale = max(float(np.median(typical)), 1e-6)
    score = typical / scale + 2.0 * np.array([v.error for v in pool])
    return pool[int(np.argmin(score))], len(good), "ok"


def finish(audio: np.ndarray) -> np.ndarray:
    """A take becomes a master: the quiet cut off both ends, a click-free rise and fall, and a level that leaves headroom."""
    return dsp.normalise(dsp.fade(dsp.trim_speech(audio)), -3.0)


def save(clip_id: str, audio: np.ndarray) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sf.write(OUT / f"{clip_id}.wav", finish(audio), SAMPLE_RATE, subtype="PCM_16")


def entry(clip_id: str, kind: str, text: str, said: str, chosen: Verdict, good: int, status: str, tried: int, made: str, phonemes: str) -> dict:
    mastered = finish(chosen.audio)
    seconds = len(mastered) / SAMPLE_RATE
    extra = {key: value for key, value in chosen.extra.items() if key not in ("spans", "lead")}
    if "spans" in chosen.extra:
        # The master starts where `finish` cut it, which is after where `tidy_at` did, and the times of the words are counted from there.
        lead = chosen.extra["lead"] + dsp.speech_bounds(chosen.audio)[0] / SAMPLE_RATE
        extra["words"] = times.in_clip(chosen.extra["spans"], lead, seconds)
    return {
        "fingerprint": made, "kind": kind, "text": text, "said": said, "phonemes": phonemes, "take": chosen.take.describe(), "seconds": round(seconds, 3),
        "pitchHz": round(chosen.pitch_hz), "pitchSpan": round(chosen.pitch_span, 1), "heard": chosen.heard, "heardSounds": chosen.sounds, "error": round(chosen.error, 3),
        "good": good, "tried": tried, "flags": chosen.flags, "status": status, **({"method": METHOD} if kind in LISTED else {}), **extra,
    }


# ---- letters ---------------------------------------------------------------------------------------------------------------------


def list_takes() -> list[tuple[str, Take]]:
    """The alphabet in several orders, so that each letter is heard next to different neighbours, spoken the same way."""
    orders = ["abcdefghijklmnopqrstuvwxyz", "zyxwvutsrqponmlkjihgfedcba"]
    for i in range(LIST_TAKES - 2):
        letters = list(orders[0])
        random.Random(i + 1).shuffle(letters)
        orders.append("".join(letters))
    return [(order, Take(LETTER_SPEED, 0, 100 + i)) for i, order in enumerate(orders)]


def alone_takes(pool: list[tuple[float, int]] = ALONE, first: int = 0) -> list[Take]:
    return [Take(speed, style, 200 + first + i) for i, (speed, style) in enumerate(pool)]


def cleaned(letter: str, audio: np.ndarray) -> np.ndarray:
    """What the model said of a letter, with the glide in front of a lone vowel cut away."""
    return dsp.settle(audio, ARRIVES[letter]) if letter in ARRIVES else audio


def cut_letters(kokoro: Kokoro, order: str, take: Take) -> dict[str, np.ndarray]:
    """Speaks the letters in this order and cuts each out of the result where the model says its name begins and ends."""
    phonemes = "".join(NAMES[letter] + SEPARATOR for letter in order).rstrip()
    spoken = kokoro.say(phonemes, take.speed, take.seed, take.style)
    spans = spoken.starts()
    audio = spoken.audio
    marks: list[tuple[float, float]] = []
    at = 0
    for letter in order:
        marks.append((spans[at][0], spans[at + len(NAMES[letter]) - 1][1]))
        at += len(NAMES[letter]) + len(SEPARATOR)
    pieces: dict[str, np.ndarray] = {}
    for i, letter in enumerate(order):
        start, end = marks[i]
        low = (marks[i - 1][1] + start) / 2 if i > 0 else max(0.0, start - 0.2)
        high = (end + marks[i + 1][0]) / 2 if i + 1 < len(order) else min(len(audio) / SAMPLE_RATE, end + 0.3)
        pieces[letter] = cleaned(letter, dsp.trim_speech(audio[int(low * SAMPLE_RATE) : int(high * SAMPLE_RATE)], vowel_first=letter in STARTS_WITH_VOWEL))
    return pieces


def letters_made() -> str:
    return fingerprint(
        "letters", NAMES, HEARD, [(order, take.describe()) for order, take in list_takes()], [take.describe() for take in alone_takes()], SEPARATOR,
        TOO_OPEN, END_F2, MIDDLE_F2_MIN, ARRIVES, sorted(STARTS_WITH_CONSONANT), sorted(STARTS_WITH_VOWEL), FAINT, MORE_ALONE,
    )


def make_letters(kokoro: Kokoro, judge: Judge, wanted: dict[str, dict], report: dict, remember: Callable[[], None], only: Callable[[str], bool]) -> None:
    made = letters_made()
    lists = list_takes()
    cuts = [cut_letters(kokoro, order, take) for order, take in lists]
    for letter in NAMES:
        clip_id = f"letter.{letter}"
        if not only(clip_id):
            continue
        vowel_first = letter in STARTS_WITH_VOWEL
        candidates = [inspect(piece[letter], take, "letter", letter, {"source": f"list {order}"}) for (order, take), piece in zip(lists, cuts)]

        def alone(takes: list[Take]) -> list[Verdict]:
            return [
                inspect(cleaned(letter, dsp.trim_speech(kokoro.say(NAMES[letter] + ".", take.speed, take.seed, take.style).audio, vowel_first=vowel_first)), take, "letter", letter, {"source": "alone"})
                for take in takes
            ]

        def hear(verdicts: list[Verdict]) -> None:
            listen_to(verdicts, judge, letter, NAMES[letter], accepted(clip_id))

        candidates += alone(alone_takes())
        hear(candidates)
        for start in range(0, len(MORE_ALONE), 6):
            if sum(v.valid for v in candidates) >= WANTED_GOOD:
                break
            more = alone(alone_takes(MORE_ALONE[start : start + 6], len(ALONE) + start))
            hear(more)
            candidates += more
        chosen, good, status = choose(candidates)
        save(clip_id, chosen.audio)
        report[clip_id] = entry(clip_id, "letter", wanted[clip_id]["text"], letter, chosen, good, status, len(candidates), made, NAMES[letter])
        remember()
        print(f"  {clip_id:<14} {status:<6} {good}/{len(candidates)} good  {report[clip_id]['seconds']:.2f}s  heard {chosen.heard!r}  sounds {chosen.sounds!r}  {chosen.extra.get('source')}  vowel {chosen.extra.get('vowel')}  {chosen.flags or ''}", flush=True)


# ---- sounds ----------------------------------------------------------------------------------------------------------------------


# How many takes of a sound have to be good before it stops looking. The sounds that few takes get right are the ones that go wrong in the encoder.
WANTED_SOUNDS = 3


# The levels a master is played at, against the one it was made at: the quietest and the loudest that setting every clip to the same loudness
# makes of it, with the top held under the highest sample the packer allows. A sound that is understood at one level and not at another is on the
# edge of being understood, and the sound listener is not the one to decide it.
LEVELS = (-3.0, 0.0, 1.5)
CEILING_DB = -1.5


# The loudness the packer sets every clip to, by its loudest 400 ms (`SPEECH.lufs` in `src/shared/audio.ts`). A word the packer has to make 9 dB quieter
# is heard differently from the master it was chosen as, and so is one it makes 5 dB louder, which is why a line is heard at the packer's own level.
PACK_LUFS = -12.0
# The quality the packer gives the MP3 encoder (`QUALITY` in `tools/assets/speech.ts`), where 0 is the biggest file.
MP3_QUALITY = 5

# Where a line is heard, in dB from the packer's level: the level itself first, and then a little either side, since the packer's limiter and
# the true-peak check can move a clip a little from what `pack_gain_db` says and a clip that is understood at only one level is on the edge.
PACKED_OFFSETS = (0.0, -2.0, 2.0)


def pack_gain_db(master: np.ndarray) -> float:
    """
    The gain `tools/assets/speech.ts` gives a master: the one that sets its loudest 400 ms to `PACK_LUFS`, or less if that would take its highest sample over
    `CEILING_DB`. Where the packer would let its limiter take some of the peak off to keep the loudness, this keeps the peak and ends up a little quieter.
    """
    return min(PACK_LUFS - dsp.momentary_loudness(master), CEILING_DB - float(dsp.db(dsp.peak(master))))


def master_samples(audio: np.ndarray) -> np.ndarray:
    """A take as its master file holds it and the packer reads it: made into a master, written as 16-bit samples by the same call `save` makes, and read back."""
    buffer = io.BytesIO()
    sf.write(buffer, finish(audio), SAMPLE_RATE, format="WAV", subtype="PCM_16")
    buffer.seek(0)
    return (sf.read(buffer, dtype="int16")[0] / 32768).astype(np.float32)


def packer_samples(level: np.ndarray) -> np.ndarray:
    """
    The 16-bit samples the packer writes for a level. `wavBytes` in `tools/audio/dsp.ts` rounds each as `Math.round(v * 32767)` does, which sends a half upward
    and is not how the sound file library rounds. A word on the edge of being understood is heard differently from one rounding to the other, as `vet` was.
    """
    return np.floor(np.clip(level.astype(np.float64), -1.0, 1.0) * 32767.0 + 0.5).astype("<i2")


def as_packed(audio: np.ndarray, offset_db: float = 0.0) -> np.ndarray:
    """What the game plays of a take: `through_mp3` at the gain the packer gives its master, and `offset_db` more."""
    return through_mp3(audio, pack_gain_db(master_samples(audio)) + offset_db)


def through_mp3(audio: np.ndarray, gain_db: float = 0.0) -> np.ndarray:
    """
    What the game plays of a master: made into a master, set to a level, written and encoded the way `tools/assets/speech.ts` writes and encodes it,
    and decoded again. At the level the packer sets, and where its limiter has nothing to hold, these are the samples of the file that ships.
    """
    level = (master_samples(audio).astype(np.float64) * 10 ** (gain_db / 20)).astype(np.float32)
    level = (level.astype(np.float64) * min(1.0, 10 ** (CEILING_DB / 20) / max(dsp.peak(level), 1e-9))).astype(np.float32)
    with tempfile.TemporaryDirectory() as scratch:
        wav, mp3 = Path(scratch) / "clip.wav", Path(scratch) / "clip.mp3"
        sf.write(wav, packer_samples(level), SAMPLE_RATE, subtype="PCM_16")
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-q:a", str(MP3_QUALITY), "-ac", "1", "-ar", str(SAMPLE_RATE), str(mp3)], check=True)
        decoded = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp3), "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"], capture_output=True, check=True)
    return np.frombuffer(decoded.stdout, dtype=np.float32)


def sounds_made() -> str:
    return fingerprint("sounds", sounds.recipe(), LENGTHS["sound"], LEVELS, CEILING_DB, WANTED_SOUNDS)


def hear_sound(letter: str, cut: sounds.Cut, judge: Judge) -> Verdict:
    """One way of making a letter's sound, measured, and, when nothing is wrong with it, heard by the listeners."""
    audio = dsp.fade(cut.audio, head=sounds.RISE, tail=sounds.FALL)
    verdict = inspect(audio, cut.way, "sound", extra={"source": cut.way.carrier}, opens_loud=True)
    if verdict.flags:
        return verdict
    heard = [judge.sounds(through_mp3(audio, level)) for level in LEVELS]
    verdict.sounds = heard[1]
    understood = all(sounds.understood(letter, written) for written in heard)
    if cut.whole is not None:
        verdict.heard = judge.words(cut.whole)
        verdict.understood = understood and any(word in letters_only(verdict.heard) for word in cut.words or ()) and sounds.placed(sounds.SOUNDS[letter].phonemes, cut.audio)
    else:
        verdict.understood = understood and sounds.hummed(letter, cut.lone)
    verdict.error = 0.0 if verdict.understood else 1.0
    verdict.listened = True
    return verdict


def make_sounds(kokoro: Kokoro, judge: Judge, wanted: dict[str, dict], report: dict, remember: Callable[[], None], only: Callable[[str], bool]) -> None:
    made = sounds_made()
    for letter, sound in sounds.SOUNDS.items():
        clip_id = f"sound.{letter}"
        if not only(clip_id):
            continue
        candidates: list[Verdict] = []
        for round in range(len(sounds.ROUNDS)):
            candidates += [hear_sound(letter, cut, judge) for cut in sounds.cuts(kokoro, letter, round)]
            if sum(v.valid for v in candidates) >= WANTED_SOUNDS:
                break
        chosen, good, status = choose(candidates)
        save(clip_id, chosen.audio)
        report[clip_id] = entry(clip_id, "sound", wanted[clip_id]["text"], letter, chosen, good, status, len(candidates), made, sound.phonemes)
        remember()
        print(f"  {clip_id:<14} {status:<6} {good}/{len(candidates)} good  {report[clip_id]['seconds']:.2f}s  heard {chosen.heard!r}  sounds {chosen.sounds!r}  {chosen.extra.get('source')}  {chosen.flags or ''}", flush=True)


# ---- group sounds ----------------------------------------------------------------------------------------------------------------


def groups_made() -> str:
    return fingerprint("groups", group_sounds.recipe(), LENGTHS["sound"], LEVELS, CEILING_DB, WANTED_SOUNDS)


def hear_group(key: str, cut: sounds.Cut, judge: Judge) -> Verdict:
    """One way of making the sound of a group of letters, measured, and, when nothing is wrong with it, heard by the listeners."""
    audio = dsp.fade(cut.audio, head=sounds.RISE, tail=sounds.FALL)
    verdict = inspect(audio, cut.way, "sound", extra={"source": cut.way.carrier}, opens_loud=True)
    if verdict.flags:
        return verdict
    heard = [judge.sounds(through_mp3(audio, level)) for level in LEVELS]
    verdict.sounds = heard[1]
    understood = all(group_sounds.understood(key, written) for written in heard)
    if cut.whole is not None:
        verdict.heard = judge.words(cut.whole)
        understood = understood and any(word in letters_only(verdict.heard) for word in cut.words or ())
    else:
        understood = understood and group_sounds.hum_ok(key, cut.lone)
    verdict.understood = understood
    verdict.error = 0.0 if understood else 1.0
    verdict.listened = True
    return verdict


def make_groups(kokoro: Kokoro, judge: Judge, wanted: dict[str, dict], report: dict, remember: Callable[[], None], only: Callable[[str], bool]) -> None:
    made = groups_made()
    for key, group in group_sounds.GROUPS.items():
        clip_id = f"sound.{key}"
        if not only(clip_id):
            continue
        candidates: list[Verdict] = []
        for round in range(len(sounds.ROUNDS)):
            for cut in group_sounds.cuts(kokoro, key, round):
                candidates.append(hear_group(key, cut, judge))
                if sum(v.valid for v in candidates) >= WANTED_SOUNDS:
                    break
            if sum(v.valid for v in candidates) >= WANTED_SOUNDS:
                break
        chosen, good, status = choose(candidates)
        save(clip_id, chosen.audio)
        report[clip_id] = entry(clip_id, "sound", wanted[clip_id]["text"], key, chosen, good, status, len(candidates), made, group.phonemes)
        remember()
        print(f"  {clip_id:<14} {status:<6} {good}/{len(candidates)} good  {report[clip_id]['seconds']:.2f}s  heard {chosen.heard!r}  sounds {chosen.sounds!r}  {chosen.extra.get('source')}  {chosen.flags or ''}", flush=True)


# ---- lines -----------------------------------------------------------------------------------------------------------------------


def more_takes(speed: float, round: int) -> list[Take]:
    """Six more ways of speaking a line, on the rows of style between the first six, each round with seeds of its own."""
    return [Take(speed, style, 100 + 10 * round + i) for i, style in enumerate(MORE_STYLES)]


def list_order(group: list[str], n: int) -> list[str]:
    """The lines of a group in the n-th order: the order of the list first, and after it a shuffle of its own for each, so that a line is heard beside other neighbours."""
    order = list(group)
    if n:
        random.Random(f"{group[0]}:{n}").shuffle(order)
    return order


# How finely the sound is read for the quiet between two lines, in seconds.
STEP = 0.0025


def speak_list(kokoro: Kokoro, parts: dict[str, str], order: list[str], take: Take, carriers: list[str]) -> dict[str, np.ndarray]:
    """Speaks the lines in this order in one breath, with a carrier wherever two would run together, and cuts each out where it is quietest between it and the next."""
    own = set(parts.values())
    items = cuts.with_carriers(order, parts, [carrier for carrier in carriers if carrier not in own], random.Random(take.seed))
    spoken = kokoro.say(" ".join(phonemes for _, phonemes in items), take.speed, take.seed, take.style)
    spans = spoken.starts()
    marks: list[tuple[float, float]] = []
    at = 0
    for _, phonemes in items:
        marks.append((spans[at][0], spans[at + len(phonemes.rstrip(PUNCTUATION)) - 1][1]))
        at += len(phonemes) + 1
    audio = spoken.audio
    where = cuts.cut_marks(marks, dsp.envelope(audio, STEP), STEP, len(audio) / SAMPLE_RATE)
    return {key: audio[int(low * SAMPLE_RATE) : int(high * SAMPLE_RATE)] for (key, _), (low, high) in zip(items, where) if key is not None}


def inspect_cut(piece: np.ndarray, phonemes: str, take: Take, kind: str) -> Verdict:
    """One piece of a breath, looked at as a take. A word is held to the length of a word with so many sounds in it, and not to one length for every word."""
    word = kind == "word"
    bounds = (max(MIN_WORD, SECONDS_A_SOUND * count_sounds(phonemes)), LENGTHS[kind][1]) if word else None
    return inspect(tidy(piece, phonemes), take, kind, extra={"source": "list"}, opens_loud=opens_loud(phonemes), bounds=bounds, voiced=VOICED_WORD if word else 0.2)


def grouped(ids: list[str]) -> list[list[str]]:
    """The lines of one kind, in the groups they are spoken in. Each group is spoken in one breath, so it has to fit the model. The words made the first way end a group of their own."""
    return [chunk[i : i + GROUP] for chunk in (ids[:FIRST], ids[FIRST:]) for i in range(0, len(chunk), GROUP)]


def together(lines: list[dict]) -> dict[str, list[str]]:
    """For each line of a kind that is also spoken together, the lines of its group, itself among them. A line of another kind is not in it."""
    found: dict[str, list[str]] = {}
    for kind in LISTED:
        for group in grouped([line["id"] for line in lines if kind_of(line["id"]) == kind]):
            for clip_id in group:
                found[clip_id] = group
    return found


def listed_in(kind: str, group: list[str], phonemes: dict[str, str]) -> str:
    """A fingerprint of the lines a group is spoken with: change one and the group is made again, and no other."""
    return fingerprint("list", kind, METHOD, [(clip_id, phonemes[clip_id]) for clip_id in group], CARRIERS)


def breath(group: list[str], phonemes: dict[str, str], carriers: list[str]) -> int:
    """How many phonemes the model is given for a group at most: the lines, and the longest carrier at every join and at the end."""
    return sum(len(phonemes[clip_id]) + 1 for clip_id in group) + len(group) * (max(len(carrier) for carrier in carriers) + 1)


def plan_line(line: dict, phonemes: str, context: str, overrides: dict) -> tuple[str, list[Take], str]:
    """What it takes to make a line: the phonemes, the takes to try, and a fingerprint of both with the words."""
    speed = SPEEDS[kind_of(line["id"])]
    picked = overrides.get(line["id"], {})
    if "copy" in picked:
        return phonemes, [], fingerprint(line["id"], "copy", picked["copy"])
    styles = LINE_STYLES if kind_of(line["id"]) == "line" else STYLES
    takes = [Take(picked.get("speed", speed), picked["style"], picked["seed"])] if "style" in picked else [Take(speed, style, 1 + i) for i, style in enumerate(styles)]
    ways = accepted(line["id"])
    return phonemes, takes, fingerprint(line["id"], line.get("say", line["text"]), phonemes, [t.describe() for t in takes], sorted(ways) if ways else None, context)


def speak_group(
    kokoro: Kokoro,
    judge: Judge,
    group: tuple[str, ...],
    members: list[dict],
    phonemes: dict[str, str],
    carriers: list[str],
    overrides: dict,
    shipped: bool = False,
) -> dict[str, list[Verdict]]:
    """
    Speaks a group in orders, PER_ROUND at a time, and has the listeners hear the takes of each member that passed the measures, until every member has
    WANTED_GOOD takes that were understood and clean or MAX_ORDERS orders have been spoken. A member whose take is chosen by hand is not asked of the
    list. A take is heard as the game will play it when `shipped` says so.
    """
    kind = kind_of(group[0])
    parts = {clip_id: phonemes[clip_id] for clip_id in group}
    wanting = [line for line in members if "style" not in overrides.get(line["id"], {})]
    found: dict[str, list[Verdict]] = {line["id"]: [] for line in wanting}
    spoken = 0
    while spoken < MAX_ORDERS:
        pending = [line for line in wanting if sum(v.clean for v in found[line["id"]]) < WANTED_GOOD]
        if not pending:
            break
        for _ in range(PER_ROUND):
            take = Take(SPEEDS[kind], 0, 100 + spoken)
            pieces = speak_list(kokoro, parts, list_order(list(group), spoken), take, carriers)
            for line in pending:
                piece = pieces[line["id"]]
                if len(piece) >= SHORTEST_PIECE * SAMPLE_RATE:
                    found[line["id"]].append(inspect_cut(piece, phonemes[line["id"]], take, kind))
            spoken += 1
        for line in pending:
            clip_id = line["id"]
            listen_to(found[clip_id], judge, line.get("say", line["text"]), phonemes[clip_id], accepted(clip_id), None, fallback=0, shipped=shipped)
        short = sum(1 for line in pending if sum(v.clean for v in found[line["id"]]) < WANTED_GOOD)
        print(f"  ({len(group)} {kind} lines from {group[0]} to {group[-1]}: {spoken} orders spoken, {short} of {len(wanting)} still short)", flush=True)
        gc.collect()
    return found


def make_line(
    kokoro: Kokoro,
    judge: Judge,
    line: dict,
    plan: tuple[str, list[Take], str],
    candidates: list[Verdict],
    report: dict,
    remember: Callable[[], None],
    shipped: bool = False,
) -> None:
    """
    Chooses the take of a line from the ones its group gave it, speaking it alone only if too few were understood, and writes the master and the report.
    A take is heard as the game will play it when `shipped` says so.
    """
    clip_id, kind = line["id"], kind_of(line["id"])
    said = line.get("say", line["text"])
    phonemes, takes, made = plan
    loud, ways = opens_loud(phonemes), accepted(clip_id)
    # A sentence is long enough to be heard word by word, and the model's own time for each word is kept for the game to light them.
    sentence = kind == "line"
    bounds = line_bounds(said) if sentence else None
    same = same_sound(kokoro) if sentence else None

    def alone(more: list[Take]) -> list[Verdict]:
        verdicts = []
        for take in more:
            spoken = kokoro.say(phonemes, take.speed, take.seed, take.style)
            audio, lead = tidy_at(spoken.audio, phonemes)
            extra: dict = {"source": "alone"}
            if sentence:
                extra |= {"spans": times.word_spans(phonemes, spoken.starts()), "lead": lead}
            verdicts.append(inspect(audio, take, kind, extra=extra, opens_loud=loud, bounds=bounds))
        return verdicts

    def hear(verdicts: list[Verdict]) -> None:
        listen_to(verdicts, judge, said, phonemes, ways, same, fallback=3, shipped=shipped)

    def good() -> int:
        return sum(v.valid for v in candidates)

    if kind in LISTED:
        # The group's takes come first, and the line is only spoken alone when too few of them were understood.
        hear(candidates)
        if good() < WANTED_GOOD:
            more = alone(takes)
            hear(more)
            candidates += more
    else:
        # Each way of speaking costs the model and both listeners several seconds, so a line is spoken two ways at a time and no more once two were understood.
        for start in range(0, len(takes), WANTED_GOOD):
            more = alone(takes[start : start + WANTED_GOOD])
            hear(more)
            candidates += more
            if good() >= WANTED_GOOD:
                break
    # A take that is named by hand is the only one. Otherwise, a line that too few takes got through is spoken again, further along the rows of style.
    for round in range(MORE_ROUNDS if len(takes) > 1 else 0):
        if good() >= WANTED_GOOD:
            break
        more = alone(more_takes(takes[0].speed, round))
        hear(more)
        candidates += more
    chosen, got, status = choose(candidates)
    save(clip_id, chosen.audio)
    report[clip_id] = entry(clip_id, kind, line["text"], said, chosen, got, status, len(candidates), made, phonemes)
    remember()
    print(f"  {clip_id:<22} {status:<6} {got}/{len(candidates)} good  {report[clip_id]['seconds']:.2f}s  heard {chosen.heard!r}  {chosen.extra.get('source')}  {chosen.flags or ''}", flush=True)


def copy_clips(copies: dict[str, str], wanted: dict[str, dict], phonemes: dict[str, str], clips: dict[str, dict], remember: Callable[[], None]) -> None:
    """
    A line that sounds the same as a letter is that letter's clip. The word `bee` is the name of `b`: the model, given the word alone, has almost
    nothing to go on and says `bay` or ends the vowel with a breath, and the letter was chosen by measures of its vowel that a word is not held to.
    The copy is made again on every run, so it follows the letter, and the report says what it is a copy of.
    """
    for clip_id, source in copies.items():
        if source not in clips:
            raise SystemExit(f"{clip_id} is to be a copy of {source}, which has not been made")
        master = (OUT / f"{source}.wav").read_bytes()
        target = OUT / f"{clip_id}.wav"
        if not target.exists() or target.read_bytes() != master:
            target.write_bytes(master)
        line = wanted[clip_id]
        said = line.get("say", line["text"])
        original = clips[source]
        graded = grade(Heard(original["heard"], original["heardSounds"]), said, phonemes[clip_id], accepted(clip_id))
        made = {
            **original, "fingerprint": fingerprint(clip_id, "copy", source), "kind": kind_of(clip_id), "text": line["text"], "said": said, "phonemes": phonemes[clip_id],
            "take": {"copyOf": source}, "error": round(graded.error, 3), "wordsOk": graded.words_ok, "status": "ok" if graded.understood else "review",
        }
        if clips.get(clip_id) != made:
            clips[clip_id] = made
            remember()
            print(f"  {clip_id:<22} {made['status']:<6} a copy of {source}  {made['seconds']:.2f}s  heard {made['heard']!r}", flush=True)


# ---- pieces of a sentence --------------------------------------------------------------------------------------------------------


# How a piece is made. It is in the fingerprint of every piece, so changing it makes them all again.
FRAME_METHOD = 3
FRAME_SPEED = 0.9
# A word in a sentence is at least this long for each sound it has, in seconds. It is shorter than a word said alone, which is drawn out.
PIECE_SECONDS_A_SOUND = 0.04


def frame_takes() -> list[Take]:
    """
    The ways a sentence is spoken, in the order they are tried. The first that is understood and clean is kept, and not the most typical of several: the
    pieces of one question are laid end to end, and the same way of speaking for each keeps them one voice.
    """
    return [Take(FRAME_SPEED, style, 1 + i) for i, style in enumerate(LINE_STYLES)] + more_takes(FRAME_SPEED, 0)


def framed_by_hand(line: dict, overrides: dict) -> dict:
    """
    The line with the sentence an override gives it, if it gives one. A piece that the model cannot say well in its own sentence (`last.8`, whose `eight?` it
    ends in a rattle in every take) is cut from another sentence, which has to have the same piece in it.
    """
    picked = overrides.get(line["id"], {}).get("frame")
    if picked is None:
        return line
    if frames.parse(picked).piece != frames.parse(line["frame"]).piece:
        sys.exit(f"{line['id']} is to be cut from {picked!r}, which has not the piece that {line['frame']!r} has")
    return {**line, "frame": picked}


def frame_plan(line: dict, spoken: frames.Spoken) -> str:
    """A fingerprint of what a piece is made from: its sentence and where it is cut, and how the sentence is spoken and set."""
    return fingerprint(line["id"], "frame", FRAME_METHOD, line["frame"], spoken.phonemes, spoken.first, spoken.last, [t.describe() for t in frame_takes()], frames.SENTENCE_LUFS, frames.MOST_UNDER)


def closed(piece: np.ndarray, frame: frames.Frame, phonemes: str) -> np.ndarray:
    """
    A piece that ends its sentence ends where its voice does, as a line does (`tidy_at`). The model breathes out after the last sound of a sentence, and
    when that is a hiss after a voiced sound it is heard as an `s` (175 ms of it after `many` in `Count them. How many?`). A piece with more after it is
    cut at the join, where the next word's own hiss may be, and is not touched.
    """
    return dsp.cut_hiss(piece) if frame.closes and ends_with_voice(phonemes) else piece


def kept_flags(flags: list[str], frame: frames.Frame, *, hissed: bool) -> list[str]:
    """
    The flags of a piece that mean something. A join is cut where the sentence is quietest between the two words, which is not quiet where one sound runs on
    into the next (the hiss of `is` into the hiss of `seven`). It is no click: the pieces fit as the sentence did. So only the start of the sentence and the
    end of it are held to being quiet, and an end that was set where the voice stopped (`closed`) is a cut on purpose, which is loud where it falls.
    """
    return [flag for flag in flags if not (flag.startswith("loud at start") and not frame.opens or flag.startswith("loud at end") and (not frame.closes or hissed))]


def stray_sounds(judge: Judge, piece: np.ndarray, expected: str) -> list[int]:
    """
    How many sounds the sound listener writes before and after a piece that is heard on its own and that the piece does not have, as `[before, after]`.
    A piece is cut out of a sentence where the two words are quietest, and a hiss or a burst of the word next to it can stay on its edge (the `d` that the
    `is` before `eight` leaves in front of it). The listeners hear the sentence whole, where such a sound is part of a word, so only this finds it.
    """
    return list(edge_inserts(reduce_sounds(judge.sounds(piece)), reduce_sounds(expected)))


def hear_piece(kokoro: Kokoro, judge: Judge, line: dict, frame: frames.Frame, spoken: frames.Spoken, take: Take, same: Callable[[str, str], bool]) -> Verdict:
    """
    One way of speaking a sentence, as a piece of it. The measures are taken of the piece and of the sentence, and the listeners hear the sentence whole,
    since a piece of a few sounds is not for them to understand: what the piece has to be is what they understood in its place.
    """
    clip_id = line["id"]
    said = frame.sentence
    made = kokoro.say(spoken.phonemes, take.speed, take.seed, take.style)
    sentence, gain = frames.level(made.audio)
    spans = times.word_spans(spoken.phonemes, made.starts())
    cut = frames.trimmed(frames.piece_of(sentence, spans, spoken.first, spoken.last), frame)
    shut = closed(cut, frame, spoken.piece)
    piece, lift = frames.lifted(shut)
    words = len(frame.piece.split())
    bounds = (max(MIN_WORD, PIECE_SECONDS_A_SOUND * count_sounds(spoken.piece)), 0.7 * words + 1.0)
    verdict = inspect(
        piece, take, kind_of(clip_id), extra={"source": "frame", "frame": line["frame"], "gainDb": round(gain, 1), "liftDb": round(lift, 1)}, opens_loud=frame.opens and opens_loud(spoken.piece),
        bounds=bounds, voiced=VOICED_WORD if words == 1 else 0.2,
    )
    verdict.flags = kept_flags(verdict.flags, frame, hissed=len(shut) < len(cut))
    around = inspect(tidy(sentence, spoken.phonemes), take, "line", bounds=line_bounds(said), opens_loud=opens_loud(spoken.phonemes))
    verdict.flags += [f"sentence {flag}" for flag in around.flags]
    if not verdict.flags:
        heard = listen(around, judge, said, spoken.phonemes, None, same)
        verdict.heard, verdict.sounds, verdict.error, verdict.understood = heard.heard, heard.sounds, heard.error, heard.understood
        verdict.extra |= {key: heard.extra[key] for key in ("wordsOk", "wordMisses") if key in heard.extra}
        verdict.listened = True
        if any(edges := stray_sounds(judge, piece, spoken.piece)):
            verdict.extra["edges"] = edges
    return verdict


def make_frame(kokoro: Kokoro, judge: Judge, line: dict, frame: frames.Frame, spoken: frames.Spoken, made: str, report: dict, remember: Callable[[], None]) -> None:
    """Speaks the sentence of a piece until it is understood and the piece is clean, and keeps the piece of that take, set at the level of its sentence."""
    clip_id = line["id"]
    same = same_sound(kokoro)
    tried: list[Verdict] = []
    for take in frame_takes():
        tried.append(hear_piece(kokoro, judge, line, frame, spoken, take, same))
        if tried[-1].clean:
            break
    chosen, good, status = choose(tried)
    OUT.mkdir(parents=True, exist_ok=True)
    sf.write(OUT / f"{clip_id}.wav", frames.edged(chosen.audio), SAMPLE_RATE, subtype="PCM_16")
    report[clip_id] = {
        "fingerprint": made, "kind": kind_of(clip_id), "text": line["text"], "said": line.get("say", line["text"]), "sentence": frame.sentence, "phonemes": spoken.piece,
        "take": chosen.take.describe(), "seconds": round(len(chosen.audio) / SAMPLE_RATE, 3), "pitchHz": round(chosen.pitch_hz), "pitchSpan": round(chosen.pitch_span, 1),
        "heard": chosen.heard, "heardSounds": chosen.sounds, "error": round(chosen.error, 3), "good": good, "tried": len(tried), "flags": chosen.flags, "status": status, **chosen.extra,
    }
    remember()
    print(f"  {clip_id:<14} {status:<6} {len(tried)} tried  {report[clip_id]['seconds']:.2f}s  heard {chosen.heard!r}  {chosen.flags or ''}", flush=True)


# ---- entry -----------------------------------------------------------------------------------------------------------------------


SHARDS = OUT / "shards"


def is_stale(
    clip_id: str, clip: dict | None, made: str, *, has_master: bool, patterns: list[str] | None = None, new: bool = False, force: bool = False
) -> bool:
    """
    Whether a clip is to be made. When clips are asked for by name, those are, or those with no master if `new` is given. Otherwise a clip is made
    when it has no master or the plan for it has changed. A word, shout or cheer that has no `method` in the report was made the first way, and it
    is kept whatever the plan says: it is made again only by name.
    """
    missing = clip is None or not has_master
    if patterns is not None:
        return any(fnmatch.fnmatch(clip_id, pattern) for pattern in patterns) and (not new or missing)
    if force or missing:
        return True
    if kind_of(clip_id) in LISTED and "method" not in clip:
        return False
    return clip["fingerprint"] != made


def pieces_of_work(todo: list[dict], groups: dict[str, list[str]]) -> list[tuple[tuple[str, ...], list[dict]]]:
    """
    The work of a run, in the order of the list: each group with the lines of it that are to be made, spoken once for all of them, and each line
    that has no group on its own with an empty group.
    """
    work: list[tuple[tuple[str, ...], list[dict]]] = []
    of_group: dict[tuple[str, ...], list[dict]] = {}
    for line in todo:
        group = tuple(groups.get(line["id"], ()))
        if group in of_group:
            of_group[group].append(line)
        elif group:
            of_group[group] = [line]
            work.append((group, of_group[group]))
        else:
            work.append(((), [line]))
    return work


def share(work: list, shard: int, shards: int) -> list:
    """The pieces of work that are the K-th shard's of N, counted from 1: every N-th piece, so that the shards are about the same size."""
    return [piece for i, piece in enumerate(work) if i % shards == shard - 1]


def merge_shards(report: dict, clips: dict[str, dict], write: Callable[[], None]) -> int:
    """Puts what the shards made into the report, and takes their files away. Run it when no shard is still going."""
    files = sorted(SHARDS.glob("report-*.json")) if SHARDS.exists() else []
    for path in files:
        clips.update(json.loads(path.read_text())["clips"])
    write()
    for path in files:
        path.unlink()
    if SHARDS.exists() and not any(SHARDS.iterdir()):
        SHARDS.rmdir()
    print(f"{len(files)} shards put in the report, which has {len(clips)} clips")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", help="make only these clips again: ids with * as a wildcard, separated by commas")
    parser.add_argument("--new", action="store_true", help="with --only, make only the clips that have no master yet")
    parser.add_argument("--force", action="store_true", help="make every clip again")
    parser.add_argument("--list", action="store_true", help="say what would be made and stop")
    parser.add_argument("--shard", help="K/N: make only the lines in every N-th piece of work, the K-th of them (counted from 1), and keep the report in a file of its own, so that N runs can go at once")
    parser.add_argument("--merge", action="store_true", help="put the reports that shards wrote into the report, and stop")
    parser.add_argument("--threads", type=int, help="how many threads the models use, which is all of them unless this is given")
    args = parser.parse_args()
    if args.threads:
        import torch

        torch.set_num_threads(args.threads)
    shard, shards = (int(part) for part in args.shard.split("/")) if args.shard else (1, 1)
    if not 1 <= shard <= shards:
        sys.exit(f"--shard {args.shard} is not K/N with K from 1 to N")

    lines = json.loads(LINES.read_text())
    wanted = {line["id"]: line for line in lines}
    report = json.loads(REPORT.read_text()) if REPORT.exists() else {}
    clips: dict[str, dict] = report.setdefault("clips", {})
    started_with = dict(clips)
    overrides = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
    patterns = [p.strip() for p in args.only.split(",")] if args.only else None

    def stale(clip_id: str, made: str) -> bool:
        return is_stale(clip_id, clips.get(clip_id), made, has_master=(OUT / f"{clip_id}.wav").exists(), patterns=patterns, new=args.new, force=args.force)

    def remember() -> None:
        """Writes the report. It is written after every clip, so a run that is stopped keeps what it made. A shard writes only what it made, to a file of its own."""
        report.update(
            {
                "generator": GENERATOR,
                "voice": VOICE,
                "sampleRate": SAMPLE_RATE,
                "models": {
                    "speaker": {"repo": REPO, "revision": REVISION},
                    "words": {"repo": WHISPER[0], "revision": WHISPER[1]},
                    "sounds": {"repo": PHONES[0], "revision": PHONES[1]},
                },
            }
        )
        report["clips"] = dict(sorted(clips.items()))
        if shards == 1:
            REPORT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
            return
        SHARDS.mkdir(parents=True, exist_ok=True)
        made = {clip_id: clip for clip_id, clip in clips.items() if started_with.get(clip_id) is not clip}
        (SHARDS / f"report-{shard}-of-{shards}.json").write_text(json.dumps({"clips": made}, indent=1, ensure_ascii=False) + "\n")

    if args.merge:
        return merge_shards(report, clips, remember)

    OUT.mkdir(parents=True, exist_ok=True)
    if shards == 1:
        for gone in [c for c in clips if c not in wanted]:
            del clips[gone]
            (OUT / f"{gone}.wav").unlink(missing_ok=True)
            print(f"  {gone}: the game no longer says it, so it is removed")

    kokoro = Kokoro()
    spoken = [line for line in lines if kind_of(line["id"]) not in ("letter", "sound") and "frame" not in line]
    groups = together(spoken)
    copies = {clip_id: picked["copy"] for clip_id, picked in overrides.items() if "copy" in picked}
    # With clips asked for by name, only those and the lines they are spoken with are looked at, since the phonemes of every line take a minute to find.
    if patterns is None:
        asked = {line["id"] for line in spoken}
    else:
        asked = {line["id"] for line in spoken if any(fnmatch.fnmatch(line["id"], p) for p in patterns)}
    needed = [line for line in spoken if line["id"] in asked or line["id"] in copies or any(other in asked for other in groups.get(line["id"], ()))]
    made_letters = letters_made()
    letters = [clip_id for clip_id in wanted if kind_of(clip_id) == "letter" and stale(clip_id, made_letters)] if shards == 1 else []
    made_sounds = sounds_made()
    made_groups = groups_made()
    unmade = [clip_id for clip_id in wanted if kind_of(clip_id) == "sound" and clip_id.removeprefix("sound.") not in sounds.SOUNDS | group_sounds.GROUPS]
    if unmade:
        sys.exit(f"{', '.join(unmade)} are not the sound of a letter (sounds.py) or of a group of letters (groups.py), so nothing here can make them")
    cut_sounds = [clip_id for clip_id in wanted if clip_id.removeprefix("sound.") in sounds.SOUNDS and kind_of(clip_id) == "sound" and stale(clip_id, made_sounds)] if shards == 1 else []
    cut_groups = [clip_id for clip_id in wanted if clip_id.removeprefix("sound.") in group_sounds.GROUPS and kind_of(clip_id) == "sound" and stale(clip_id, made_groups)] if shards == 1 else []
    # A pronunciation the voice gets wrong is given by hand in the overrides, as the phonemes it is to be spoken with.
    phonemes = {line["id"]: overrides.get(line["id"], {}).get("phonemes") or kokoro.phonemes(line.get("say", line["text"])) for line in needed}
    for line in needed:
        if kind_of(line["id"]) == "line" and len(times.word_spans(phonemes[line["id"]], [(0.0, 0.0)] * len(phonemes[line["id"]]))) != len(line["text"].split()):
            sys.exit(f"{line['id']} has {len(line['text'].split())} words and {len(phonemes[line['id']].split())} words of phonemes ({phonemes[line['id']]!r}), so the time of each word cannot be found")
    carriers = [kokoro.phonemes(word) for word in CARRIERS]
    room = kokoro.room()
    for group in {tuple(groups[clip_id]) for clip_id in asked if clip_id in groups}:
        if breath(list(group), {clip_id: phonemes[clip_id] for clip_id in group}, carriers) > room:
            sys.exit(f"the {len(group)} lines from {group[0]} to {group[-1]} can be more than the {room} phonemes the model takes in one breath: make GROUP smaller")
    def context(clip_id: str) -> str:
        return listed_in(kind_of(clip_id), groups[clip_id], phonemes) if clip_id in groups and clip_id not in copies else ""

    plans = {line["id"]: plan_line(line, phonemes[line["id"]], context(line["id"]), overrides) for line in needed}
    todo = [line for line in needed if line["id"] not in copies and stale(line["id"], plans[line["id"]][2])]
    work = pieces_of_work(todo, groups)
    mine = share(work, shard, shards)
    cut_pieces = {
        line["id"]: (frame, spoken_frame, frame_plan(line, spoken_frame))
        for line in (framed_by_hand(line, overrides) for line in lines if "frame" in line)
        if patterns is None or any(fnmatch.fnmatch(line["id"], p) for p in patterns)
        for frame in [frames.parse(line["frame"])]
        for spoken_frame in [frames.phonemes_of(frame, kokoro.phonemes)]
    }
    pieces = share([line for line in lines if line["id"] in cut_pieces and stale(line["id"], cut_pieces[line["id"]][2])], shard, shards)
    print(f"{len(lines)} clips in the list. To make: {len(letters)} letters, {len(cut_sounds)} sounds, {len(cut_groups)} group sounds, {len(todo)} lines in {len(work)} pieces of work, {len(mine)} of them here, {len(pieces)} pieces of sentences")
    if args.list:
        if shards == 1:
            remember()
        return 0

    started = time.time()
    if letters or cut_sounds or cut_groups or mine or pieces:
        judge = Judge()
        try:
            if letters:
                print("letters")
                make_letters(kokoro, judge, wanted, clips, remember, lambda clip_id: clip_id in letters)
            if cut_sounds:
                print("sounds")
                make_sounds(kokoro, judge, wanted, clips, remember, lambda clip_id: clip_id in cut_sounds)
            if cut_groups:
                print("group sounds")
                make_groups(kokoro, judge, wanted, clips, remember, lambda clip_id: clip_id in cut_groups)
            if mine:
                print("lines")
            for group, members in mine:
                # A line is kept only if it is understood as the game plays it, the way a letter's sound is, since the encoder undoes some clips that were clear as masters.
                found = speak_group(kokoro, judge, group, members, phonemes, carriers, overrides, shipped=True) if group else {}
                for line in members:
                    make_line(kokoro, judge, line, plans[line["id"]], found.get(line["id"], []), clips, remember, shipped=True)
            if pieces:
                print("pieces of sentences")
            for line in pieces:
                frame, spoken_frame, made_piece = cut_pieces[line["id"]]
                make_frame(kokoro, judge, line, frame, spoken_frame, made_piece, clips, remember)
        finally:
            remember()
    if shards == 1:
        copy_clips(copies, wanted, phonemes, clips, remember)
    if not letters and not cut_sounds and not cut_groups and not mine and not pieces:
        return 0
    review = [i for i, c in clips.items() if c["status"] != "ok"]
    print(f"done in {time.time() - started:.0f} s. {len(clips)} clips, {len(review)} for a person to look at{': ' + ', '.join(review) if review else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
