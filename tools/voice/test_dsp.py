"""Checks on the cutting in `dsp.py`, with made-up sound, so that a change to it is seen before it is heard.

    python -m unittest discover -s tools/voice -p 'test_*.py'
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dsp  # noqa: E402

RATE = dsp.SAMPLE_RATE


def voice(seconds: float, hz: float = 200.0) -> np.ndarray:
    """A sound with a voice's pitch and its overtones, which the pitch tracker takes for a vowel."""
    t = np.arange(int(seconds * RATE)) / RATE
    wave = sum(np.sin(2 * np.pi * hz * k * t) / k for k in range(1, 12))
    return (0.4 * wave / np.max(np.abs(wave))).astype(np.float32)


def hiss(seconds: float, level: float) -> np.ndarray:
    """Noise with nothing below 4 kHz, as an `s` is."""
    noise = np.random.default_rng(1).standard_normal(int(seconds * RATE))
    spectrum = np.fft.rfft(noise)
    spectrum[np.fft.rfftfreq(len(noise), 1 / RATE) < 4000] = 0
    high = np.fft.irfft(spectrum, len(noise))
    return (level * high / np.max(np.abs(high))).astype(np.float32)


def quiet(seconds: float) -> np.ndarray:
    return np.zeros(int(seconds * RATE), dtype=np.float32)


class CutHiss(unittest.TestCase):
    def test_a_hiss_after_the_voice_is_cut_away_and_the_voice_is_kept(self) -> None:
        clip = np.concatenate([voice(0.4), hiss(0.12, 0.2)])
        cut = dsp.cut_hiss(clip)
        self.assertLess(len(cut) / RATE, 0.4 + 0.06)
        self.assertGreater(len(cut) / RATE, 0.38)
        # What is left holds none of the hiss: nothing above 4 kHz in the last 50 ms but the fall of the cut itself.
        tail = cut[-int(0.05 * RATE) :]
        spectrum = np.abs(np.fft.rfft(tail * np.hanning(len(tail)))) ** 2
        high = spectrum[np.fft.rfftfreq(len(tail), 1 / RATE) > 4000].sum() / spectrum.sum()
        self.assertLess(high, 0.2)

    def test_a_clip_that_ends_when_the_voice_does_is_not_touched(self) -> None:
        clip = voice(0.4)
        self.assertEqual(len(dsp.cut_hiss(clip)), len(clip))

    def test_a_voice_that_dies_away_into_quiet_is_not_touched(self) -> None:
        t = np.arange(int(0.5 * RATE)) / RATE
        clip = np.concatenate([voice(0.5) * np.exp(-4 * t).astype(np.float32), quiet(0.1)])
        self.assertEqual(len(dsp.cut_hiss(clip)), len(clip))

    def test_a_hiss_too_quiet_to_hear_is_left_alone(self) -> None:
        clip = np.concatenate([voice(0.4), hiss(0.12, 0.002)])
        self.assertEqual(len(dsp.cut_hiss(clip)), len(clip))

    def test_a_clip_with_no_voice_is_not_touched(self) -> None:
        clip = hiss(0.3, 0.2)
        self.assertEqual(len(dsp.cut_hiss(clip)), len(clip))


class TrimSpeech(unittest.TestCase):
    def test_quiet_before_and_after_is_cut_and_a_little_is_kept(self) -> None:
        clip = np.concatenate([quiet(0.3), voice(0.3), quiet(0.3)])
        trimmed = dsp.trim_speech(clip)
        self.assertAlmostEqual(len(trimmed) / RATE, 0.3 + 0.006 + 0.02, delta=0.02)

    def test_a_soft_consonant_in_front_of_a_vowel_is_kept(self) -> None:
        # An `s` 30 dB under the vowel: it is not where the speech "begins", but a listener needs it.
        clip = np.concatenate([quiet(0.2), hiss(0.1, 0.4 * 10 ** (-30 / 20)), voice(0.3), quiet(0.2)])
        trimmed = dsp.trim_speech(clip)
        self.assertGreater(len(trimmed) / RATE, 0.4 - 0.02)


