"""Tests of where a word is cut out of a list. They are made on envelopes written by hand and need no model.

    python -m unittest discover -s tools/voice -p 'test_*.py'
"""

from __future__ import annotations

import random
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from cuts import cut_marks, flows, quietest, with_carriers  # noqa: E402

STEP = 0.01


def envelope(seconds: float, gaps: list[tuple[float, float, float]], loud: float = 0.0) -> np.ndarray:
    """A level of `loud` dB all through, with each (from, to, level) stretch set to its own level."""
    levels = np.full(int(seconds / STEP), loud)
    for start, end, level in gaps:
        levels[int(start / STEP) : int(end / STEP)] = level
    return levels


class Flows(unittest.TestCase):
    def test_a_word_that_ends_in_voice_runs_into_one_that_begins_in_voice(self):
        self.assertTrue(flows("mˈæn.", "mˈæt."))
        self.assertTrue(flows("ðˈɛɹ.", "wˈɪn."))

    def test_a_silent_stop_at_either_side_is_a_gap(self):
        self.assertFalse(flows("kˈæt.", "mˈæn."))
        self.assertFalse(flows("mˈæn.", "kˈæt."))
        self.assertFalse(flows("mˈæp.", "ʧˈɪp."))

    def test_a_voiced_stop_is_not_a_gap_because_it_is_shut_with_a_hum(self):
        self.assertTrue(flows("dˈæd.", "mˈæn."))
        self.assertTrue(flows("mˈæn.", "bˈæɡ."))

    def test_a_hiss_is_not_a_gap_at_either_side(self):
        self.assertTrue(flows("hˈæs.", "mˈæn."))
        self.assertTrue(flows("mˈæn.", "sˈæt."))


class Carriers(unittest.TestCase):
    phonemes = {"cat": "kˈæt.", "man": "mˈæn.", "sun": "sˈʌn.", "pig": "pˈɪɡ.", "win": "wˈɪn.", "dog": "dˈɔɡ.", "bus": "bˈʌs."}
    carriers = ["tˈɪp.", "kˈɪt."]

    def carried(self, order: list[str], seed: int = 1) -> list[tuple[str | None, str]]:
        return with_carriers(order, self.phonemes, self.carriers, random.Random(seed))

    def test_the_words_come_in_the_order_given_and_a_carrier_is_nobody(self):
        items = self.carried(["man", "sun", "win"])
        self.assertEqual([key for key, _ in items if key is not None], ["man", "sun", "win"])
        for key, phonemes in items:
            if key is None:
                self.assertIn(phonemes, self.carriers)

    def test_two_words_that_would_run_together_have_a_carrier_between_them(self):
        items = self.carried(["man", "sun", "win"])
        self.assertEqual([key for key, _ in items], ["man", None, "sun", None, "win", None])

    def test_a_silent_stop_is_a_gap_already_so_no_carrier_is_put_there(self):
        items = self.carried(["man", "cat", "win", "pig"])
        # man|cat, cat|win and win|pig are gaps (cat begins and ends with a silent stop, pig begins with one)
        self.assertEqual([key for key, _ in items], ["man", "cat", "win", "pig", None])

    def test_a_voiced_stop_and_a_hiss_are_not_gaps_and_get_a_carrier(self):
        items = self.carried(["dog", "man", "win", "bus", "sun"])
        self.assertEqual([key for key, _ in items], ["dog", None, "man", None, "win", None, "bus", None, "sun", None])

    def test_the_breath_ends_on_a_carrier_so_that_no_word_that_is_kept_is_the_one_the_model_ends_on(self):
        self.assertIsNone(self.carried(["cat"])[-1][0])
        self.assertIsNone(self.carried(["man", "sun"])[-1][0])

    def test_the_same_seed_gives_the_same_carriers(self):
        self.assertEqual(self.carried(["man", "sun", "win"], 5), self.carried(["man", "sun", "win"], 5))

    def test_a_carrier_is_chosen_from_the_ones_given_and_a_list_of_one_always_gives_it(self):
        items = with_carriers(["man", "sun"], self.phonemes, ["kˈɪt."], random.Random(0))
        self.assertEqual([phonemes for key, phonemes in items if key is None], ["kˈɪt.", "kˈɪt."])


