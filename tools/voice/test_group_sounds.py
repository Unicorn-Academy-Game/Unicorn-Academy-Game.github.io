"""Tests of how the sound of a group of letters is cut and judged. They need no model: the speaker is a stand-in that makes a tone for each phoneme, and the listeners' words are written by hand."""

import copy
import json
import unittest
import unittest.mock
from pathlib import Path

import numpy as np

import group_sounds
import sounds
from speak import FRAME_SECONDS, SAMPLE_RATE, Spoken

LINES = Path(__file__).resolve().parent / "lines.json"


def tone(hz: float, seconds: float) -> np.ndarray:
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return (0.5 * np.sin(2 * np.pi * hz * t) * (1 + 0.3 * np.sin(2 * np.pi * 5 * t))).astype(np.float32)


def hiss(seconds: float) -> np.ndarray:
    return (0.3 * np.random.default_rng(1).standard_normal(int(seconds * SAMPLE_RATE))).astype(np.float32)


class Speaker:
    """Says every phoneme as a tone of 100 ms, and records what it was asked to say."""

    FRAMES = 4

    def __init__(self) -> None:
        self.said: list[tuple[str, float, int, int]] = []

    def say(self, phonemes: str, speed: float, seed: int, style: int = 0) -> Spoken:
        self.said.append((phonemes, speed, seed, style))
        seconds = len(phonemes) * self.FRAMES * FRAME_SECONDS + 0.2
        return Spoken(audio=tone(200, seconds), frames=[3, *([self.FRAMES] * len(phonemes)), 1])


class Table(unittest.TestCase):
    def test_the_groups_are_the_group_sounds_the_game_asks_for(self):
        asked = {clip["id"].removeprefix("sound.") for clip in json.loads(LINES.read_text()) if clip["id"].startswith("sound.")}
        self.assertEqual(set(group_sounds.GROUPS), asked - set(sounds.SOUNDS))

    def test_a_group_that_is_cut_from_words_has_several_and_a_breath_has_none(self):
        for key, group in group_sounds.GROUPS.items():
            if group.shape == "breath":
                self.assertEqual(group.carriers, (), key)
                self.assertIn(key, group_sounds.HUM, key)
            else:
                self.assertGreaterEqual(len(group.carriers), 4, key)
                for template, written in group.carriers:
                    self.assertTrue(written, template)

    def test_each_word_has_the_sound_once_and_a_coda_ends_with_it(self):
        for key, group in group_sounds.GROUPS.items():
            for template, _ in group.carriers:
                self.assertEqual(template.count(group.phonemes), 1, f"{key} {template}")
                if group.shape == "coda":
                    self.assertTrue(template.endswith(group.phonemes), f"{key} {template}")
                if group.shape == "end":
                    self.assertTrue(template.endswith(group.phonemes), f"{key} {template}")

    def test_every_shape_has_a_speed(self):
        self.assertEqual({group.shape for group in group_sounds.GROUPS.values()}, set(group_sounds.SPEEDS))

    def test_a_change_to_how_a_sound_is_made_is_a_change_to_its_recipe(self):
        before = copy.deepcopy(group_sounds.recipe())
        self.assertEqual(before, group_sounds.recipe())
        with unittest.mock.patch.dict(group_sounds.SPEEDS, {"end": (0.4,)}):
            self.assertNotEqual(before, group_sounds.recipe())
        with unittest.mock.patch.dict(group_sounds.GROUPS, {"sh": group_sounds.Group("ʃ", "breath", breath=0.2)}):
            self.assertNotEqual(before, group_sounds.recipe())
        with unittest.mock.patch.dict(group_sounds.HUM, {"sh": (None, -20.0)}):
            self.assertNotEqual(before, group_sounds.recipe())


class Understood(unittest.TestCase):
    def test_a_consonant_group_is_understood_with_or_without_the_breath_after_it(self):
        for key, heard in (("sh", "ʃ"), ("sh", "ʃ a"), ("ch", "tʃ a"), ("ch", "ʧ ʌ")):
            self.assertTrue(group_sounds.understood(key, heard), f"{key} {heard}")

    def test_a_consonant_group_that_is_heard_as_another_sound_is_not(self):
        for key, heard in (("sh", "s a"), ("sh", "a ʃ"), ("ch", "ʃ a"), ("ch", "k a"), ("sh", "")):
            self.assertFalse(group_sounds.understood(key, heard), f"{key} {heard}")

    def test_the_listener_cannot_tell_th_from_f_or_s_so_all_three_do(self):
        for heard in ("θ a", "f a", "s a"):
            self.assertTrue(group_sounds.understood("th", heard), heard)
        self.assertFalse(group_sounds.understood("th", "d a"))
        self.assertFalse(group_sounds.understood("th", "z a"))

    def test_a_vowel_group_only_has_to_be_a_vowel_and_may_have_its_glide_or_r(self):
        for key in ("oo", "uu", "aw"):
            self.assertTrue(group_sounds.understood(key, "ʔ aː"), key)
            self.assertFalse(group_sounds.understood(key, "t"), key)
        self.assertTrue(group_sounds.understood("ow", "a ʊ"))
        self.assertTrue(group_sounds.understood("ow", "a w"))
        self.assertTrue(group_sounds.understood("oy", "ɔ j"))
        for key in ("ar", "or", "er", "air"):
            self.assertTrue(group_sounds.understood(key, "ɑ ɹ"), key)
            self.assertTrue(group_sounds.understood(key, "ɑ"), key)
            self.assertFalse(group_sounds.understood(key, "ɹ"), key)

    def test_a_vowel_with_a_consonant_in_front_is_not_the_sound(self):
        for key in ("oo", "ow", "ar"):
            self.assertFalse(group_sounds.understood(key, "b a"), key)

    def test_the_sounds_that_end_a_word_need_the_nasal_in_them(self):
        self.assertTrue(group_sounds.understood("ng", "ŋ"))
        self.assertTrue(group_sounds.understood("ing", "ɪ ŋ"))
        self.assertTrue(group_sounds.understood("nk", "ŋ k"))
        self.assertTrue(group_sounds.understood("nk", "n k"))
        self.assertFalse(group_sounds.understood("ing", "ɪ"))
        self.assertFalse(group_sounds.understood("nk", "k"))
        self.assertFalse(group_sounds.understood("ng", "m"))


