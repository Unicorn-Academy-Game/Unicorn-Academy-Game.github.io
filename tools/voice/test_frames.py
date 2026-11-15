"""Tests of how a piece is cut out of a sentence and set to the level of it. They are made on tones and words written by hand and need no model.

    python -m unittest discover -s tools/voice -p 'test_*.py'
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dsp  # noqa: E402
import frames  # noqa: E402
from dsp import SAMPLE_RATE  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def tone(seconds: float, level: float = 0.3, hz: float = 200.0) -> np.ndarray:
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return level * np.sin(2 * np.pi * hz * t)


def sentence_of(words: list[float], gap: float = 0.1) -> tuple[np.ndarray, list[tuple[float, float]]]:
    """A sentence of tones for words, as long as each of `words` and with `gap` seconds of quiet between them, and where each word is."""
    parts: list[np.ndarray] = [np.zeros(int(0.2 * SAMPLE_RATE))]
    spans: list[tuple[float, float]] = []
    at = 0.2
    for i, seconds in enumerate(words):
        parts.append(tone(seconds, hz=180.0 + 20 * i))
        spans.append((at, at + seconds))
        at += seconds
        parts.append(np.zeros(int(gap * SAMPLE_RATE)))
        at += gap
    return np.concatenate(parts), spans


class Parsing(unittest.TestCase):
    def test_a_piece_in_the_middle_has_words_on_both_sides(self):
        frame = frames.parse("What is [thirty-four] plus five?")
        self.assertEqual((frame.before, frame.piece, frame.after), ("What is", "thirty-four", "plus five?"))
        self.assertEqual(frame.sentence, "What is thirty-four plus five?")
        self.assertFalse(frame.opens or frame.closes)

    def test_a_piece_at_the_front_opens_the_sentence(self):
        frame = frames.parse("[What is] five plus six?")
        self.assertTrue(frame.opens)
        self.assertFalse(frame.closes)

    def test_the_mark_that_ends_the_sentence_belongs_to_the_last_piece_and_not_to_a_piece_of_its_own(self):
        frame = frames.parse("What is five plus [five]?")
        self.assertEqual((frame.piece, frame.after), ("five?", ""))
        self.assertTrue(frame.closes)
        self.assertEqual(frame.sentence, "What is five plus five?")

    def test_a_sentence_has_one_piece_and_it_is_not_empty(self):
        for bad in ("What is five plus six?", "What is [five] plus [six]?", "What is [] plus six?", "[What is five plus six?"):
            with self.assertRaises(ValueError, msg=bad):
                frames.parse(bad)


class Phonemes(unittest.TestCase):
    def test_the_piece_is_counted_in_words_of_the_whole_sentence(self):
        sound = {"What is": "wˈʌt ɪz", "thirty-four": "θˈɜɹɾi fˈɔɹ", "plus five?": "plˈʌs fˈIv?"}
        spoken = frames.phonemes_of(frames.parse("What is [thirty-four] plus five?"), sound.__getitem__)
        self.assertEqual(spoken.phonemes, "wˈʌt ɪz θˈɜɹɾi fˈɔɹ plˈʌs fˈIv?")
        self.assertEqual((spoken.first, spoken.last, spoken.piece), (2, 3, "θˈɜɹɾi fˈɔɹ"))

    def test_a_piece_that_opens_the_sentence_starts_at_the_first_word(self):
        sound = {"What is": "wˈʌt ɪz", "five plus six?": "fˈIv plˈʌs sˈɪks?"}
        spoken = frames.phonemes_of(frames.parse("[What is] five plus six?"), sound.__getitem__)
        self.assertEqual((spoken.first, spoken.last), (0, 1))

    def test_a_piece_that_ends_the_sentence_ends_at_the_last_word_with_the_mark_on_it(self):
        sound = {"What is five plus": "wˈʌt ɪz fˈIv plˈʌs", "five?": "fˈIv?"}
        spoken = frames.phonemes_of(frames.parse("What is five plus [five]?"), sound.__getitem__)
        self.assertEqual((spoken.first, spoken.last, spoken.piece), (4, 4, "fˈIv?"))

    def test_a_piece_that_has_the_same_words_as_another_part_is_still_found_by_where_it_is(self):
        sound = {"five plus": "fˈIv plˈʌs", "five?": "fˈIv?"}
        spoken = frames.phonemes_of(frames.parse("five plus [five]?"), sound.__getitem__)
        self.assertEqual((spoken.first, spoken.last), (2, 2))


class Level(unittest.TestCase):
    def test_the_loudest_stretch_of_a_sentence_is_set_to_the_level_of_every_sentence(self):
        for level in (0.05, 0.2):
            made, gain = frames.level(tone(1.0, level))
            self.assertAlmostEqual(dsp.momentary_loudness(made), frames.SENTENCE_LUFS, places=3)
            self.assertAlmostEqual(gain, frames.SENTENCE_LUFS - dsp.momentary_loudness(tone(1.0, level)), places=3)

    def test_a_sentence_keeps_the_levels_of_its_words_against_each_other(self):
        audio = np.concatenate([tone(0.5, 0.4), tone(0.5, 0.1)])
        made, _ = frames.level(audio)
        self.assertAlmostEqual(dsp.peak(made) / dsp.peak(made[: len(made) // 2]), 1.0, places=3)
        self.assertAlmostEqual(dsp.peak(made[len(made) // 2 :]) / dsp.peak(made[: len(made) // 2]), 0.25, places=3)

    def test_a_sentence_with_a_tall_peak_is_turned_up_less_than_the_level_and_never_past_the_headroom(self):
        audio = tone(1.0, 0.05)
        audio[1000] = 0.9
        made, gain = frames.level(audio)
        self.assertLessEqual(dsp.peak(made), frames.HEADROOM + 1e-6)
        self.assertLess(dsp.momentary_loudness(made), frames.SENTENCE_LUFS)
        self.assertLess(gain, frames.SENTENCE_LUFS - dsp.momentary_loudness(audio))

    def test_a_piece_more_than_the_most_under_its_sentence_is_turned_up_to_that(self):
        at_the_level, _ = frames.level(tone(0.5, 0.2))
        for under in (8.0, 12.0):
            made, lift = frames.lifted(at_the_level * 10 ** (-under / 20))
            self.assertAlmostEqual(dsp.momentary_loudness(made), frames.SENTENCE_LUFS - frames.MOST_UNDER, places=2)
            self.assertAlmostEqual(lift, under - frames.MOST_UNDER, places=2)

    def test_a_piece_that_is_not_more_than_the_most_under_is_left_alone(self):
        loud, _ = frames.level(tone(0.5, 0.2))
        for under in (0.0, 3.0, frames.MOST_UNDER):
            piece = loud * 10 ** (-under / 20)
            made, lift = frames.lifted(piece)
            self.assertEqual(lift, 0.0)
            np.testing.assert_array_equal(made, piece)

    def test_a_piece_is_never_turned_up_past_the_headroom(self):
        piece, _ = frames.level(tone(0.5, 0.2))
        piece = piece * 10 ** (-20 / 20)
        piece[100] = 0.5
        made, lift = frames.lifted(piece)
        self.assertLessEqual(dsp.peak(made), frames.HEADROOM + 1e-6)
        self.assertGreaterEqual(lift, 0.0)

    def test_the_manifest_check_allows_a_piece_a_little_more_than_the_most_under_and_no_more(self):
        text = (ROOT / "tools/assets/check/speech.ts").read_text()
        found = re.search(r"const MAX_QUIET_PIECE = (\d+);", text)
        self.assertIsNotNone(found, "tools/assets/check/speech.ts has no MAX_QUIET_PIECE")
        self.assertEqual(float(found.group(1)), frames.MOST_UNDER + 1, "one LU for what the encoder and the limiter do")

    def test_the_level_is_the_one_the_packer_is_told(self):
        text = (ROOT / "src/shared/audio.ts").read_text()
        found = re.search(r"export const PIECE_LUFS = (-?\d+(?:\.\d+)?);", text)
        self.assertIsNotNone(found, "src/shared/audio.ts has no PIECE_LUFS")
        self.assertEqual(float(found.group(1)), frames.SENTENCE_LUFS)


class Cutting(unittest.TestCase):
    def test_a_piece_is_cut_in_the_quiet_between_its_words_and_the_words_next_to_them(self):
        audio, spans = sentence_of([0.3, 0.4, 0.3, 0.3])
        piece = frames.piece_of(audio, spans, 1, 2)
        # The two words in the middle are 0.7 s of sound and the 0.1 s of quiet between them, with the quiet on either side cut in half.
        self.assertAlmostEqual(len(piece) / SAMPLE_RATE, 0.4 + 0.1 + 0.3 + 0.1, delta=0.03)
        self.assertGreater(dsp.peak(piece[: int(0.07 * SAMPLE_RATE)]), 0.0, "and the first word follows it")
        self.assertLess(dsp.peak(piece[: int(0.02 * SAMPLE_RATE)]), 1e-6, "it starts in the quiet before its first word")
        self.assertLess(dsp.peak(piece[-int(0.02 * SAMPLE_RATE) :]), 1e-6, "and ends in the quiet after its last")

    def test_the_pieces_of_a_sentence_put_together_are_the_sentence_from_the_first_cut_to_the_last(self):
        audio, spans = sentence_of([0.3, 0.4, 0.3, 0.3])
        pieces = [frames.piece_of(audio, spans, first, last) for first, last in ((0, 0), (1, 2), (3, 3))]
        whole = np.concatenate(pieces)
        start = int((spans[0][0] - 0.2) * SAMPLE_RATE)
        np.testing.assert_allclose(whole, audio[start : start + len(whole)])


class Mastering(unittest.TestCase):
    def padded(self) -> np.ndarray:
        return np.concatenate([np.zeros(int(0.1 * SAMPLE_RATE)), tone(0.3), np.zeros(int(0.1 * SAMPLE_RATE))])

    def test_the_quiet_is_cut_off_where_the_piece_starts_or_ends_the_sentence_and_nowhere_else(self):
        piece = self.padded()
        middle = frames.trimmed(piece, frames.parse("What is [thirty-four] plus five?"))
        opening = frames.trimmed(piece, frames.parse("[What is] five plus six?"))
        closing = frames.trimmed(piece, frames.parse("What is five plus [five]?"))
        self.assertEqual(len(middle), len(piece), "a join is left as it was cut")
        kept = int(0.012 * SAMPLE_RATE)
        cut = int(0.1 * SAMPLE_RATE) - kept
        self.assertAlmostEqual(len(piece) - len(opening), cut, delta=2)
        self.assertAlmostEqual(len(piece) - len(closing), cut, delta=2)
        self.assertTrue(np.all(opening[-int(0.05 * SAMPLE_RATE) :] == 0), "the end of a piece that opens the sentence is a join")
        self.assertTrue(np.all(closing[: int(0.05 * SAMPLE_RATE)] == 0), "the front of a piece that closes it is a join")

    def test_a_piece_rises_from_nothing_and_falls_to_nothing_and_is_otherwise_untouched(self):
        made = frames.edged(tone(0.3))
        self.assertEqual(made[0], 0.0)
        self.assertLess(abs(made[-1]), 1e-3)
        middle = slice(int(0.01 * SAMPLE_RATE), -int(0.01 * SAMPLE_RATE))
        np.testing.assert_array_equal(made[middle], tone(0.3)[middle])


if __name__ == "__main__":
    unittest.main()