class Quietest(unittest.TestCase):
    def test_it_is_the_middle_of_a_gap(self):
        levels = envelope(1.0, [(0.40, 0.50, -60.0)])
        self.assertAlmostEqual(quietest(levels, STEP, 0.2, 0.8), 0.45, delta=0.011)

    def test_a_wide_gap_that_is_nearly_as_quiet_wins_over_a_narrow_one_that_is_a_little_deeper(self):
        levels = envelope(1.0, [(0.30, 0.32, -62.0), (0.50, 0.70, -58.0)])
        self.assertAlmostEqual(quietest(levels, STEP, 0.2, 0.9), 0.60, delta=0.011)

    def test_a_gap_much_deeper_than_the_rest_wins_even_if_it_is_narrow(self):
        levels = envelope(1.0, [(0.30, 0.32, -70.0), (0.50, 0.70, -40.0)])
        self.assertAlmostEqual(quietest(levels, STEP, 0.2, 0.9), 0.31, delta=0.011)

    def test_it_looks_only_between_the_two_times(self):
        levels = envelope(1.0, [(0.05, 0.15, -80.0), (0.45, 0.55, -50.0)])
        self.assertAlmostEqual(quietest(levels, STEP, 0.3, 0.7), 0.50, delta=0.011)

    def test_a_flat_stretch_is_cut_in_the_middle_and_a_window_with_nothing_in_it_is_the_middle_of_the_times(self):
        self.assertAlmostEqual(quietest(envelope(1.0, []), STEP, 0.2, 0.6), 0.40, delta=0.011)
        self.assertEqual(quietest(envelope(1.0, []), STEP, 0.5, 0.5), 0.5)


class CutMarks(unittest.TestCase):
    def test_the_first_word_has_a_little_before_it_and_the_last_a_little_after_it(self):
        marks = [(0.30, 0.50), (0.70, 0.90)]
        levels = envelope(1.5, [(0.50, 0.70, -60.0)])
        cuts = cut_marks(marks, levels, STEP, 1.5)
        self.assertAlmostEqual(cuts[0][0], 0.10, places=6)
        self.assertAlmostEqual(cuts[1][1], 1.20, places=6)

    def test_the_first_cannot_start_before_the_breath_and_the_last_cannot_end_after_it(self):
        cuts = cut_marks([(0.05, 0.25), (0.40, 0.60)], envelope(0.7, []), STEP, 0.7)
        self.assertEqual(cuts[0][0], 0.0)
        self.assertEqual(cuts[1][1], 0.7)

    def test_the_cut_between_two_words_is_the_same_for_both_and_lies_in_their_gap(self):
        marks = [(0.30, 0.50), (0.62, 0.90), (1.05, 1.30)]
        levels = envelope(1.6, [(0.52, 0.60, -60.0), (0.92, 1.03, -60.0)])
        cuts = cut_marks(marks, levels, STEP, 1.6)
        self.assertEqual(cuts[0][1], cuts[1][0])
        self.assertEqual(cuts[1][1], cuts[2][0])
        self.assertTrue(0.5 <= cuts[0][1] <= 0.62)
        self.assertTrue(0.9 <= cuts[1][1] <= 1.05)

    def test_a_cut_is_in_the_gap_and_not_halfway_between_the_marks_when_the_gap_is_to_one_side(self):
        marks = [(0.30, 0.50), (0.80, 1.00)]
        levels = envelope(1.5, [(0.52, 0.58, -60.0)])
        cut = cut_marks(marks, levels, STEP, 1.5)[0][1]
        self.assertAlmostEqual(cut, 0.55, delta=0.02)
        self.assertGreater(abs(cut - 0.65), 0.05)


if __name__ == "__main__":
    unittest.main()
