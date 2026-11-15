"""Tests of the times of the words of a sentence. They are made on lengths written by hand and need no model."""

import unittest

from times import in_clip, word_spans


def marks(phonemes: str, each: float = 0.1) -> list[tuple[float, float]]:
    """Every character of the phonemes lasts `each` seconds, one after the other from 0."""
    return [(round(i * each, 3), round((i + 1) * each, 3)) for i in range(len(phonemes))]


class WordSpans(unittest.TestCase):
    def test_a_word_begins_where_its_first_sound_begins_and_ends_where_its_last_ends(self):
        # "kˈæt sˈæt" is the cat sat: the word is four characters, then a space, then four more
        spans = word_spans("kˈæt sˈæt", marks("kˈæt sˈæt"))
        self.assertEqual([(round(a, 3), round(b, 3)) for a, b in spans], [(0.0, 0.4), (0.5, 0.9)])

    def test_the_mark_after_a_word_is_not_part_of_it(self):
        spans = word_spans("kˈæt, sˈæt.", marks("kˈæt, sˈæt."))
        self.assertEqual([(round(a, 3), round(b, 3)) for a, b in spans], [(0.0, 0.4), (0.6, 1.0)])

    def test_each_word_has_a_span_in_the_order_it_is_said(self):
        phonemes = "ðə kˈæt sˈæt ˈɑn ðə mˈæt."
        self.assertEqual(len(word_spans(phonemes, marks(phonemes))), 6)

    def test_the_lengths_of_the_model_are_not_all_the_same(self):
        phonemes = "ab cd"
        lengths = [(0.0, 0.2), (0.2, 0.3), (0.3, 0.5), (0.5, 0.9), (0.9, 1.0)]
        self.assertEqual(word_spans(phonemes, lengths), [(0.0, 0.3), (0.5, 1.0)])


class InClip(unittest.TestCase):
    def test_the_times_are_counted_from_where_the_clip_starts(self):
        self.assertEqual(in_clip([(0.5, 0.9), (1.0, 1.4)], 0.25, 2.0), [[0.25, 0.65], [0.75, 1.15]])

    def test_a_time_before_the_clip_or_after_it_is_held_to_its_ends(self):
        self.assertEqual(in_clip([(0.0, 0.4), (1.9, 2.5)], 0.2, 2.0), [[0.0, 0.2], [1.7, 2.0]])

    def test_the_times_are_to_a_thousandth_of_a_second(self):
        self.assertEqual(in_clip([(0.12345, 0.67891)], 0.0, 5.0), [[0.123, 0.679]])


if __name__ == "__main__":
    unittest.main()
