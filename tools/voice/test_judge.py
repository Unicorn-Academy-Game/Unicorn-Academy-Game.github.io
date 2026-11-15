"""Tests of the rule that says whether a clip was understood. They are made on what the listeners wrote and need no model and no audio."""

import unittest

from judge import Heard, accepted, edge_inserts, grade, grade_line, letters_only, word_misses, words_of


class Accepted(unittest.TestCase):
    def test_a_letter_may_be_written_as_the_word_it_sounds_like(self):
        self.assertEqual(accepted("letter.r"), {"r", "are", "our"})

    def test_a_word_that_sounds_like_another_may_be_written_either_way(self):
        self.assertEqual(accepted("word.bee"), {"bee", "be", "b"})
        self.assertEqual(accepted("shout.bee"), {"bee", "be", "b"})
        self.assertEqual(accepted("word.hay"), {"hay", "hey"})
        self.assertEqual(accepted("shout.hay"), {"hay", "hey"})
        self.assertEqual(accepted("word.by"), {"by", "bye", "buy"}, "the listener writes the one it has seen most, which is not always the one that was meant")

    def test_a_word_that_the_listener_writes_as_a_name_is_still_the_word(self):
        self.assertEqual(accepted("word.dug"), {"dug", "doug"})
        self.assertEqual(accepted("word.wren"), {"wren", "ren"})

    def test_any_other_line_is_only_its_own_words(self):
        for clip_id in ("word.frog", "can.tomato", "cheer.yes", "star", "press", "letter.1", "open.bee"):
            self.assertIsNone(accepted(clip_id), clip_id)


class Grading(unittest.TestCase):
    FROG = "fɹˈɑɡ."

    def test_the_words_that_were_meant_are_understood(self):
        graded = grade(Heard("Frog.", "f ɹ ɑ ɡ"), "frog.", self.FROG)
        self.assertTrue(graded.words_ok)
        self.assertTrue(graded.understood)
        self.assertEqual(graded.error, 0)

    def test_one_wrong_letter_in_a_long_enough_word_is_understood(self):
        self.assertTrue(grade(Heard("Frogs.", "x"), "frog.", self.FROG).words_ok)

    def test_a_different_word_is_not_understood_by_the_words(self):
        graded = grade(Heard("Duck.", "d ʌ k"), "frog.", self.FROG)
        self.assertFalse(graded.words_ok)
        self.assertFalse(graded.understood)
        self.assertEqual(graded.error, 1.0)

    def test_sounds_that_are_close_stand_in_for_words_that_are_not(self):
        graded = grade(Heard("Fog.", "f ɹ ɑ ɡ"), "frog.", self.FROG)
        self.assertFalse(graded.words_ok)
        self.assertTrue(graded.understood)

    def test_the_two_sides_write_the_same_sounds_differently(self):
        # `r` and `ɹ`, `g` and `ɡ`, `o` and `ɑ` are one sound each to a child, and to this rule.
        self.assertEqual(grade(Heard("Frog.", "f r o g"), "frog.", self.FROG).error, 0)

    def test_the_two_sides_write_the_vowel_of_coin_differently(self):
        # The model's alphabet has one letter for `oy`, the sound listener writes two sounds, and it can be either of two vowels in front.
        for heard in ("k oɪ n", "k ɔɪ n"):
            self.assertEqual(grade(Heard("Coin.", heard), "coin.", "kˈYn.").error, 0, heard)

    def test_only_the_ways_of_writing_it_count_when_there_are_some(self):
        ways = {"bee", "be", "b"}
        self.assertTrue(grade(Heard("Be.", ""), "bee.", "bˈi.", ways).words_ok)
        self.assertFalse(grade(Heard("Bean.", ""), "bee.", "bˈi.", ways).words_ok)
        self.assertFalse(grade(Heard("Bee.", ""), "bee.", "bˈi.", {"are", "our", "r"}).words_ok)

    def test_a_clip_that_says_nothing_is_not_understood(self):
        self.assertFalse(grade(Heard("", ""), "frog.", self.FROG).understood)

    def test_a_stop_written_before_and_after_the_word_is_counted_and_does_not_make_it_misunderstood(self):
        # The puff of air that lets go of the word before a word in a list is written by the sound listener as a stop, and the word listener does not hear it.
        graded = grade(Heard("Are.", "d ɑː ɹ t"), "are.", "ɑɹ.")
        self.assertEqual(graded.edges, (1, 1))
        self.assertTrue(graded.understood)
        self.assertEqual(graded.error, 1.0)

    def test_a_clip_with_nothing_at_its_ends_has_no_edges(self):
        self.assertEqual(grade(Heard("Frog.", "f ɹ ɑ ɡ"), "frog.", self.FROG).edges, (0, 0))
        self.assertEqual(grade(Heard("", ""), "frog.", self.FROG).edges, (0, 0))


