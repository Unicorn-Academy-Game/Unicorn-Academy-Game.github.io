"""The voice, made again with Qwen3-TTS: every clip of `lines.json`, cloned from two reference clips.

    /path/to/qwen-env/bin/python tools/voice/generate_qwen.py [--only 'word.*,letter.*'] [--force]

Why a second generator: seven voices were heard blind and this one was picked ("no contest"), so the
Kokoro pipeline in `generate.py` is retired for making clips but kept for its measures and listeners.
This file reuses them (`dsp` for the fault measures, `judge` for the two listeners and the rule for when
a clip is understood, `frames`/`cuts` for the maths pieces, `times` for word times) and changes only
what speaks and where word times come from:

- The speaker is Qwen3-TTS 1.7B Base (Apache 2.0), cloning two reference clips in `refs/`: `calm.wav`
  for everything ordinary and `cheer.wav` for cheers, milestones, finished pages and shouts. Both
  references were designed with the VoiceDesign model from a written brief and picked by ear.
- Word times no longer come from the speaker. Qwen3-ForcedAligner hears each kept sentence and says
  where its words are. The maths pieces are still cut out of whole sentences, with those spans.
- Letters and sounds are made the way the game teaches them and are weeded hardest: several takes of
  each, judged by the sound listener against the phoneme tables below (copied from `sounds.py`,
  `group_sounds.py` and the `NAMES` table of `generate.py`, which are Kokoro's and cannot be imported
  here because they load that model), by the hum under a hiss, and by where a vowel sits. A letter or
  sound no take satisfies is marked `review` in the report, and the run prints every one of them.

The environment needs MLX (Apple Silicon): `tools/voice/requirements-qwen.txt`. Nothing here runs on
the machine that plays the game; what ships is the audio, as before. Masters and `report.json` have
the same shape as the Kokoro ones, so `pnpm assets:build`, `pnpm voice:times` and the checks work
unchanged. A run that is stopped keeps what it made: the report is written after every clip, and a
clip already in the report with its master on disk is skipped unless `--force` is given.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import sys
import tempfile
import time
import zlib
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import soundfile as sf

sys.dont_write_bytecode = True  # auditions import these modules from outside; keep the tree clean

import dsp
import frames
import times
from judge import PHONES, WHISPER, Heard, Judge, accepted, edge_inserts, grade, grade_line, letters_only, reduce_sounds, shape_of, similarity, word_misses
from phones import count_sounds, ends_with_voice, opens_loud

ROOT = Path(__file__).resolve().parents[2]
LINES = ROOT / "tools/voice/lines.json"
REFS = ROOT / "tools/voice/refs"
DEFAULT_OUT = ROOT / "assets/source/voice"
SAMPLE_RATE = 24000

SPEAKER_REPO = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16"
SPEAKER_REVISION = "a6eb4f68e4b056f1215157bb696209bc82a6db48"
DESIGN_REPO = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16"
DESIGN_REVISION = "7d3824abff87e49756bb0f83fb5411de75d160c4"
ALIGNER_REPO = "mlx-community/Qwen3-ForcedAligner-0.6B-8bit"
ALIGNER_REVISION = "0e1a68e91d815300c7c9754b2a7639378b23db15"
VOICE_TAG = "Qwen3-TTS-1.7B-Base calm.02/cheer.01"
GENERATOR_TAG = "qwen-1"

CALM_TEXT = "The chimp sat on a branch, and the dolphin can splash. Do you remember the day we saw a beautiful butterfly on the sunflower?"
CHEER_TEXT = "You did it! Wonderful! That is fifteen words! Hooray!"
# Kinds said with the cheer reference: the ones whose job is to celebrate.
CHEER_KINDS = {"cheer", "milestone", "page", "shout"}

# How long a clip of each kind may be, in seconds (from `generate.py`, which measured them for the game).
LENGTHS = {"letter": (0.18, 1.0), "sound": (0.10, 1.0), "word": (0.3, 1.6), "shout": (0.3, 1.6), "cheer": (0.25, 1.5), "num": (0.3, 1.6), "maths": (0.3, 4.0)}
SENTENCE_LENGTH = (0.7, 4.0)
SILENCE = {"letter": 0.12, "word": 0.12, "shout": 0.12, "cheer": 0.15, "line": 0.6, "num": 0.12}
SENTENCE_SILENCE = 0.5
VOICED_WORD = 0.1
DEEP_SHARE = 0.5
WANTED_GOOD = 2
MAX_TAKES = 6

# The name of each letter, in the phoneme alphabet (from `generate.py`), and written out as a model may
# be given it when a lone capital letter makes it say nothing.
NAMES = {
    "a": "ˈA", "b": "bˈi", "c": "sˈi", "d": "dˈi", "e": "ˈi", "f": "ˈɛf", "g": "ʤˈi", "h": "ˈAʧ", "i": "ˈI", "j": "ʤˈA",
    "k": "kˈA", "l": "ˈɛl", "m": "ˈɛm", "n": "ˈɛn", "o": "ˈO", "p": "pˈi", "q": "kjˈu", "r": "ˈɑɹ", "s": "ˈɛs", "t": "tˈi",
    "u": "jˈu", "v": "vˈi", "w": "dˈʌbᵊlju", "x": "ˈɛks", "y": "wˈI", "z": "zˈi",
}
NAME_WORDS = dict(zip("abcdefghijklmnopqrstuvwxyz",
                      "Ay Bee See Dee Ee Ef Gee Aitch Eye Jay Kay El Em En Oh Pee Cue Ar Ess Tee You Vee Double-you Ex Why Zee".split()))

# What each letter sounds like (from `sounds.py`): the sound, whether it is a vowel said alone or a
# consonant said before a breath of vowel, that vowel, and how much of it a cut keeps.
SOUNDS = {
    "a": ("æ", "vowel", "ʌ", 0.1), "b": ("b", "syllable", "ʌ", 0.1), "c": ("k", "syllable", "ʌ", 0.1), "d": ("d", "syllable", "ʌ", 0.1),
    "e": ("ɛ", "vowel", "ʌ", 0.1), "f": ("f", "syllable", "ʌ", 0.1), "g": ("ɡ", "syllable", "ʌ", 0.1), "h": ("h", "syllable", "ɑ", 0.1),
    "i": ("ɪ", "vowel", "ʌ", 0.1), "j": ("ʤ", "syllable", "ʌ", 0.1), "k": ("k", "syllable", "ʌ", 0.1), "l": ("l", "syllable", "ʌ", 0.1),
    "m": ("m", "syllable", "ʌ", 0.1), "n": ("n", "syllable", "ʌ", 0.1), "o": ("ɑ", "vowel", "ʌ", 0.1), "p": ("p", "syllable", "ʌ", 0.1),
    "q": ("kw", "syllable", "ʌ", 0.1), "r": ("ɹ", "syllable", "ʌ", 0.1), "s": ("s", "syllable", "ʌ", 0.1), "t": ("t", "syllable", "ɑ", 0.08),
    "u": ("ʌ", "vowel", "ʌ", 0.1), "v": ("v", "syllable", "ʌ", 0.1), "w": ("w", "syllable", "ʌ", 0.1), "x": ("ks", "syllable", "ʌ", 0.1),
    "y": ("j", "syllable", "ʌ", 0.08), "z": ("z", "syllable", "ʌ", 0.1),
}
# The sounds of groups of letters, and what the sound listener may write for each (from `group_sounds.py`).
GROUPS = {
    "sh": ("ʃ", {"ʃ", "ʃV"}), "ch": ("ʧ", {"ʧ", "ʧV"}), "th": ("θ", {"θ", "θV", "f", "fV", "s", "sV"}),
    "oo": ("u", {"V"}), "uu": ("ʊ", {"V"}), "ow": ("W", {"V", "Vw", "wV"}), "oy": ("Y", {"V", "Vj", "jV"}),
    "aw": ("ɔ", {"V"}), "ar": ("ɑɹ", {"V", "Vɹ"}), "or": ("ɔɹ", {"V", "Vɹ"}), "er": ("ɜɹ", {"V", "Vɹ"}),
    "air": ("ɛɹ", {"V", "Vɹ"}), "ng": ("ŋ", {"ŋ", "n"}), "ing": ("ɪŋ", {"Vŋ", "Vn"}), "nk": ("ŋk", {"ŋk", "nk", "ŋVk", "nVk"}),
}
# The sound listener writes `z` as `s`; what tells the pairs apart here is how much of the consonant is
# voiced, as (at least, at most) of it. The hum ranges of `sounds.py` were measured on the old model and
# overlap in this voice, so the hum is recorded in the report and decides nothing.
WRITTEN_AS = {"z": ("z", "s")}
VOICING = {"s": (None, 0.35), "f": (None, 0.65), "z": (0.5, None), "v": (0.5, None), "th": (None, 0.65)}
# Sounds the listener writes as their voiceless twin, and the least of the consonant that has to be voiced for the twin to count.
TWIN = {"g": ({"ɡ", "ɡV", "k", "kV"}, 0.3), "j": ({"ʤ", "ʤV", "ʧ", "ʧV"}, 0.2)}
# Where the short i has to sit, in Hz (from `sounds.py`): brighter than a plain short i, not yet `ee`.
BETWEEN_I = ((540.0, 690.0), (2220.0, 2500.0))
VOWEL_TOKENS = set("aɛiɑəuAIOWY")


def hum(audio: np.ndarray) -> float:
    """How loud the voice's hum is under a sound, in dB: below 500 Hz against above 2 kHz (`sounds.hum`)."""
    from scipy.signal import welch

    f, power = welch(audio, SAMPLE_RATE, nperseg=min(len(audio), 512))
    low, high = power[(f >= 80) & (f <= 500)].sum(), power[(f >= 2000) & (f <= 8000)].sum()
    return float(10 * np.log10(max(low, 1e-12) / max(high, 1e-12)))