class Hum(unittest.TestCase):
    def test_a_hiss_is_taken_for_sh_and_ch_and_a_voice_is_not(self):
        for key in ("sh", "ch"):
            self.assertTrue(group_sounds.hum_ok(key, hiss(0.1)), key)
            self.assertFalse(group_sounds.hum_ok(key, tone(200, 0.1) + 0.05 * hiss(0.1)), key)

    def test_th_has_a_little_under_the_hiss_and_not_a_voice_nor_none(self):
        self.assertTrue(group_sounds.hum_ok("th", hiss(0.1)))
        self.assertFalse(group_sounds.hum_ok("th", tone(200, 0.1) + 0.05 * hiss(0.1)))
        bright = np.diff(hiss(0.1), n=3).astype(np.float32)
        self.assertFalse(group_sounds.hum_ok("th", bright))

    def test_a_group_with_no_rule_about_its_hum_is_not_asked(self):
        self.assertTrue(group_sounds.hum_ok("ow", hiss(0.1)))
        self.assertTrue(group_sounds.hum_ok("ow", tone(200, 0.1)))


class Cutting(unittest.TestCase):
    def cuts(self, key: str, round: int = 0) -> tuple[list[sounds.Cut], Speaker]:
        speaker = Speaker()
        return list(group_sounds.cuts(speaker, key, round)), speaker

    def test_a_breath_is_the_sound_and_a_breath_of_the_vowel_and_keeps_the_sound_alone_to_be_measured(self):
        made, speaker = self.cuts("sh")
        self.assertEqual(len(made), len(sounds.ROUNDS[0]) * len(group_sounds.SPEEDS["breath"]))
        self.assertEqual({phonemes for phonemes, *_ in speaker.said}, {"ʃˈʌ"})
        for cut in made:
            self.assertIsNotNone(cut.lone)
            self.assertIsNone(cut.whole)
            self.assertAlmostEqual(len(cut.lone) / SAMPLE_RATE, 0.1, delta=0.01)
            self.assertAlmostEqual(len(cut.audio) / SAMPLE_RATE, 0.2, delta=0.01)

    def test_a_vowel_at_the_end_of_a_word_is_cut_from_where_it_begins_to_where_the_word_ends(self):
        made, speaker = self.cuts("ow")
        words = len(group_sounds.GROUPS["ow"].carriers)
        self.assertEqual(len(made), len(sounds.ROUNDS[0]) * len(group_sounds.SPEEDS["end"]) * words * 2)
        said = {phonemes for phonemes, *_ in speaker.said}
        self.assertIn("kˈW", said)
        self.assertIn("kˈWː", said)
        for cut in made:
            self.assertIsNotNone(cut.whole)
            self.assertTrue(cut.words)
            seconds = len(cut.audio) / SAMPLE_RATE
            self.assertLessEqual(seconds, 0.3, cut.way.carrier)
            self.assertGreaterEqual(seconds, 0.09, cut.way.carrier)

    def test_a_vowel_that_ends_no_word_is_cut_from_the_middle_and_made_longer(self):
        made, _ = self.cuts("uu")
        self.assertTrue(made)
        for cut in made:
            # The speaker says the vowel in a tenth of a second, or two tenths when it is drawn out, and the middle of it is made longer than that, up to the length of a sound.
            seconds = len(cut.audio) / SAMPLE_RATE
            self.assertGreater(seconds, 0.15, cut.way.carrier)
            self.assertLessEqual(seconds, sounds.VOWEL_SECONDS + 0.02, cut.way.carrier)

    def test_a_sound_that_ends_a_word_is_the_end_of_it_and_nothing_before(self):
        made, speaker = self.cuts("nk")
        self.assertEqual({phonemes for phonemes, *_ in speaker.said}, {template for template, _ in group_sounds.GROUPS["nk"].carriers})
        for cut in made:
            self.assertAlmostEqual(len(cut.audio) / SAMPLE_RATE, 0.2, delta=0.01, msg=cut.way.carrier)
            self.assertIsNotNone(cut.whole)

    def test_each_round_moves_to_other_noises_and_rows_of_style(self):
        first, _ = self.cuts("sh", 0)
        second, _ = self.cuts("sh", 1)
        self.assertFalse({(c.way.seed, c.way.style) for c in first} & {(c.way.seed, c.way.style) for c in second})

    def test_a_cut_that_is_too_short_to_be_looked_at_is_left_out(self):
        class Quick(Speaker):
            FRAMES = 1

        speaker = Quick()
        self.assertEqual(list(group_sounds.cuts(speaker, "ow", 0)), [])


if __name__ == "__main__":
    unittest.main()