class DeepShare(unittest.TestCase):
    def test_a_voice_at_half_the_pitch_is_deep_all_through(self) -> None:
        self.assertGreater(dsp.deep_share(voice(0.4, 90.0)), 0.9)

    def test_a_voice_at_its_own_pitch_is_not_deep_at_all(self) -> None:
        self.assertEqual(dsp.deep_share(voice(0.4, 200.0)), 0.0)

    def test_the_share_is_of_the_loud_part_so_a_deep_tail_is_a_share_of_it(self) -> None:
        share = dsp.deep_share(np.concatenate([voice(0.3, 200.0), voice(0.1, 90.0)]))
        self.assertGreater(share, 0.1)
        self.assertLess(share, 0.45)

    def test_a_deep_stretch_too_quiet_to_matter_is_not_counted(self) -> None:
        tail = voice(0.2, 90.0) * 0.1
        self.assertEqual(dsp.deep_share(np.concatenate([voice(0.4, 200.0), tail])), 0.0)

    def test_a_clip_with_no_voice_is_not_deep(self) -> None:
        self.assertEqual(dsp.deep_share(quiet(0.3)), 0.0)
        self.assertEqual(dsp.deep_share(hiss(0.3, 0.2)), 0.0)

    def test_a_clip_shorter_than_the_tracker_can_hear_is_not_deep(self) -> None:
        self.assertEqual(dsp.deep_share(voice(0.02, 90.0)), 0.0)


class Loudness(unittest.TestCase):
    @staticmethod
    def tones(samples: int) -> np.ndarray:
        """Three tones and a slow fade, the signal that `momentaryLoudness` in tools/audio/loudness.ts was asked about to get the numbers below."""
        t = np.arange(samples) / RATE
        wave = 0.3 * np.sin(2 * np.pi * 220 * t) + 0.2 * np.sin(2 * np.pi * 1500 * t) + 0.1 * np.sin(2 * np.pi * 6000 * t)
        return (wave * (1 - np.arange(samples) / samples)).astype(np.float32)

    def test_it_measures_what_the_packer_measures(self) -> None:
        # Both numbers are what `momentaryLoudness` in tools/audio/loudness.ts says of the same samples (the second is shorter than a block).
        whole = self.tones(RATE // 2)
        self.assertAlmostEqual(dsp.momentary_loudness(whole), -12.062312, delta=0.001)
        self.assertAlmostEqual(dsp.momentary_loudness(whole[:3000]), -14.411815, delta=0.001)

    def test_it_is_the_loudest_stretch_and_not_the_average(self) -> None:
        loud = self.tones(RATE // 2)
        padded = np.concatenate([loud, np.zeros(RATE * 2, dtype=np.float32)])
        self.assertAlmostEqual(dsp.momentary_loudness(padded), dsp.momentary_loudness(loud), delta=0.001)

    def test_the_loudest_stretch_is_found_when_it_starts_50_milliseconds_in(self) -> None:
        burst = (0.2 * np.sin(2 * np.pi * 1000 * np.arange(RATE * 4 // 10) / RATE)).astype(np.float32)
        late = np.concatenate([quiet(0.05), burst, quiet(0.5)])
        self.assertAlmostEqual(dsp.momentary_loudness(late), dsp.momentary_loudness(burst), delta=0.001)

    def test_twice_the_level_is_six_decibels_louder(self) -> None:
        clip = self.tones(RATE // 2)
        self.assertAlmostEqual(dsp.momentary_loudness(clip * 2) - dsp.momentary_loudness(clip), 6.0206, delta=0.001)

    def test_silence_has_no_loudness(self) -> None:
        self.assertEqual(dsp.momentary_loudness(quiet(0.5)), float("-inf"))


if __name__ == "__main__":
    unittest.main()