def lengthen(audio: np.ndarray, seconds: float) -> np.ndarray:
    """The same sound for longer, by repeating its own periods (`sounds.lengthen`, Praat overlap-add, at most three times)."""
    have = len(audio) / SAMPLE_RATE
    if have >= seconds:
        return audio
    import parselmouth
    from parselmouth.praat import call

    factor = min(3.0, seconds / have)
    try:
        made = call(parselmouth.Sound(audio.astype(np.float64), sampling_frequency=SAMPLE_RATE), "Lengthen (overlap-add)", 100, 500, factor)
    except parselmouth.PraatError:
        return audio  # too short for pitch analysis: a take that short is not kept anyway
    return made.values[0].astype(np.float32)


@dataclass
class Verdict:
    audio: np.ndarray
    seed: int
    ref: str
    seconds: float = 0.0
    heard: str = ""
    sounds: str = ""
    error: float = 1.0
    understood: bool = False
    flags: list[str] = field(default_factory=list)
    pitch_hz: float = 0.0
    pitch_span: float = 0.0
    extra: dict = field(default_factory=dict)
    listened: bool = False

    @property
    def valid(self) -> bool:
        return not self.flags and self.understood

    @property
    def clean(self) -> bool:
        return self.valid and not any(self.extra.get("edges", (0, 0)))


def kind_of(clip_id: str) -> str:
    return clip_id.split(".")[0]


def line_bounds(text: str) -> tuple[float, float]:
    words = len(text.split())
    return 0.2 * words, 0.7 * words + 1.0


def inspect(audio: np.ndarray, kind: str, phonemes: str | None = None, bounds=None, voiced: float = 0.2, check_voice: bool = True) -> Verdict:
    """What can be measured of one take without a listener (the measures of `generate.inspect`, on `dsp`)."""
    flags: list[str] = []
    seconds = len(audio) / SAMPLE_RATE
    low, high = bounds or LENGTHS.get(kind, SENTENCE_LENGTH)
    if not low <= seconds <= high:
        flags.append(f"length {seconds:.2f}s")
    if dsp.peak(audio) >= 0.99:
        flags.append("clipped")
    start, end = dsp.edge_db(audio)
    if start > -28 and not (phonemes and opens_loud(phonemes)):
        flags.append(f"loud at start {start:.0f}dB")
    if end > -28:
        flags.append(f"loud at end {end:.0f}dB")
    if dsp.longest_silence(audio) > SILENCE.get(kind, SENTENCE_SILENCE):
        flags.append(f"silence {dsp.longest_silence(audio):.2f}s")
    if kind in ("letter", "word", "shout") and len(dsp.bursts(audio)) > 1:
        flags.append("two bursts of sound")
    pitch = dsp.Pitch(audio)
    if check_voice and pitch.fraction < voiced:
        flags.append("hardly any voice")
    deep = dsp.deep_share(audio)
    if deep >= DEEP_SHARE:
        flags.append(f"rattle, {deep:.0%} of the voice is under 130Hz")
    return Verdict(audio=audio, seed=0, ref="", seconds=seconds, flags=flags, pitch_hz=pitch.median, pitch_span=pitch.span,
                   extra={"pitchJump": round(pitch.jump, 1), "deep": round(deep, 2)})


