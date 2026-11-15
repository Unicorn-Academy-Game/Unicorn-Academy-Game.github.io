"""Tests of how a letter's sound is cut and judged. They need no model: the audio is made of tones and noise, and the listeners' words are written by hand."""

import unittest
import unittest.mock

import numpy as np

import sounds
from judge import shape_of
from speak import SAMPLE_RATE


def tone(hz: float, seconds: float) -> np.ndarray:
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return (0.5 * np.sin(2 * np.pi * hz * t) * (1 + 0.3 * np.sin(2 * np.pi * 5 * t))).astype(np.float32)


def hiss(seconds: float) -> np.ndarray:
    return (0.3 * np.random.default_rng(1).standard_normal(int(seconds * SAMPLE_RATE))).astype(np.float32)


class Placed(unittest.TestCase):
    """The short i has to be held between the model's plain short i and its `ee`, since a child told it is `uh` hears `a`, `u` and `i` as one sound."""

    def where(self, f1: float, f2: float):
        found = unittest.mock.Mock()
        found.whole = (f1, f2)
        return unittest.mock.patch("sounds.dsp.vowel", return_value=found)

    def test_a_short_i_between_the_plain_one_and_ee_is_in_place(self):
        with self.where(620, 2330):
            self.assertTrue(sounds.placed("ɪ", tone(220, 0.3)))

    def test_the_models_plain_short_i_is_not_bright_enough(self):
        with self.where(760, 2160):
            self.assertFalse(sounds.placed("ɪ", tone(220, 0.3)))

    def test_a_full_ee_is_too_high_because_pig_and_wig_would_be_taught_wrongly(self):
        with self.where(500, 2590):
            self.assertFalse(sounds.placed("ɪ", tone(220, 0.3)))

    def test_a_clip_with_too_little_voice_to_measure_is_not_in_place_for_i(self):
        with unittest.mock.patch("sounds.dsp.vowel", return_value=None):
            self.assertFalse(sounds.placed("ɪ", tone(220, 0.3)))

    def test_a_vowel_with_no_place_held_for_it_is_always_in_place(self):
        with self.where(1, 1):
            for vowel in ("æ", "ɛ", "ɑ", "ʌ", "ɒ"):
                self.assertTrue(sounds.placed(vowel, tone(220, 0.3)), vowel)

    def test_the_place_is_part_of_the_recipe_so_a_change_to_it_makes_the_clip_again(self):
        self.assertIn("between", sounds.recipe())


class Table(unittest.TestCase):
    def test_every_letter_has_a_sound_and_nothing_else_does(self):
        self.assertEqual("".join(sounds.SOUNDS), "abcdefghijklmnopqrstuvwxyz")

    def test_the_vowels_are_cut_from_words_and_every_other_letter_is_a_syllable(self):
        self.assertEqual({letter for letter, made in sounds.SOUNDS.items() if made.shape == "vowel"}, set("aeiou"))
        self.assertEqual({made.shape for letter, made in sounds.SOUNDS.items() if letter not in "aeiou"}, {"syllable"})

    def test_a_vowel_has_words_to_be_cut_from_and_each_word_has_the_vowel_once(self):
        for letter in "aeiou":
            vowel = sounds.SOUNDS[letter].phonemes
            self.assertGreaterEqual(len(sounds.VOWEL_WORDS[vowel]), 3, letter)
            for template, words in sounds.VOWEL_WORDS[vowel]:
                self.assertEqual(template.count(vowel), 1, template)
                self.assertTrue(words, template)

    def test_a_change_to_how_a_sound_is_made_is_a_change_to_its_recipe(self):
        before = sounds.recipe()
        self.assertEqual(before, sounds.recipe())
        with unittest.mock.patch.object(sounds, "VOWEL_SECONDS", 0.2):
            self.assertNotEqual(before, sounds.recipe())
        with unittest.mock.patch.dict(sounds.SOUNDS, {"b": sounds.Sound("b", "syllable", breath=0.2)}):
            self.assertNotEqual(before, sounds.recipe())