class EdgeInserts(unittest.TestCase):
    def test_a_sound_written_before_the_word_or_after_it_is_one_at_that_end(self):
        self.assertEqual(edge_inserts("stɑp", "tɑp"), (1, 0))
        self.assertEqual(edge_inserts("tɑpk", "tɑp"), (0, 1))
        self.assertEqual(edge_inserts("dɑɹt", "ɑɹ"), (1, 1))

    def test_more_than_one_sound_is_counted_by_how_many(self):
        self.assertEqual(edge_inserts("bdɑɹ", "ɑɹ"), (2, 0))
        self.assertEqual(edge_inserts("ɑɹtk", "ɑɹ"), (0, 2))

    def test_a_clip_that_was_written_as_meant_has_none(self):
        self.assertEqual(edge_inserts("fɹɑɡ", "fɹɑɡ"), (0, 0))

    def test_a_sound_in_the_middle_of_the_word_is_not_at_an_end(self):
        self.assertEqual(edge_inserts("fɑnst", "fɑst"), (0, 0))

    def test_a_sound_that_is_wrong_is_not_one_that_was_added_and_nor_is_one_that_is_missing(self):
        self.assertEqual(edge_inserts("dɑt", "tɑt"), (0, 0))
        self.assertEqual(edge_inserts("ɑt", "tɑt"), (0, 0))
        self.assertEqual(edge_inserts("tɑ", "tɑt"), (0, 0))

    def test_a_word_that_was_not_heard_has_no_sounds_added_to_it(self):
        self.assertEqual(edge_inserts("", "tɑt"), (0, 0))

    def test_where_nothing_was_meant_every_sound_written_is_before_it(self):
        self.assertEqual(edge_inserts("ab", ""), (2, 0))


class Sentences(unittest.TestCase):
    SAID = "The cat sat on the mat."

    def test_the_words_of_a_sentence_are_lower_case_with_numbers_spelled_out(self):
        self.assertEqual(words_of("The cat, sat."), ["the", "cat", "sat"])
        self.assertEqual(words_of("I have 10 coins."), ["i", "have", "ten", "coins"])
        self.assertEqual(words_of("It's here."), ["its", "here"])

    def test_a_hundred_is_spelled_out_like_every_number_under_it(self):
        self.assertEqual(words_of("What is 100 plus 5?"), ["what", "is", "one", "hundred", "plus", "five"])
        self.assertEqual(word_misses("What is 100 plus 5?", "What is one hundred plus five?"), 0)
        self.assertEqual(letters_only("100."), "onehundred")

    def test_a_word_written_as_one_that_is_two_words_of_the_course_is_two_words(self):
        self.assertEqual(words_of("He cannot sit."), ["he", "can", "not", "sit"])
        self.assertEqual(word_misses("He cannot sit.", "He can not sit."), 0)
        self.assertEqual(word_misses("He can sit.", "He can not sit."), 1)

    def test_the_words_that_were_said_are_no_misses(self):
        self.assertEqual(word_misses("The cat sat on the mat.", self.SAID), 0)
        self.assertEqual(word_misses("the CAT sat, on the mat", self.SAID), 0)

    def test_a_dropped_added_or_changed_word_is_one_miss(self):
        self.assertEqual(word_misses("The cat on the mat.", self.SAID), 1)
        self.assertEqual(word_misses("The cat sat sat on the mat.", self.SAID), 1)
        self.assertEqual(word_misses("The cat sit on the mat.", self.SAID), 1)

    def test_a_word_that_sounds_the_same_is_not_a_miss(self):
        same = lambda a, b: {a, b} == {"two", "to"}
        self.assertEqual(word_misses("I went two the shop.", "I went to the shop.", same), 0)
        self.assertEqual(word_misses("I went two the shop.", "I went to the shop."), 1)

    def test_a_sentence_is_understood_when_every_word_was_written(self):
        graded = grade_line(Heard(self.SAID, "x"), self.SAID, "ðə kˈæt sˈæt ˈɑn ðə mˈæt.")
        self.assertTrue(graded.words_ok)
        self.assertTrue(graded.understood)
        self.assertEqual(graded.misses, 0)

    def test_the_sounds_cannot_stand_in_for_words_in_a_sentence_with_more_than_one_wrong(self):
        sounds = "ðə kˈæt sˈæt ˈɑn ðə mˈæt."
        graded = grade_line(Heard("The dog sat on a hat.", "ð ə k æ t s æ t ɑ n ð ə m æ t"), self.SAID, sounds)
        self.assertFalse(graded.words_ok)
        self.assertFalse(graded.understood, "three words are wrong and the sound listener cannot tell")
        self.assertEqual(graded.misses, 3)

    def test_one_wrong_word_is_understood_when_the_sounds_are_close(self):
        sounds = "ðə kˈæt sˈæt ˈɑn ðə mˈæt."
        close = grade_line(Heard("The cat sat on the mad.", "ð ə k æ t s æ t ɑ n ð ə m æ d"), self.SAID, sounds)
        self.assertTrue(close.understood)
        far = grade_line(Heard("The cat sat on the mad.", "b i g d o g"), self.SAID, sounds)
        self.assertFalse(far.understood)


if __name__ == "__main__":
    unittest.main()