def choose(verdicts: list[Verdict]) -> tuple[Verdict, int, str]:
    """The take that was understood and is most like the other good takes, so an odd one never wins (`generate.choose`)."""
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


class Maker:
    def __init__(self, out: Path, scratch: Path) -> None:
        self.out = out
        self.scratch = scratch
        self.judge = Judge()
        self._tts = None
        self._aligner = None
        self._g2p = None
        self._phoneme_cache: dict[str, str | None] = {}
        self._phones_model = None

    # -- models -------------------------------------------------------------
    @property
    def tts(self):
        if self._tts is None:
            from mlx_audio.tts.utils import load_model

            self._tts = load_model(SPEAKER_REPO)
        return self._tts

    @property
    def aligner(self):
        if self._aligner is None:
            from mlx_audio.stt import load

            self._aligner = load(ALIGNER_REPO)
        return self._aligner

    def phonemes(self, text: str) -> str | None:
        """The sounds a line is meant to have, from Misaki as the old pipeline had them. None when Misaki has no reading of it."""
        if text not in self._phoneme_cache:
            if self._g2p is None:
                from misaki import en

                self._g2p = en.G2P(trf=False, british=False)
            said = self._g2p(text)[0]
            self._phoneme_cache[text] = None if "❓" in said else said
        return self._phoneme_cache[text]

    def same_sound(self, a: str, b: str) -> bool:
        pa, pb = self.phonemes(a), self.phonemes(b)
        return pa is not None and pb is not None and reduce_sounds(pa) == reduce_sounds(pb)

    # -- speaking -------------------------------------------------------------
    def clone(self, text: str, ref: str, seed: int, cap: int) -> np.ndarray | None:
        import mlx.core as mx

        path, ref_text = (REFS / "cheer.wav", CHEER_TEXT) if ref == "cheer" else (REFS / "calm.wav", CALM_TEXT)
        mx.random.seed(seed)
        parts = [np.asarray(r.audio, dtype=np.float32).reshape(-1)
                 for r in self.tts.generate(text=text, ref_audio=str(path), ref_text=ref_text, max_tokens=cap)]
        parts = [p for p in parts if p.size]
        return np.concatenate(parts) if parts else None

    def tidy(self, audio: np.ndarray, phonemes: str | None) -> np.ndarray:
        start, end = dsp.speech_bounds(audio)
        clip = audio[start:end]
        return dsp.cut_hiss(clip) if phonemes and ends_with_voice(phonemes) else clip

    @staticmethod
    def seed_of(clip_id: str, take: int) -> int:
        return 17 + (zlib.crc32(clip_id.encode()) % 100_000) + 131 * take

    # -- listening -------------------------------------------------------------
    def listen_sentence(self, v: Verdict, said: str, phonemes: str | None) -> Verdict:
        v.heard = self.judge.words(v.audio)
        misses = word_misses(v.heard, said, self.same_sound)
        v.extra["wordsOk"] = misses == 0
        v.extra["wordMisses"] = misses
        if misses == 0:
            v.understood, v.error = True, 0.0
        elif phonemes:
            v.sounds = self.judge.sounds(v.audio)
            g = grade_line(Heard(v.heard, v.sounds), said, phonemes, self.same_sound)
            v.understood, v.error = g.understood, g.error
        else:
            v.understood, v.error = False, 1.0
        v.listened = True
        return v

    def listen_word(self, v: Verdict, clip_id: str, said: str, phonemes: str | None) -> Verdict:
        heard = self.judge.listen(v.audio)
        v.heard, v.sounds = heard.words, heard.sounds
        ways = accepted(clip_id)
        if phonemes:
            g = grade(heard, said, phonemes, ways)
            v.understood, v.error = g.understood, g.error
            if any(g.edges):
                v.extra["edges"] = list(g.edges)
        else:
            written = letters_only(heard.words)
            v.understood = written in ways if ways else similarity(written, letters_only(said)) >= 0.8
            v.error = 0.0 if v.understood else 1.0
        v.listened = True
        return v

    def phones_timed(self, audio: np.ndarray) -> list[tuple[str, float, float]]:
        """Where each sound the sound listener hears begins and ends, from its own frames (20 ms, behind a 0.3 s pad)."""
        import torch

        if self._phones_model is None:
            processor, model = self.judge._load_phones()
            vocab = processor.tokenizer.get_vocab()
            self._phones_model = (model, {i: t for t, i in vocab.items()})
        model, inv = self._phones_model
        wave = self.judge._wave(audio)
        wave = (wave - wave.mean()) / (wave.std() + 1e-7)
        with torch.no_grad():
            ids = model(torch.from_numpy(wave)[None]).logits[0].argmax(-1).tolist()
        out, start = [], 0
        for k in range(1, len(ids) + 1):
            if k == len(ids) or ids[k] != ids[start]:
                tok = inv.get(ids[start], "")
                if tok and tok not in ("<pad>", "|", "<s>", "</s>", "<unk>"):
                    out.append((tok, start * 0.02 - 0.3, k * 0.02 - 0.3))
                start = k
        return out

    def align(self, audio: np.ndarray, text: str) -> list[tuple[float, float]] | None:
        """Where each word of `text` is in `audio`, from the forced aligner. None when the count disagrees."""
        path = self.scratch / f"align-{abs(hash((text, len(audio))))}.wav"
        sf.write(path, audio, SAMPLE_RATE, subtype="PCM_16")
        try:
            items = [(i.start_time, i.end_time) for i in self.aligner.generate(audio=str(path), text=text, language="English")]
        except Exception:
            return None
        return items if len(items) == len(text.split()) else None

    # -- saving -------------------------------------------------------------
    def save(self, clip_id: str, audio: np.ndarray) -> float:
        self.out.mkdir(parents=True, exist_ok=True)
        mastered = finish(audio)
        sf.write(self.out / f"{clip_id}.wav", mastered, SAMPLE_RATE, subtype="PCM_16")
        return len(mastered) / SAMPLE_RATE

    def entry(self, clip_id: str, line: dict, chosen: Verdict, good: int, status: str, tried: int, phonemes: str | None, seconds: float) -> dict:
        return {
            "fingerprint": hashlib.sha256(json.dumps([GENERATOR_TAG, clip_id, chosen.seed, chosen.ref]).encode()).hexdigest()[:16],
            "kind": kind_of(clip_id), "text": line["text"], "said": line.get("say", line["text"]), "phonemes": phonemes or "",
            "take": {"seed": chosen.seed, "ref": chosen.ref, "model": SPEAKER_REPO},
            "seconds": round(seconds, 3), "pitchHz": round(chosen.pitch_hz), "pitchSpan": round(chosen.pitch_span, 1),
            "heard": chosen.heard, "heardSounds": chosen.sounds, "error": round(chosen.error, 3),
            "good": good, "tried": tried, "flags": chosen.flags, "status": status,
            **{k: v for k, v in chosen.extra.items() if k not in ("edges",) or v},
        }

    # -- flows -------------------------------------------------------------
    def make_sentence(self, line: dict, report: dict, remember) -> None:
        """A line said whole: sentences, instructions, cheers. Two takes at a time until two are understood."""
        clip_id, kind = line["id"], kind_of(line["id"])
        said = line.get("say", line["text"])
        ref = "cheer" if kind in CHEER_KINDS else "calm"
        phonemes = self.phonemes(said)
        bounds = line_bounds(said) if kind == "line" else None
        cap = min(900, 90 + 45 * len(said.split()))
        verdicts: list[Verdict] = []
        for batch in range(0, MAX_TAKES, 2):
            for i in (batch, batch + 1):
                audio = self.clone(said, ref, self.seed_of(clip_id, i), cap)
                if audio is None:
                    continue
                v = inspect(self.tidy(audio, phonemes), kind, phonemes, bounds=bounds, voiced=VOICED_WORD if kind in ("maths",) else 0.2)
                v.seed, v.ref = self.seed_of(clip_id, i), ref
                verdicts.append(self.listen_sentence(v, said, phonemes))
            if sum(v.valid for v in verdicts) >= WANTED_GOOD:
                break
        chosen, good, status = choose(verdicts)
        seconds = self.save(clip_id, chosen.audio)
        report[clip_id] = self.entry(clip_id, line, chosen, good, status, len(verdicts), phonemes, seconds)
        remember()
        print(f"  {clip_id:<58} {status:<6} {good}/{len(verdicts)} good  {seconds:.2f}s  heard {chosen.heard!r}  {chosen.flags or ''}", flush=True)

    def make_word(self, line: dict, report: dict, remember) -> None:
        """A word, a shout or a number said alone. Two takes at a time until two are understood."""
        clip_id, kind = line["id"], kind_of(line["id"])
        said = line.get("say", line["text"])
        ref = "cheer" if kind in CHEER_KINDS else "calm"
        phonemes = self.phonemes(said)
        verdicts: list[Verdict] = []
        for batch in range(0, MAX_TAKES, 2):
            for i in (batch, batch + 1):
                audio = self.clone(said, ref, self.seed_of(clip_id, i), 160)
                if audio is None:
                    continue
                v = inspect(self.tidy(audio, phonemes), kind, phonemes, voiced=VOICED_WORD)
                v.seed, v.ref = self.seed_of(clip_id, i), ref
                verdicts.append(self.listen_word(v, clip_id, said, phonemes))
            if sum(v.valid for v in verdicts) >= WANTED_GOOD:
                break
        chosen, good, status = choose(verdicts)
        seconds = self.save(clip_id, chosen.audio)
        report[clip_id] = self.entry(clip_id, line, chosen, good, status, len(verdicts), phonemes, seconds)
        remember()
        print(f"  {clip_id:<58} {status:<6} {good}/{len(verdicts)} good  {seconds:.2f}s  heard {chosen.heard!r}  {chosen.flags or ''}", flush=True)

    def make_letter(self, line: dict, report: dict, remember) -> None:
        """The name of a letter. Said as a lone capital first, then written out. Judged against the name's own sounds."""
        clip_id = line["id"]
        letter = clip_id.split(".")[1]
        phonemes = NAMES[letter]
        ways = accepted(clip_id)
        verdicts: list[Verdict] = []
        for form, text in enumerate((f"{letter.upper()}.", f"{NAME_WORDS[letter]}.")):
            for i in range(3):
                audio = self.clone(text, "calm", self.seed_of(clip_id, form * 3 + i), 120)
                if audio is None:
                    continue
                v = inspect(self.tidy(audio, phonemes), "letter", phonemes)
                v.seed, v.ref = self.seed_of(clip_id, form * 3 + i), "calm"
                heard = self.judge.listen(v.audio)
                v.heard, v.sounds = heard.words, heard.sounds
                g = grade(heard, text, phonemes, ways)
                v.understood, v.error, v.listened = g.understood, g.error + 0.1 * form, True
                v.extra["form"] = text
                verdicts.append(v)
            if sum(v.valid for v in verdicts) >= WANTED_GOOD:
                break
        chosen, good, status = choose(verdicts)
        shape = dsp.vowel(chosen.audio)
        if shape is not None:
            chosen.extra["vowel"] = shape.describe()
        seconds = self.save(clip_id, chosen.audio)
        report[clip_id] = self.entry(clip_id, line, chosen, good, status, len(verdicts), phonemes, seconds)
        remember()
        print(f"  {clip_id:<58} {status:<6} {good}/{len(verdicts)} good  {seconds:.2f}s  heard {chosen.heard!r} sounds {chosen.sounds!r}  {chosen.flags or ''}", flush=True)

    # -- sounds -------------------------------------------------------------
    def _sound_verdict(self, clip_id: str, piece: np.ndarray, seed: int, phonemes: str, check_voice: bool = True) -> Verdict:
        v = inspect(piece, "sound", phonemes, check_voice=check_voice)
        # A sound is a deliberate cut, so its ends are where the cut fell and may be loud there. The fades keep them click-free.
        v.flags = [f for f in v.flags if not f.startswith(("loud at start", "loud at end"))]
        v.seed, v.ref = seed, "calm"
        v.sounds = self.judge.sounds(piece)
        return v

    def make_sound(self, line: dict, report: dict, remember) -> None:
        clip_id = line["id"]
        key = clip_id.split(".")[1]
        phonemes = SOUNDS[key][0] if key in SOUNDS else GROUPS[key][0]
        if key == "x":
            # `x` is two sounds at the end of a word (`box`), and said first as `ksuh` it comes out as other sounds entirely.
            verdicts = self._sound_final_ks(clip_id)
        elif key in SOUNDS:
            phonemes, shape, _, breath = SOUNDS[key]
            verdicts = self._sound_vowels(clip_id, key, phonemes) if shape == "vowel" else self._sound_syllables(clip_id, line["text"], phonemes, breath)
        elif key in ("th", "ch"):
            # These cannot start their 'as in' phrase (the model says a vowel or another sound first), so they are made as syllables.
            verdicts = self._sound_syllables(clip_id, f"{key}uh", GROUPS[key][0], 0.1, writes=GROUPS[key][1])
        elif key in ("ng", "nk", "ing"):
            verdicts = self._sound_codas(clip_id, key)
        else:
            phonemes, writes = GROUPS[key]
            verdicts = self._sound_phrases(clip_id, key, line["text"], phonemes, writes)
        chosen, good, status = choose(verdicts)
        if len(chosen.audio) < 0.24 * SAMPLE_RATE:
            # No clip under 0.15 s can ship, and the shortest sounds come out under it (`p` and
            # `t` at 0.12 s, the `er` cut from its phrase): the sound is stretched to 0.24 s,
            # as the vowels already are.
            chosen.audio = dsp.normalise(dsp.fade(lengthen(chosen.audio, 0.24), head=0.008, tail=0.05), -3.0)
            chosen.extra["stretched"] = True
        self.out.mkdir(parents=True, exist_ok=True)
        sf.write(self.out / f"{clip_id}.wav", chosen.audio, SAMPLE_RATE, subtype="PCM_16")
        report[clip_id] = self.entry(clip_id, line, chosen, good, status, len(verdicts), phonemes, len(chosen.audio) / SAMPLE_RATE)
        remember()
        print(f"  {clip_id:<58} {status:<6} {good}/{len(verdicts)} good  {len(chosen.audio)/SAMPLE_RATE:.2f}s  sounds {chosen.sounds!r}  {chosen.flags or ''}", flush=True)

    def _sound_vowels(self, clip_id: str, key: str, phonemes: str) -> list[Verdict]:
        """A vowel, cut out of a plain word that has it, as the old pipeline cut them (`sounds.VOWEL_WORDS`).

        Said alone, a vowel is whatever the model fancies (`ih` came out as `ee`, as a back vowel, and
        three times in a row). In `sit` it has consonants to hold it in place. The word has to be heard
        as itself first, then the vowel the sound listener timed is kept, its middle, and lengthened.
        Where the short i sits is recorded and preferred, not demanded: the range in `sounds.py` was
        measured on the old model's vowels, and this voice's own `i` sits a little lower.
        """
        sources = {"a": ("sat", "bad", "hat", "cap"), "e": ("bed", "set", "hen", "pet"),
                   "i": ("sit", "bid", "hit", "pin", "lid", "kid", "tin"), "o": ("hot", "pot", "sock", "top"),
                   "u": ("sun", "bud", "cup", "hut")}[key]
        verdicts: list[Verdict] = []
        takes = [(word, r) for r in range(3) for word in sources]
        for i, (word, _) in enumerate(takes):
            seed = self.seed_of(clip_id, i)
            raw = self.clone(f"{word}.", "calm", seed, 160)
            if raw is None:
                continue
            audio = self.tidy(raw, self.phonemes(word))
            heard = self.judge.words(audio)
            if letters_only(heard) != word:
                v = self._sound_verdict(clip_id, audio, seed, phonemes)
                v.flags.append(f"source word heard as {heard!r}")
                verdicts.append(v)
                continue
            all_toks = self.phones_timed(audio)
            vi = next((n for n, (t, _, _) in enumerate(all_toks) if reduce_sounds(t) and reduce_sounds(t)[0] in VOWEL_TOKENS), None)
            if vi is None:
                continue
            # The listener writes a vowel for a frame or two at its centre. The vowel itself runs from halfway to the
            # sounds around it, which is where the consonants have not finished bending it and have not begun to.
            _, vs, ve = all_toks[vi]
            centre = (vs + ve) / 2
            start = (all_toks[vi - 1][2] + centre) / 2 if vi else max(0.0, centre - 0.05)
            end = (centre + all_toks[vi + 1][1]) / 2 if vi + 1 < len(all_toks) else centre + 0.05
            piece = audio[int(start * SAMPLE_RATE): int(end * SAMPLE_RATE)]
            if len(piece) < 0.05 * SAMPLE_RATE:
                continue  # one listener frame is not a vowel anyone said
            cut = int(len(piece) * 0.15)
            piece = lengthen(piece[cut: len(piece) - cut], 0.4)
            piece = dsp.normalise(dsp.fade(piece, head=0.01, tail=0.1), -3.0)
            v = self._sound_verdict(clip_id, piece, seed, phonemes)
            v.understood = "V" in shape_of(v.sounds)
            v.error = 0.0 if v.understood else 1.0
            v.extra["source"] = word
            shape = dsp.vowel(piece)
            if shape is not None:
                v.extra["vowel"] = shape.describe()
                if key == "i":
                    (f1_lo, f1_hi), (f2_lo, f2_hi) = BETWEEN_I
                    v.extra["placed"] = f1_lo <= shape.whole[0] <= f1_hi and f2_lo <= shape.whole[1] <= f2_hi
                    v.error += abs(shape.whole[0] - 615) / 615 + abs(shape.whole[1] - 2360) / 2360
            verdicts.append(v)
            if sum(x.valid for x in verdicts) >= WANTED_GOOD:
                break
        return verdicts

    def _sound_syllables(self, clip_id: str, text: str, phonemes: str, breath: float, writes: set[str] | None = None) -> list[Verdict]:
        """A consonant: the syllable it is taught with (`buh`), cut where its vowel has had a tenth of a second, as the old clips were."""
        key = clip_id.split(".")[1]
        verdicts: list[Verdict] = []
        for i in range(MAX_TAKES):
            seed = self.seed_of(clip_id, i)
            raw = self.clone(text, "calm", seed, 120)
            if raw is None:
                continue
            audio = self.tidy(raw, None)
            toks = self.phones_timed(audio)
            if not toks:
                continue
            vowel_at = next((s for t, s, _ in toks if reduce_sounds(t) and reduce_sounds(t)[0] in VOWEL_TOKENS), None)
            if vowel_at is None:
                vowel_at = toks[-1][2]  # the breath is there even when the listener writes none of it
            piece = audio[: int((vowel_at + breath) * SAMPLE_RATE)]
            lone = audio[int(toks[0][1] * SAMPLE_RATE): int(max(toks[0][1], vowel_at - 0.03) * SAMPLE_RATE)]
            piece = dsp.normalise(dsp.fade(piece, head=0.008, tail=min(0.09, len(piece) / SAMPLE_RATE / 3)), -3.0)
            v = self._sound_verdict(clip_id, piece, seed, phonemes, check_voice=key not in ("x", "p", "t", "k", "ch"))
            shape = shape_of(v.sounds.replace("tɕ", "ʧ").replace("dʑ", "ʤ"))
            # The sound listener cannot tell `s` from `z` or `f` from `v`, and the hum ranges in `sounds.py` were measured on
            # the old model: in this voice they overlap. How much of the consonant is voiced does separate them (measured:
            # `s` 0.08 voiced, `z` and `v` 1.00, `g` about 0.55 against `k` at 0.0, `j` about 0.35 against `ch` at 0.0), so
            # that is the gate, and the hum is kept only as evidence in the report.
            frac = dsp.Pitch(lone).fraction if len(lone) > 0.04 * SAMPLE_RATE else None
            if frac is not None:
                v.extra["voicedShare"] = round(frac, 2)
                v.extra["humDb"] = round(hum(lone), 1)
            if writes:
                v.understood = shape in writes
            elif key in TWIN:
                shapes, least = TWIN[key]
                v.understood = shape in shapes and frac is not None and frac >= least
            else:
                v.understood = shape in {shape_of(w) + after for w in WRITTEN_AS.get(phonemes, (phonemes,)) for after in ("", "V")}
            v.error = 0.0 if v.understood else 1.0
            if key in VOICING and frac is not None:
                low, high = VOICING[key]
                if (low is not None and frac < low) or (high is not None and frac > high):
                    v.flags.append(f"voiced {frac:.0%} of the consonant, not the voicing of {key}")
            verdicts.append(v)
            if sum(x.valid for x in verdicts) >= WANTED_GOOD:
                break
        return verdicts

    def _sound_final_ks(self, clip_id: str) -> list[Verdict]:
        """The sound of `x`: a `k` and an `s` at the end of a word, cut from one (`box`, `fox`, `six`)."""
        verdicts: list[Verdict] = []
        for i in range(MAX_TAKES):
            seed = self.seed_of(clip_id, i)
            word = ("box", "fox", "six", "axe")[i % 4]
            raw = self.clone(f"{word}.", "calm", seed, 160)
            if raw is None:
                continue
            audio = self.tidy(raw, self.phonemes(word))
            toks = self.phones_timed(audio)
            k = next((n for n, (t, _, _) in enumerate(toks) if reduce_sounds(t) == "k"), None)
            s = next((n for n, (t, _, _) in enumerate(toks) if n > (k or 0) and reduce_sounds(t) == "s"), None)
            if k is None or s is None:
                continue
            start = (toks[k - 1][2] + (toks[k][1] + toks[k][2]) / 2) / 2 if k else toks[k][1]
            end = (toks[s][1] + toks[s][2]) / 2 + 0.05
            piece = audio[int(max(0.0, start) * SAMPLE_RATE): int(end * SAMPLE_RATE)]
            piece = dsp.normalise(dsp.fade(piece, head=0.008, tail=0.04), -3.0)
            v = self._sound_verdict(clip_id, piece, seed, "ks", check_voice=False)
            v.understood = shape_of(v.sounds.replace("tɕ", "ʧ")) in {"ks", "ksV"}
            v.error = 0.0 if v.understood else 1.0
            v.extra["source"] = word
            verdicts.append(v)
            if sum(x.valid for x in verdicts) >= WANTED_GOOD:
                break
        return verdicts

    def _sound_codas(self, clip_id: str, key: str) -> list[Verdict]:
        """`ng`, `nk` and `ing` end words and cannot be said first, so they are cut from the end of one (`ring`, `pink`)."""
        phonemes, writes = GROUPS[key]
        carriers = ("pink", "sink", "bank", "think") if key == "nk" else ("ring", "sing", "king", "wing")
        verdicts: list[Verdict] = []
        for i in range(MAX_TAKES):
            seed = self.seed_of(clip_id, i)
            word = carriers[i % len(carriers)]
            raw = self.clone(f"{word}.", "calm", seed, 160)
            if raw is None:
                continue
            audio = self.tidy(raw, self.phonemes(word))
            toks = self.phones_timed(audio)
            ng = next((n for n, (t, _, _) in enumerate(toks) if reduce_sounds(t) == "ŋ"), None)
            if ng is None:
                continue
            # As with a vowel, the listener writes `ŋ` for a frame at its centre; the sound runs from halfway to its neighbours.
            centre = (toks[ng][1] + toks[ng][2]) / 2
            before = toks[ng - 1] if ng else toks[ng]
            if key == "ing":
                start = (toks[ng - 2][2] + (before[1] + before[2]) / 2) / 2 if ng >= 2 else before[1]
                end = centre + 0.08
            elif key == "nk" and ng + 1 < len(toks):
                start = centre - 0.05
                end = (toks[ng + 1][1] + toks[ng + 1][2]) / 2 + 0.05
            else:
                start = centre - 0.05
                end = centre + 0.08
            piece = audio[int(max(0.0, start) * SAMPLE_RATE): int(min(len(audio) / SAMPLE_RATE, end) * SAMPLE_RATE)]
            piece = lengthen(piece, 0.22)
            piece = dsp.normalise(dsp.fade(piece, head=0.008, tail=0.04), -3.0)
            v = self._sound_verdict(clip_id, piece, seed, phonemes)
            v.understood = shape_of(v.sounds) in writes
            v.error = 0.0 if v.understood else 1.0
            v.extra["source"] = word
            verdicts.append(v)
            if sum(x.valid for x in verdicts) >= WANTED_GOOD:
                break
        return verdicts

    def _sound_phrases(self, clip_id: str, key: str, text: str, phonemes: str, writes: set[str]) -> list[Verdict]:
        """A group sound (`sh`, `oo`, `ing`): said in its 'as in' phrase and cut where the aligner hears its first word end."""
        verdicts: list[Verdict] = []
        for i in range(MAX_TAKES):
            seed = self.seed_of(clip_id, i)
            raw = self.clone(text, "calm", seed, 300)
            if raw is None:
                continue
            audio = self.tidy(raw, self.phonemes(text))
            spans = self.align(audio, text)
            if not spans:
                continue
            piece = audio[int(max(0.0, spans[0][0] - 0.01) * SAMPLE_RATE): int((spans[0][1] + 0.04) * SAMPLE_RATE)]
            if key in ("oo", "uu", "ow", "oy", "aw", "ar", "or", "er", "air"):
                piece = lengthen(piece, 0.3)
            piece = dsp.normalise(dsp.fade(piece, head=0.008, tail=0.04), -3.0)
            v = self._sound_verdict(clip_id, piece, seed, phonemes, check_voice=key not in ("sh", "ch", "th"))
            v.understood = shape_of(v.sounds.replace("tɕ", "ʧ").replace("dʑ", "ʤ")) in writes
            v.error = 0.0 if v.understood else 1.0
            v.extra["humDb"] = round(hum(piece), 1)
            verdicts.append(v)
            if sum(x.valid for x in verdicts) >= WANTED_GOOD:
                break
        return verdicts

    # -- maths pieces -------------------------------------------------------------
    def make_frame(self, line: dict, report: dict, remember) -> None:
        """A piece of a maths question, cut out of the whole sentence it belongs to, as `generate.make_frame` did."""
        clip_id = line["id"]
        frame = frames.parse(line["frame"])
        sentence = frame.sentence
        phonemes = self.phonemes(sentence)
        piece_phonemes = self.phonemes(frame.piece)
        words = sentence.split()
        first = len(frame.before.split()) if frame.before else 0
        last = first + len(frame.piece.split()) - 1
        verdicts: list[Verdict] = []
        for i in range(4):
            seed = self.seed_of(clip_id, i)
            raw = self.clone(sentence, "calm", seed, 500)
            if raw is None:
                continue
            levelled, gain = frames.level(raw)
            spans = self.align(raw, sentence)
            if not spans:
                continue
            cut = frames.trimmed(frames.piece_of(levelled, spans, first, last), frame)
            if frame.closes and piece_phonemes and ends_with_voice(piece_phonemes):
                cut = dsp.cut_hiss(cut)
            piece, lift = frames.lifted(cut)
            # A piece voiced all through can measure louder than the loudest 400 ms of its own
            # sentence, and the packer turns every piece up by the same amount, so it would ship
            # louder than a whole clip may be. It is turned down to its sentence's level.
            cap = max(0.0, dsp.momentary_loudness(piece) - frames.SENTENCE_LUFS)
            if cap > 0:
                piece = (piece * 10 ** (-cap / 20)).astype(np.float32)
            bounds = (max(0.12, 0.04 * count_sounds(piece_phonemes or frame.piece)), 0.7 * len(frame.piece.split()) + 1.0)
            v = inspect(piece, kind_of(clip_id), piece_phonemes, bounds=bounds, voiced=VOICED_WORD if len(frame.piece.split()) == 1 else 0.2)
            # A join is cut where the sentence is quietest, which is not quiet where one sound runs into the next: only the ends of
            # the sentence are held to being quiet, as in `generate.kept_flags`.
            v.flags = [f for f in v.flags if not (f.startswith("loud at start") and not frame.opens or f.startswith("loud at end") and not frame.closes)]
            v.seed, v.ref = seed, "calm"
            v.audio = piece
            v.extra |= {"source": "frame", "frame": line["frame"], "gainDb": round(gain, 1), "liftDb": round(lift, 1), "capDb": round(-cap, 1)}
            heard_on = inspect(self.tidy(levelled, phonemes), "line", phonemes, bounds=line_bounds(sentence))
            self.listen_sentence(heard_on, sentence, phonemes)
            v.heard, v.sounds, v.error, v.understood = heard_on.heard, heard_on.sounds, heard_on.error, heard_on.understood
            v.extra |= {k: heard_on.extra[k] for k in ("wordsOk", "wordMisses") if k in heard_on.extra}
            if piece_phonemes:
                edges = edge_inserts(reduce_sounds(self.judge.sounds(piece)), reduce_sounds(piece_phonemes))
                if any(edges):
                    v.extra["edges"] = list(edges)
            verdicts.append(v)
            if v.clean:
                break
        chosen, good, status = choose(verdicts)
        self.out.mkdir(parents=True, exist_ok=True)
        sf.write(self.out / f"{clip_id}.wav", frames.edged(chosen.audio), SAMPLE_RATE, subtype="PCM_16")
        entry = self.entry(clip_id, line, chosen, good, status, len(verdicts), piece_phonemes, len(chosen.audio) / SAMPLE_RATE)
        entry["sentence"] = sentence
        report[clip_id] = entry
        remember()
        print(f"  {clip_id:<58} {status:<6} {len(verdicts)} tried  {len(chosen.audio)/SAMPLE_RATE:.2f}s  heard {chosen.heard!r}  {chosen.flags or ''}", flush=True)

    # -- word times -------------------------------------------------------------
    @staticmethod
    def positive_spans(spans: list, seconds: float, least: float = 0.03) -> list:
        """Every word with a span of its own. The aligner sometimes gives a short word (`a`, `in`)
        no length at all, and the game would light it for no time: it is given `least` seconds,
        and the row is walked back from the end so nothing runs past the clip."""
        out: list = []
        prev = 0.0
        for s, e in spans:
            s = max(s, prev)
            e = max(e, s + least)
            out.append([s, e])
            prev = e
        limit = seconds
        for span in reversed(out):
            span[1] = min(span[1], limit)
            span[0] = min(span[0], span[1] - least)
            limit = span[0]
        return [[round(s, 3), round(e, 3)] for s, e in out]

    def fill_times(self, report: dict, remember) -> None:
        """Where each word of every sentence is, from the aligner hearing the master that was kept."""
        todo = [cid for cid, e in report.items() if e.get("kind") == "line" and "words" not in e and (self.out / f"{cid}.wav").exists()]
        if not todo:
            return
        print(f"aligning {len(todo)} sentences for word times", flush=True)
        bad = 0
        for start in range(0, len(todo), 16):
            batch = todo[start:start + 16]
            paths = [str(self.out / f"{cid}.wav") for cid in batch]
            texts = [report[cid]["text"] for cid in batch]
            try:
                results = self.aligner.generate(audio=paths, text=texts, language="English")
                spans_list = [[(i.start_time, i.end_time) for i in r] for r in results]
            except Exception:
                spans_list = [self.align(sf.read(p, dtype="float32", always_2d=True)[0].mean(axis=1), t) or [] for p, t in zip(paths, texts)]
            for cid, text, spans in zip(batch, texts, spans_list):
                e = report[cid]
                seconds = e["seconds"]
                if len(spans) != len(text.split()):
                    bad += 1
                    e["timesMismatch"] = f"{len(spans)} spans for {len(text.split())} words"
                    audio, _ = sf.read(self.out / f"{cid}.wav", dtype="float32", always_2d=True)
                    s, en = dsp.speech_bounds(audio.mean(axis=1))
                    lo, hi = s / SAMPLE_RATE, en / SAMPLE_RATE
                    weights = [max(1, len(w.strip(".,!?;:"))) for w in text.split()]
                    total = sum(weights)
                    at, spans = lo, []
                    for w in weights:
                        nxt = at + (hi - lo) * w / total
                        spans.append((at, nxt))
                        at = nxt
                if spans and (spans[0][0] > 0.22 or seconds - spans[-1][1] > 0.22):
                    # A take can open with a breath the trimmer kept: a third of a second of
                    # quiet noise before the first word, which the aligner hears through and
                    # times honestly. The master is cut to its words, a little of the breath
                    # kept at each end and faded, and the times move with the cut.
                    audio, _ = sf.read(self.out / f"{cid}.wav", dtype="float32", always_2d=True)
                    audio = audio.mean(axis=1)
                    lo = max(0.0, spans[0][0] - 0.06)
                    hi = min(seconds, spans[-1][1] + 0.08)
                    cut = dsp.fade(audio[int(lo * SAMPLE_RATE): int(hi * SAMPLE_RATE)], head=0.01, tail=0.03)
                    sf.write(self.out / f"{cid}.wav", cut, SAMPLE_RATE, subtype="PCM_16")
                    spans = [(s - lo, en - lo) for s, en in spans]
                    seconds = len(cut) / SAMPLE_RATE
                    e["seconds"] = round(seconds, 3)
                    e["breathTrim"] = [round(lo, 3), round(hi, 3)]
                e["words"] = self.positive_spans(times.in_clip(spans, 0.0, seconds), seconds)
            remember()
        print(f"word times done; {bad} sentences needed the fallback split", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="Make the game's clips with the Qwen3 voice.")
    ap.add_argument("--only", default="", help="comma-separated id patterns, as in 'word.*,letter.r'")
    ap.add_argument("--force", action="store_true", help="make clips that are already made")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="where the masters and report go")
    args = ap.parse_args()

    lines = json.loads(LINES.read_text())
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    report_path = out / "report.json"
    report: dict = {"clips": {}, "generator": GENERATOR_TAG, "voice": VOICE_TAG, "sampleRate": SAMPLE_RATE,
                    "models": {"speaker": {"repo": SPEAKER_REPO, "revision": SPEAKER_REVISION},
                               "designedWith": {"repo": DESIGN_REPO, "revision": DESIGN_REVISION},
                               "aligner": {"repo": ALIGNER_REPO, "revision": ALIGNER_REVISION},
                               "words": {"repo": WHISPER[0], "revision": WHISPER[1]},
                               "sounds": {"repo": PHONES[0], "revision": PHONES[1]}}}
    if report_path.exists():
        old = json.loads(report_path.read_text())
        if old.get("voice") == VOICE_TAG:
            report = old
    clips: dict = report.setdefault("clips", {})

    def remember() -> None:
        tmp = report_path.with_suffix(".tmp.json")
        tmp.write_text(json.dumps(report, ensure_ascii=False, indent=1))
        tmp.replace(report_path)

    patterns = [p.strip() for p in args.only.split(",") if p.strip()]
    wanted = [e for e in lines if not patterns or any(fnmatch.fnmatch(e["id"], p) for p in patterns)]
    todo = [e for e in wanted if args.force or e["id"] not in clips or not (out / f"{e['id']}.wav").exists()]
    print(f"{len(wanted)} wanted, {len(todo)} to make, {len(wanted) - len(todo)} already made", flush=True)

    with tempfile.TemporaryDirectory(prefix="ua-qwen-") as td:
        maker = Maker(out, Path(td))
        started = time.time()
        for n, line in enumerate(todo, 1):
            kind = kind_of(line["id"])
            print(f"[{n}/{len(todo)}] {line['id']}", flush=True)
            if "frame" in line:
                maker.make_frame(line, clips, remember)
            elif kind == "letter":
                maker.make_letter(line, clips, remember)
            elif kind == "sound":
                maker.make_sound(line, clips, remember)
            elif kind in ("word", "shout", "num"):
                maker.make_word(line, clips, remember)
            else:
                maker.make_sentence(line, clips, remember)
        if not patterns:
            maker.fill_times(clips, remember)
    review = [cid for cid, e in clips.items() if e.get("status") == "review"]
    print(f"done in {(time.time() - started) / 60:.1f} min; {len(clips)} clips in the report; review: {review}", flush=True)


if __name__ == "__main__":
    main()