class Understood(unittest.TestCase):
    def test_a_consonant_is_understood_with_or_without_the_breath_after_it(self):
        for heard in ("b", "ʔ b", "b a", "b ʌ", "b aː"):
            self.assertTrue(sounds.understood("b", heard), heard)

    def test_a_consonant_with_a_vowel_in_front_of_it_is_not(self):
        for heard in ("a b", "ʔ a b a", "p a", ""):
            self.assertFalse(sounds.understood("b", heard), heard)

    def test_the_listener_writes_the_voiced_sounds_that_it_cannot_tell_from_the_unvoiced(self):
        self.assertTrue(sounds.understood("z", "s a"))
        self.assertTrue(sounds.understood("z", "z a"))
        self.assertFalse(sounds.understood("s", "z a"))

    def test_two_sounds_are_written_as_two(self):
        self.assertTrue(sounds.understood("x", "k s aː"))
        self.assertTrue(sounds.understood("q", "k w a"))
        self.assertTrue(sounds.understood("j", "dʒ a"))
        self.assertTrue(sounds.understood("h", "ħ a"))
        self.assertFalse(sounds.understood("x", "k a"))

    def test_a_vowel_only_has_to_be_a_vowel(self):
        for letter in "aeiou":
            self.assertTrue(sounds.understood(letter, "ʔ aː"), letter)
            self.assertFalse(sounds.understood(letter, "t"), letter)


class Shape(unittest.TestCase):
    def test_every_vowel_the_listener_can_write_is_one_vowel(self):
        self.assertEqual({shape_of(v) for v in ("a", "aː", "ɛ", "ʌ", "ɪ", "o", "ɑ")}, {"V"})
        self.assertEqual(shape_of("b a"), shape_of("b ʌ"))


class Hum(unittest.TestCase):
    def test_a_voice_is_louder_below_500_hz_than_a_hiss_and_a_hiss_is_not(self):
        self.assertGreater(sounds.hum(tone(200, 0.1)), 10)
        self.assertLess(sounds.hum(hiss(0.1)), -3)

    def test_z_and_v_need_a_hum_and_s_and_f_must_have_none(self):
        voiced, hissed = tone(200, 0.1) + 0.05 * hiss(0.1), hiss(0.1)
        for letter in "zv":
            self.assertTrue(sounds.hummed(letter, voiced), letter)
            self.assertFalse(sounds.hummed(letter, hissed), letter)
        for letter in "sf":
            self.assertTrue(sounds.hummed(letter, hissed), letter)
            self.assertFalse(sounds.hummed(letter, voiced), letter)

    def test_a_letter_with_no_rule_about_its_hum_is_not_asked(self):
        self.assertTrue(sounds.hummed("b", hiss(0.1)))
        self.assertTrue(sounds.hummed("b", tone(200, 0.1)))


class Cutting(unittest.TestCase):
    def test_a_short_sound_is_made_longer_and_a_long_one_is_left(self):
        short, long = tone(200, 0.1), tone(200, 0.5)
        made = sounds.lengthen(short, 0.25)
        self.assertAlmostEqual(len(made) / SAMPLE_RATE, 0.25, delta=0.04)
        self.assertIs(sounds.lengthen(long, 0.4), long)

    def test_a_sound_is_never_stretched_by_more_than_the_most(self):
        made = sounds.lengthen(tone(200, 0.05), 5.0)
        self.assertLessEqual(len(made) / SAMPLE_RATE, 0.05 * sounds.MOST_LENGTHENED * 1.1)

    def test_the_middle_of_a_sound_leaves_its_ends(self):
        audio = np.arange(1000, dtype=np.float32)
        kept = sounds.middle(audio, 0.6)
        self.assertEqual((len(kept), kept[0], kept[-1]), (600, 200, 799))

    def test_a_piece_is_cut_by_seconds(self):
        audio = np.arange(SAMPLE_RATE, dtype=np.float32)
        self.assertEqual(len(sounds.piece(audio, 0.25, 0.5)), SAMPLE_RATE // 4)


if __name__ == "__main__":
    unittest.main()
