"""Tests of how a question is put together from its clips and measured. They are made on tones and need no model.

    python -m unittest discover -s tools/voice -p 'test_*.py'
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import questions  # noqa: E402
from dsp import SAMPLE_RATE  # noqa: E402


def tone(seconds: float, level: float = 0.3) -> np.ndarray:
    t = np.arange(round(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return (level * np.sin(2 * np.pi * 200 * t)).astype(np.float32)


def quiet(seconds: float) -> np.ndarray:
    return np.zeros(round(seconds * SAMPLE_RATE), dtype=np.float32)


class LayingOut(unittest.TestCase):
    def test_each_clip_begins_when_the_one_before_it_ends_and_the_quiet_after_it_is_the_one_it_is_given(self):
        audio = questions.lay_out([tone(0.1), tone(0.1), tone(0.1)], [0.0, 0.3, 0.3])
        self.assertEqual(len(audio), round(0.1 * SAMPLE_RATE) * 3 + round(0.6 * SAMPLE_RATE))
        np.testing.assert_array_equal(audio[: round(0.2 * SAMPLE_RATE)], np.concatenate([tone(0.1), tone(0.1)]))
        self.assertEqual(float(np.abs(audio[round(0.2 * SAMPLE_RATE) : round(0.5 * SAMPLE_RATE)]).max()), 0.0)

    def test_the_quiet_the_exporter_writes_is_the_game_s_own(self):
        exporter = (Path(__file__).resolve().parent / "export-questions.ts").read_text()
        self.assertIn("runsOn(id) ? 0 : GAP", exporter, "the quiet after a clip is the game's own GAP and runsOn, and not a number written again here")


class DeadAir(unittest.TestCase):
    def test_a_quiet_inside_a_question_is_dead_air_when_it_is_long_enough_to_hear(self):
        audio = np.concatenate([tone(0.2), quiet(0.3), tone(0.2)])
        self.assertAlmostEqual(questions.dead_air(audio), 0.3, delta=0.02)

    def test_a_short_quiet_is_a_breath_and_not_dead_air(self):
        audio = np.concatenate([tone(0.2), quiet(0.05), tone(0.2)])
        self.assertEqual(questions.dead_air(audio), 0.0)

    def test_the_quiet_before_the_first_sound_and_after_the_last_is_not_counted(self):
        audio = np.concatenate([quiet(0.5), tone(0.2), quiet(0.5)])
        self.assertEqual(questions.dead_air(audio), 0.0)

    def test_every_long_quiet_is_counted(self):
        audio = np.concatenate([tone(0.2), quiet(0.3), tone(0.2), quiet(0.2), tone(0.2)])
        self.assertAlmostEqual(questions.dead_air(audio), 0.5, delta=0.03)


class Sampling(unittest.TestCase):
    def asked(self) -> list[dict]:
        return [{"strand": strand, "level": level, "prompt": f"{strand} {level} {i}"} for strand, n in (("add", 30), ("shape", 3)) for level in (1, 2) for i in range(n)]

    def test_every_strand_and_level_is_in_a_small_sample(self):
        picked = questions.sample_of(self.asked(), 8, 1)
        self.assertEqual(len(picked), 8)
        self.assertEqual({(q["strand"], q["level"]) for q in picked}, {("add", 1), ("add", 2), ("shape", 1), ("shape", 2)})

    def test_it_is_the_same_sample_every_time_and_a_different_one_for_another_seed(self):
        a = [q["prompt"] for q in questions.sample_of(self.asked(), 8, 1)]
        self.assertEqual(a, [q["prompt"] for q in questions.sample_of(self.asked(), 8, 1)])
        self.assertNotEqual(a, [q["prompt"] for q in questions.sample_of(self.asked(), 8, 2)])

    def test_a_sample_larger_than_what_there_is_is_all_of_it(self):
        self.assertEqual(len(questions.sample_of(self.asked(), 1000, 1)), 66)


if __name__ == "__main__":
    unittest.main()
