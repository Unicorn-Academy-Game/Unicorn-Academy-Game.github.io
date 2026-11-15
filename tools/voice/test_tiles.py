"""Tests of the rule that sets the tiles of a word beside the phonemes the voice says it with. They are made on phonemes written by hand and need no model."""

import unittest

from tiles import Tile, heard, normal, says, stressed_syllable


def tiles(spec: str) -> list[Tile]:
    """`s n ow:oh` is three tiles. A tile is its letters and, after a colon, its sound (the letters when there is none). `-` is silent, and `|` marks a gap."""
    out: list[Tile] = []
    gap = False
    for part in spec.split():
        if part == "|":
            gap = True
            continue
        letters, _, sound = part.partition(":")
        out.append(Tile(letters, None if sound == "-" else sound or letters, gap))
        gap = False
    return out


class Normal(unittest.TestCase):
    def test_stress_and_length_are_not_compared(self):
        self.assertEqual(normal("ˈuːˌk"), "uk")

    def test_the_variants_of_one_sound_are_written_one_way(self):
        self.assertEqual(normal("lˈɪTᵊl"), "lɪtəl")
        self.assertEqual(normal("ɹˈæbᵻt"), "ɹæbɪt")
        self.assertEqual(normal("hˈɜɹ"), "hɜɹ")
        self.assertEqual(normal("ˈɛvɚ"), "ɛvəɹ")

    def test_the_stressed_syllable_is_found_by_the_vowels_before_the_mark(self):
        self.assertEqual(stressed_syllable("kˈæt"), 0)
        self.assertEqual(stressed_syllable("həlˈO"), 1)
        self.assertEqual(stressed_syllable("ˌʌmbɹˈɛlə"), 1, "um-BREL-la, and the weak stress before it is not the main one")
        self.assertIsNone(stressed_syllable("ðə"))


class Saying(unittest.TestCase):
    def test_the_sounds_of_the_tiles_are_the_word(self):
        self.assertTrue(says(tiles("c a t"), "kˈæt"))
        self.assertTrue(says(tiles("s n ow:oh"), "snˈO"))
        self.assertTrue(says(tiles("sh i p"), "ʃˈɪp"))
        self.assertEqual(heard(tiles("s n ow:oh")), "snO")

    def test_a_tile_that_says_the_wrong_sound_is_caught(self):
        self.assertFalse(says(tiles("s n ow:ow"), "snˈO"), "a long o is not the sound of cow")
        self.assertFalse(says(tiles("c:c i t y:ee"), "sˈɪTi"), "a hard c where the voice says s")
        self.assertFalse(says(tiles("b a g s:s"), "bˈæɡz"), "an s where the voice says z")
        self.assertFalse(says(tiles("c a t"), "kˈɛt"), "a short a where the voice says e")
        self.assertFalse(says(tiles("c a t s"), "kˈæt"), "a tile the voice does not say")
        self.assertFalse(says(tiles("c a"), "kˈæt"), "a sound the tiles do not say")

    def test_a_silent_tile_says_nothing(self):
        self.assertTrue(says(tiles("m a:ay k e:-"), "mˈAk"))
        self.assertFalse(says(tiles("m a:ay k e:-"), "mˈAkɛ"))

    def test_a_vowel_that_is_not_stressed_may_be_any_weak_vowel(self):
        self.assertTrue(says(tiles("p e n | c:s i l"), "pˈɛnsᵊl"), "the i of pencil is a weak vowel here, and the voice says it so")
        self.assertTrue(says(tiles("r a b | b i t"), "ɹˈæbət"))
        self.assertTrue(says(tiles("a b | o u t"), "əbˈWt") is False, "the vowel that is stressed is held to its sound")

    def test_a_stressed_vowel_is_held_to_its_sound(self):
        self.assertFalse(says(tiles("r a b | b i t"), "ɹˈɛbət"))
        self.assertFalse(says(tiles("h e l | l o:oh"), "həlˈA"))

    def test_the_stress_can_be_on_a_later_syllable(self):
        self.assertTrue(says(tiles("h e l | l o:oh"), "həlˈO"))
        self.assertFalse(says(tiles("h e l | l o:o"), "həlˈO"), "the stressed vowel is held to its sound")

    def test_a_letter_that_is_doubled_where_a_word_breaks_is_said_once(self):
        self.assertTrue(says(tiles("r a b | b i t"), "ɹˈæbət"))
        self.assertTrue(says(tiles("r a b | b i t"), "ɹˈæbbət"))
        self.assertFalse(says(tiles("r a b b i t"), "ɹˈæbət"), "two b tiles in one part are both said")
        self.assertFalse(says(tiles("r a b | p i t"), "ɹˈæbət"), "only the same letter twice")

    def test_a_weak_vowel_before_the_n_that_ends_a_word_is_not_said(self):
        self.assertTrue(says(tiles("k i t | t e n"), "kˈɪtn"))
        self.assertTrue(says(tiles("k i t | t e n"), "kˈɪtən"))
        self.assertFalse(says(tiles("k i t | t e n"), "kˈɪt"), "the n is said")
        self.assertFalse(says(tiles("s e n | t"), "sˈɛt"))

    def test_the_le_that_ends_a_word_is_said_el(self):
        self.assertTrue(says(tiles("a:a p | p le:l"), "ˈæpᵊl"))
        self.assertTrue(says(tiles("t a:ay b | le:l"), "tˈAbᵊl"))
        self.assertFalse(says(tiles("t a:ay b | le:l"), "tˈAbᵊ"))

    def test_an_n_in_front_of_a_k_or_a_g_is_said_as_ng(self):
        self.assertTrue(says(tiles("u n | c:k le:l"), "ˈʌŋkəl"))
        self.assertTrue(says(tiles("j u n g:g le:l"), "ʤˈʌŋɡᵊl"))
        self.assertFalse(says(tiles("s u n | l"), "sˈʌŋl"), "only in front of a k or a g")

    def test_th_may_be_voiced_or_not_and_er_may_be_either_vowel(self):
        self.assertTrue(says(tiles("th i n"), "θˈɪn"))
        self.assertTrue(says(tiles("th i s"), "ðˈɪs"))
        self.assertTrue(says(tiles("h er:er"), "hˈɜɹ"))
        self.assertTrue(says(tiles("s i s | t er:er"), "sˈɪstɚ"))


if __name__ == "__main__":
    unittest.main()
