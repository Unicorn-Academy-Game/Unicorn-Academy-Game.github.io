"""Tests of how the generator plans and copies clips. They need no model: the clips are a few bytes and the report is a dictionary."""

import re
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

import dsp
import frames
import generate
from judge import UNDERSTOOD, Heard
from speak import SAMPLE_RATE, Spoken

WORD = {"id": "word.bee", "text": "bee."}
LETTER_B = {"heard": "B.", "heardSounds": "b iː", "seconds": 0.456, "status": "ok", "error": 0.0, "wordsOk": True, "good": 3, "tried": 14, "kind": "letter"}


class Copying(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.out = Path(self.dir.name)
        patch = mock.patch.object(generate, "OUT", self.out)
        patch.start()
        self.addCleanup(patch.stop)
        (self.out / "letter.b.wav").write_bytes(b"the letter")
        self.clips = {"letter.b": dict(LETTER_B)}
        self.remembered = 0

    def copy(self) -> None:
        def remember() -> None:
            self.remembered += 1

        with mock.patch("builtins.print"):
            generate.copy_clips({"word.bee": "letter.b"}, {"word.bee": WORD}, {"word.bee": "bˈi."}, self.clips, remember)

    def test_the_clip_is_the_letter_and_the_report_says_what_it_is_a_copy_of(self):
        self.copy()
        self.assertEqual((self.out / "word.bee.wav").read_bytes(), b"the letter")
        made = self.clips["word.bee"]
        self.assertEqual(made["take"], {"copyOf": "letter.b"})
        self.assertEqual((made["kind"], made["text"], made["said"], made["phonemes"]), ("word", "bee.", "bee.", "bˈi."))
        self.assertEqual(made["status"], "ok")
        self.assertEqual(made["fingerprint"], generate.fingerprint("word.bee", "copy", "letter.b"))

    def test_it_follows_the_letter_when_the_letter_is_made_again(self):
        self.copy()
        (self.out / "letter.b.wav").write_bytes(b"a better letter")
        self.clips["letter.b"] = {**LETTER_B, "heard": "Bee."}
        self.copy()
        self.assertEqual((self.out / "word.bee.wav").read_bytes(), b"a better letter")
        self.assertEqual(self.clips["word.bee"]["heard"], "Bee.")

    def test_a_run_that_changes_nothing_writes_nothing(self):
        self.copy()
        before = self.remembered
        self.copy()
        self.assertEqual(self.remembered, before)

    def test_it_is_for_review_when_the_listeners_did_not_hear_the_word(self):
        self.clips["letter.b"] = {**LETTER_B, "heard": "Hello.", "heardSounds": "h ɛ l ou"}
        self.copy()
        self.assertEqual(self.clips["word.bee"]["status"], "review")

    def test_a_copy_of_a_clip_that_was_never_made_is_refused(self):
        del self.clips["letter.b"]
        with self.assertRaises(SystemExit):
            self.copy()


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg is not installed")
class Encoding(unittest.TestCase):
    @staticmethod
    def tone() -> np.ndarray:
        t = np.arange(int(0.3 * generate.SAMPLE_RATE)) / generate.SAMPLE_RATE
        return (0.4 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)

    def test_a_sound_comes_back_from_the_encoder_as_long_as_it_went(self):
        back = generate.through_mp3(self.tone())
        self.assertAlmostEqual(len(back) / generate.SAMPLE_RATE, 0.3, delta=0.02)
        self.assertGreater(float(np.abs(back).max()), 0.3)

    def test_the_encoder_is_given_the_samples_the_packer_writes_of_the_master_at_that_level(self):
        given: list[np.ndarray] = []
        run = generate.subprocess.run

        def spy(command, *args, **kwargs):
            if "libmp3lame" in command:
                given.append(generate.sf.read(command[command.index("-i") + 1], dtype="int16")[0])
            return run(command, *args, **kwargs)

        take = self.tone() * 1.0003
        with mock.patch.object(generate.subprocess, "run", spy):
            generate.through_mp3(take, -4.0)
        level = (generate.master_samples(take).astype(np.float64) * 10 ** (-4.0 / 20)).astype(np.float32)
        self.assertEqual(len(given), 1)
        self.assertEqual(given[0].dtype, np.int16)
        self.assertTrue(np.array_equal(given[0], generate.packer_samples(level)))

    def test_a_louder_level_is_louder_and_never_over_the_ceiling_the_packer_holds(self):
        quiet, loud = generate.through_mp3(self.tone(), -6.0), generate.through_mp3(self.tone(), 12.0)
        self.assertGreater(float(np.abs(loud).max()), float(np.abs(quiet).max()) * 1.5)
        self.assertLessEqual(float(np.abs(loud).max()), 10 ** ((generate.CEILING_DB + 0.5) / 20))


class Planning(unittest.TestCase):
    def test_a_copy_has_no_takes_and_a_fingerprint_that_names_what_it_copies(self):
        phonemes, takes, made = generate.plan_line(WORD, "bˈi.", "", {"word.bee": {"copy": "letter.b"}})
        self.assertEqual((phonemes, takes), ("bˈi.", []))
        self.assertEqual(made, generate.fingerprint("word.bee", "copy", "letter.b"))
        self.assertNotEqual(made, generate.plan_line(WORD, "bˈi.", "", {"word.bee": {"copy": "letter.p"}})[2])

    def test_a_line_with_nothing_chosen_by_hand_is_spoken_in_six_ways(self):
        _, takes, _ = generate.plan_line(WORD, "bˈi.", "", {})
        self.assertEqual(len(takes), 6)

    def test_a_take_chosen_by_hand_is_the_only_one_and_may_name_its_speed(self):
        _, takes, _ = generate.plan_line(WORD, "bˈi.", "", {"word.bee": {"style": 22, "seed": 1, "speed": 0.9}})
        self.assertEqual(takes, [generate.Take(0.9, 22, 1)])
        _, takes, _ = generate.plan_line(WORD, "bˈi.", "", {"word.bee": {"style": 22, "seed": 1}})
        self.assertEqual(takes, [generate.Take(generate.SPEEDS["word"], 22, 1)])


class Sentences(unittest.TestCase):
    LINE = {"id": "line.the-cat-sat", "text": "The cat sat."}

    def test_a_sentence_is_spoken_four_ways_at_its_own_speed(self):
        _, takes, _ = generate.plan_line(self.LINE, "ðə kˈæt sˈæt.", "", {})
        self.assertEqual(len(takes), len(generate.LINE_STYLES))
        self.assertEqual({take.speed for take in takes}, {generate.SPEEDS["line"]})

    def test_a_pronunciation_given_by_hand_is_not_a_take_chosen_by_hand(self):
        _, takes, _ = generate.plan_line(WORD, "ˈæn.", "", {"word.bee": {"phonemes": "ˈæn."}})
        self.assertEqual(len(takes), 6, "it is still spoken in six ways")

    def test_how_long_a_sentence_may_be_goes_by_its_words(self):
        short, long = generate.line_bounds("The cat sat."), generate.line_bounds("The little unicorn gave a bright star to her friend in the garden.")
        self.assertAlmostEqual(short[0], 0.6)
        self.assertAlmostEqual(short[1], 3.1)
        self.assertGreater(long[0], 2.5)
        self.assertGreater(long[1], 9.0)
        for seconds, words in ((0.91, 3), (2.08, 9), (3.68, 13)):
            self.assertTrue(0.2 * words <= seconds <= 0.7 * words + 1.0, f"a take that was understood in the spike, {words} words in {seconds} s")

    def test_a_take_is_cut_to_the_sound_and_says_where_it_starts(self):
        rate = generate.SAMPLE_RATE
        t = np.arange(int(0.5 * rate)) / rate
        audio = np.concatenate([np.zeros(int(0.3 * rate)), (0.5 * np.sin(2 * np.pi * 220 * t)).astype(np.float32), np.zeros(int(0.2 * rate))]).astype(np.float32)
        clip, lead = generate.tidy_at(audio, "sˈæt.")
        self.assertAlmostEqual(lead, 0.3, delta=0.02)
        self.assertAlmostEqual(len(clip) / rate, 0.5, delta=0.05)
        self.assertTrue(np.array_equal(generate.tidy(audio, "sˈæt."), clip))

    def test_the_times_of_the_words_are_counted_from_where_the_master_starts(self):
        rate = generate.SAMPLE_RATE
        t = np.arange(int(1.0 * rate)) / rate
        tone = (0.5 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
        clip = np.concatenate([np.zeros(int(0.1 * rate), np.float32), tone])
        # the spoken audio began 0.25 s before this clip did, and the model said the first word at 0.35 s and the second at 0.75 s into it
        chosen = generate.Verdict(
            audio=clip, take=generate.Take(0.85, 0, 1), seconds=1.0, heard="", sounds="", error=0.0, understood=True, flags=[], pitch_hz=220.0, pitch_span=0.0,
            extra={"source": "alone", "spans": [(0.35, 0.65), (0.75, 1.2)], "lead": 0.25},
        )
        made = generate.entry("line.x", "line", "A b.", "A b.", chosen, 1, "ok", 1, "f", "a b.")
        mastered = len(generate.finish(clip)) / rate
        lead = 0.25 + generate.dsp.speech_bounds(clip)[0] / rate
        self.assertEqual(made["words"], [[round(0.35 - lead, 3), round(0.65 - lead, 3)], [round(0.75 - lead, 3), round(min(1.2 - lead, mastered), 3)]])
        self.assertNotIn("spans", made)
        self.assertNotIn("lead", made)

    def test_a_clip_that_is_not_a_sentence_has_no_times(self):
        chosen = generate.Verdict(
            audio=np.ones(2400, np.float32) * 0.1, take=generate.Take(0.85, 0, 1), seconds=0.1, heard="", sounds="", error=0.0, understood=True, flags=[], pitch_hz=0.0,
            pitch_span=0.0, extra={"source": "alone"},
        )
        self.assertNotIn("words", generate.entry("word.x", "word", "x.", "x.", chosen, 1, "ok", 1, "f", "x."))


class Grouping(unittest.TestCase):
    """The words of a kind are spoken in one breath, and the model takes a few dozen at a time, so a long kind is spoken in groups."""

    @staticmethod
    def lines(count: int, kind: str = "word") -> list[dict]:
        return [{"id": f"{kind}.w{i:03}", "text": f"w{i}."} for i in range(count)]

    @staticmethod
    def sounds(lines: list[dict]) -> dict[str, str]:
        return {line["id"]: f"ˈ{line['id'][-3:]}." for line in lines}

    def test_a_kind_that_fits_one_breath_is_one_group_and_every_line_is_in_it(self):
        lines = self.lines(generate.GROUP)
        groups = generate.together(lines)
        self.assertEqual({tuple(g) for g in groups.values()}, {tuple(line["id"] for line in lines)})
        self.assertEqual(set(groups), {line["id"] for line in lines})

    def test_a_longer_kind_is_split_in_the_order_of_the_list_and_the_last_group_is_what_is_left(self):
        lines = self.lines(generate.GROUP * 2 + 3)
        ids = [line["id"] for line in lines]
        groups = {tuple(g) for g in generate.together(lines).values()}
        self.assertEqual(sorted(groups), [tuple(ids[: generate.GROUP]), tuple(ids[generate.GROUP : generate.GROUP * 2]), tuple(ids[generate.GROUP * 2 :])])

    def test_a_line_of_a_kind_that_is_not_spoken_together_is_in_no_group(self):
        lines = self.lines(3, "open") + self.lines(3, "word")
        self.assertEqual(set(generate.together(lines)), {"word.w000", "word.w001", "word.w002"})

    def test_two_kinds_are_never_in_one_group(self):
        lines = self.lines(3, "word") + self.lines(3, "shout")
        for clip_id, group in generate.together(lines).items():
            self.assertEqual({generate.kind_of(other) for other in group}, {generate.kind_of(clip_id)})

    def test_the_method_and_the_carriers_are_in_the_fingerprint_of_a_group(self):
        lines = self.lines(generate.GROUP)
        sounds = self.sounds(lines)
        group = generate.together(lines)["word.w000"]
        was = generate.listed_in("word", group, sounds)
        with mock.patch.object(generate, "METHOD", generate.METHOD + 1):
            self.assertNotEqual(generate.listed_in("word", group, sounds), was)
        with mock.patch.object(generate, "CARRIERS", generate.CARRIERS[:-1]):
            self.assertNotEqual(generate.listed_in("word", group, sounds), was)

    def test_a_word_put_on_the_end_leaves_the_groups_before_it_as_they_were(self):
        before, after = self.lines(generate.GROUP + 5), self.lines(generate.GROUP + 6)
        was, now = generate.together(before), generate.together(after)
        first, last = "word.w000", f"word.w{generate.GROUP:03}"
        made = lambda groups, lines, clip_id: generate.listed_in("word", groups[clip_id], self.sounds(lines))  # noqa: E731
        self.assertEqual(made(was, before, first), made(now, after, first))
        self.assertNotEqual(made(was, before, last), made(now, after, last))

    def test_a_change_to_one_word_makes_its_group_again_and_no_other(self):
        lines = self.lines(generate.GROUP * 2)
        sounds = self.sounds(lines)
        groups = generate.together(lines)
        in_second = f"word.w{generate.GROUP + 5:03}"
        changed = {**sounds, in_second: "ˈchanged."}
        self.assertEqual(generate.listed_in("word", groups["word.w000"], sounds), generate.listed_in("word", groups["word.w000"], changed))
        self.assertNotEqual(generate.listed_in("word", groups[in_second], sounds), generate.listed_in("word", groups[in_second], changed))

    def test_a_word_added_after_the_hundred_of_the_book_leaves_the_last_of_their_groups_as_it_was(self):
        book, more = self.lines(generate.FIRST), self.lines(generate.FIRST + 40)
        was, now = generate.together(book), generate.together(more)
        last = f"word.w{generate.FIRST - 1:03}"
        self.assertEqual(was[last], now[last], "the words that end the hundred are not spoken with the new ones")
        self.assertEqual(now[f"word.w{generate.FIRST:03}"][0], f"word.w{generate.FIRST:03}", "the words after them start a group of their own")
        self.assertEqual(len(now[f"word.w{generate.FIRST:03}"]), generate.GROUP)
        sizes = sorted(len(g) for g in {tuple(g) for g in now.values()})
        self.assertEqual(sizes, sorted([generate.GROUP] * (generate.FIRST // generate.GROUP) + [generate.FIRST % generate.GROUP, generate.GROUP, 40 - generate.GROUP]))

    def test_the_most_the_model_is_given_for_a_group_has_a_carrier_at_every_join_and_one_at_the_end(self):
        sounds = {"word.a": "ˈa.", "word.b": "ˈb."}
        carriers = ["kˈɪt.", "tˈɑp."]
        self.assertEqual(generate.breath(["word.a", "word.b"], sounds, carriers), (len("ˈa.") + 1) * 2 + 2 * (len("kˈɪt.") + 1))

    def test_what_the_model_is_given_never_goes_over_what_the_group_is_said_to_need(self):
        import random

        from cuts import with_carriers

        words = ["fˈiʃ.", "mˈun.", "lˈip.", "tˈæn.", "sˈʌn.", "kˈæt.", "ɹˈɛd.", "bˈʌs.", "dˈɔɡ.", "ʤˈʌmp."]
        parts = {f"word.{i}": w for i, w in enumerate(words)}
        for seed in range(30):
            order = list(parts)
            random.Random(seed).shuffle(order)
            items = with_carriers(order, parts, list(generate.CARRIERS), random.Random(seed))
            given = len(" ".join(sounds for _, sounds in items))
            self.assertLessEqual(given, generate.breath(order, parts, list(generate.CARRIERS)))


class Staleness(unittest.TestCase):
    """What a run makes: a clip with no master, one the plan has changed, one asked for by name. And what it leaves: the words made the first way."""

    def stale(self, clip_id: str, clip: dict | None, made: str = "plan", **how) -> bool:
        return generate.is_stale(clip_id, clip, made, has_master=how.pop("has_master", True), **how)

    def test_a_clip_with_no_report_or_no_master_is_made(self):
        self.assertTrue(self.stale("word.cat", None))
        self.assertTrue(self.stale("word.cat", {"fingerprint": "plan", "method": 2}, has_master=False))

    def test_a_clip_made_to_the_same_plan_is_left_and_one_made_to_another_is_made_again(self):
        self.assertFalse(self.stale("word.cat", {"fingerprint": "plan", "method": 2}))
        self.assertTrue(self.stale("word.cat", {"fingerprint": "an older plan", "method": 2}))

    def test_a_word_shout_or_cheer_made_the_first_way_is_kept_whatever_the_plan_says(self):
        for kind in ("word", "shout", "cheer"):
            self.assertFalse(self.stale(f"{kind}.cat", {"fingerprint": "an older plan"}), kind)

    def test_a_clip_of_any_other_kind_with_no_method_is_made_again_when_its_plan_changes(self):
        for kind in ("open", "again", "can", "line", "milestone"):
            self.assertTrue(self.stale(f"{kind}.cat", {"fingerprint": "an older plan"}), kind)

    def test_naming_a_clip_makes_it_again_even_when_it_was_made_the_first_way(self):
        self.assertTrue(self.stale("word.cat", {"fingerprint": "plan"}, patterns=["word.c*"]))
        self.assertFalse(self.stale("word.dog", {"fingerprint": "plan"}, patterns=["word.c*"]))

    def test_naming_clips_with_new_makes_only_the_ones_that_have_no_master(self):
        self.assertFalse(self.stale("word.cat", {"fingerprint": "plan", "method": 2}, patterns=["word.*"], new=True))
        self.assertTrue(self.stale("word.cat", None, patterns=["word.*"], new=True))
        self.assertTrue(self.stale("word.cat", {"fingerprint": "plan"}, patterns=["word.*"], new=True, has_master=False))

    def test_force_makes_everything_that_is_not_named_away(self):
        self.assertTrue(self.stale("word.cat", {"fingerprint": "plan", "method": 2}, force=True))


class Sharing(unittest.TestCase):
    @staticmethod
    def lines(ids: list[str]) -> list[dict]:
        return [{"id": clip_id, "text": clip_id} for clip_id in ids]

    def test_a_group_is_one_piece_of_work_with_the_lines_of_it_that_are_to_be_made(self):
        group = ["word.a", "word.b", "word.c", "word.d"]
        todo = self.lines(["word.b", "word.d"]) + self.lines(["open.x"])
        work = generate.pieces_of_work(todo, {clip_id: group for clip_id in group})
        self.assertEqual([(g, [line["id"] for line in members]) for g, members in work], [(tuple(group), ["word.b", "word.d"]), ((), ["open.x"])])

    def test_a_line_with_no_group_is_a_piece_of_work_on_its_own_each(self):
        work = generate.pieces_of_work(self.lines(["open.a", "open.b"]), {})
        self.assertEqual([(g, [line["id"] for line in members]) for g, members in work], [((), ["open.a"]), ((), ["open.b"])])

    def test_the_shards_are_every_nth_piece_and_between_them_are_all_of_it_once(self):
        work = list(range(11))
        for shards in (1, 2, 3, 4, 7):
            parts = [generate.share(work, shard, shards) for shard in range(1, shards + 1)]
            self.assertEqual(sorted(sum(parts, [])), work)
            self.assertLessEqual(max(map(len, parts)) - min(map(len, parts)), 1)

    def test_a_shard_that_is_not_one_of_n_has_nothing(self):
        self.assertEqual(generate.share([1, 2, 3], 5, 3), [])


class Merging(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        patch = mock.patch.object(generate, "SHARDS", Path(self.dir.name) / "shards")
        patch.start()
        self.addCleanup(patch.stop)

    def write(self, name: str, clips: dict) -> None:
        import json

        generate.SHARDS.mkdir(parents=True, exist_ok=True)
        (generate.SHARDS / name).write_text(json.dumps({"clips": clips}))

    def test_what_the_shards_made_goes_in_the_report_and_their_files_go(self):
        self.write("report-1-of-2.json", {"word.a": {"status": "ok"}})
        self.write("report-2-of-2.json", {"word.b": {"status": "review"}})
        clips = {"word.z": {"status": "ok"}}
        written: list[dict] = []
        with mock.patch("builtins.print"):
            generate.merge_shards({}, clips, lambda: written.append(dict(clips)))
        self.assertEqual(sorted(clips), ["word.a", "word.b", "word.z"])
        self.assertEqual(len(written), 1)
        self.assertFalse(generate.SHARDS.exists())

    def test_with_no_shards_the_report_is_written_as_it_was(self):
        clips = {"word.z": {"status": "ok"}}
        with mock.patch("builtins.print"):
            generate.merge_shards({}, clips, lambda: None)
        self.assertEqual(clips, {"word.z": {"status": "ok"}})


def voice(seconds: float, hz: float = 180.0) -> np.ndarray:
    """A buzz that rises and falls like a spoken word: it is voiced, and no loud at either end, so it passes the measures."""
    at = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    wave = sum(np.sin(2 * np.pi * hz * k * at) / k for k in range(1, 6))
    ramp = np.minimum(1.0, np.minimum(at, seconds - at) / 0.12)
    return (0.3 * wave / np.max(np.abs(wave)) * np.sin(ramp * np.pi / 2) ** 2).astype(np.float32)


class Inspecting(unittest.TestCase):
    @staticmethod
    def flags(audio: np.ndarray, kind: str = "word") -> list[str]:
        return generate.inspect(audio, generate.Take(0.85, 0, 1), kind).flags

    def test_a_voice_at_the_pitch_of_the_model_is_no_rattle(self):
        self.assertEqual([flag for flag in self.flags(voice(0.4, 190.0)) if "rattle" in flag], [])

    def test_a_voice_at_half_that_pitch_is_a_rattle_in_a_word_and_in_a_sound(self):
        for kind in ("word", "sound"):
            self.assertTrue(any(flag.startswith("rattle") for flag in self.flags(voice(0.4, 90.0), kind)), kind)

    def test_a_take_that_drops_only_at_its_end_is_no_rattle(self):
        clip = np.concatenate([voice(0.5, 190.0), voice(0.2, 90.0)])
        self.assertEqual([flag for flag in self.flags(clip) if "rattle" in flag], [])

    def test_a_take_with_a_rattle_is_never_a_valid_one(self):
        verdict = generate.inspect(voice(0.4, 90.0), generate.Take(0.85, 0, 1), "word")
        verdict.understood = True
        self.assertFalse(verdict.valid)

    def test_the_share_of_the_voice_that_is_deep_is_in_the_report(self):
        self.assertGreaterEqual(generate.inspect(voice(0.4, 90.0), generate.Take(0.85, 0, 1), "word").extra["deep"], generate.DEEP_SHARE)
        self.assertEqual(generate.inspect(voice(0.4, 190.0), generate.Take(0.85, 0, 1), "word").extra["deep"], 0.0)


class Tones:
    """
    A stand-in for the model, which says every sound as a steady level of its own and every stop, space and stress mark as silence, so that what
    a cut has in it can be read back from the levels in it. It says what it was given and keeps it.
    """

    SILENT = set("ˈ .,!?ptkʧ")
    FRAME = 600

    def __init__(self) -> None:
        self.levels: dict[str, float] = {}
        self.said: list[str] = []

    def level(self, ch: str) -> float:
        return 0.0 if ch in self.SILENT else self.levels.setdefault(ch, 0.05 + 0.01 * len(self.levels))

    def say(self, phonemes: str, speed: float, seed: int, style: int = 0) -> Spoken:
        self.said.append(phonemes)
        frames = [1 if ch in " .,!?ˈ" else 2 for ch in phonemes]
        audio = np.concatenate([np.full(n * self.FRAME, self.level(ch), np.float32) for n, ch in zip(frames, phonemes)])
        return Spoken(audio=audio, frames=[3, *frames, 1])


class SpeakingAList(unittest.TestCase):
    PARTS = {"word.fish": "fˈiʃ.", "word.moon": "mˈun.", "word.lip": "lˈip.", "word.tan": "tˈæn.", "word.sun": "sˈʌn."}
    CARRIERS = ["zˈɛz.", "vˈɛv."]

    def speak(self, order: list[str], seed: int = 100, parts: dict[str, str] | None = None) -> tuple[Tones, dict[str, np.ndarray]]:
        tones = Tones()
        return tones, generate.speak_list(tones, parts or self.PARTS, order, generate.Take(0.85, 0, seed), self.CARRIERS)

    @staticmethod
    def levels_in(piece: np.ndarray) -> set[float]:
        return {round(float(level), 4) for level in np.unique(piece) if level > 0.0}

    def sounds_of(self, tones: Tones, key: str) -> set[float]:
        return {round(tones.level(ch), 4) for ch in self.PARTS[key] if tones.level(ch) > 0.0}

    def test_every_line_gets_a_piece_and_a_carrier_does_not(self):
        order = list(self.PARTS)
        self.assertEqual(sorted(self.speak(order)[1]), sorted(order))

    def test_each_piece_has_all_of_the_sounds_of_its_word_and_none_of_another_words_or_a_carriers(self):
        for order in (list(self.PARTS), list(self.PARTS)[::-1], list(self.PARTS)[2:] + list(self.PARTS)[:2]):
            tones, pieces = self.speak(order)
            for key in self.PARTS:
                self.assertEqual(self.levels_in(pieces[key]), self.sounds_of(tones, key), f"{key} in {order}")

    def test_a_carrier_is_given_only_where_two_words_would_run_together(self):
        order = ["word.fish", "word.moon", "word.lip", "word.tan", "word.sun"]
        tones, _ = self.speak(order)
        given = tones.said[0].split(" ")
        self.assertEqual(len(given), 9)
        self.assertEqual([given[i] for i in (0, 2, 4, 5, 7)], [self.PARTS[key] for key in order], "the words are in their order")
        self.assertTrue(all(given[i] in self.CARRIERS for i in (1, 3, 6, 8)), "a carrier after fish, moon and tan, and at the end")
        self.assertEqual(given[4:6], ["lˈip.", "tˈæn."], "lip ends shut and tan starts shut, so nothing is put between them")

    def test_the_model_never_ends_on_a_word_that_is_kept(self):
        for key in self.PARTS:
            tones, _ = self.speak([key])
            self.assertIn(tones.said[0].split(" ")[-1], self.CARRIERS)

    def test_a_carrier_is_not_one_of_the_words_of_the_group(self):
        parts = {"word.zez": "zˈɛz.", "word.fish": "fˈiʃ."}
        tones, pieces = self.speak(list(parts), parts=parts)
        self.assertEqual({item for item in tones.said[0].split(" ")} - set(parts.values()), {"vˈɛv."})
        self.assertEqual(sorted(pieces), sorted(parts))

    def test_the_same_take_is_the_same_breath_and_another_seed_may_not_be(self):
        order = list(self.PARTS)
        first, again = self.speak(order, 100)[0].said, self.speak(order, 100)[0].said
        self.assertEqual(first, again)
        said = {tuple(self.speak(order, seed)[0].said) for seed in range(100, 120)}
        self.assertGreater(len(said), 1)


class Cutting(unittest.TestCase):
    TAKE = generate.Take(0.85, 0, 100)

    def flags(self, seconds: float, phonemes: str, kind: str = "word") -> list[str]:
        return generate.inspect_cut(voice(seconds), phonemes, self.TAKE, kind).flags

    def test_a_word_is_as_long_as_it_has_sounds_for(self):
        self.assertEqual(self.flags(0.3, "ˈaa."), [])
        self.assertTrue(any(flag.startswith("length") for flag in self.flags(0.3, "ˈaaaaaaaa.")), "eight sounds in under half a second")
        self.assertEqual(self.flags(0.6, "ˈaaaaaaaa."), [])

    def test_a_short_word_is_still_not_a_blip(self):
        self.assertTrue(any(flag.startswith("length") for flag in self.flags(0.08, "ˈa.")))

    def test_a_word_cannot_be_longer_than_a_word_is(self):
        self.assertTrue(any(flag.startswith("length") for flag in self.flags(2.0, "ˈaa.")))

    def test_the_piece_is_marked_as_cut_from_a_list(self):
        self.assertEqual(generate.inspect_cut(voice(0.4), "ˈaa.", self.TAKE, "word").extra["source"], "list")
        self.assertFalse(generate.inspect_cut(voice(0.4), "ˈaa.", self.TAKE, "word").listened)


def verdict(seed: int, understood: bool = False, flags: list[str] | None = None, listened: bool = False) -> generate.Verdict:
    return generate.Verdict(
        audio=voice(0.4), take=generate.Take(0.85, 0, seed), seconds=0.4, heard="", sounds="", error=0.0 if understood else 1.0, understood=understood, flags=flags or [],
        pitch_hz=180.0, pitch_span=1.0, extra={"source": "list"}, listened=listened,
    )


class Choosing(unittest.TestCase):
    """A take can be understood and still have the puff of air of the word before it on its front, which only the sound listener writes, as a stop that was not meant."""

    @staticmethod
    def take(seed: int, edges: list[int] | None = None, understood: bool = True, error: float = 0.0) -> generate.Verdict:
        made = verdict(seed, understood, listened=True)
        made.error = error
        if edges:
            made.extra["edges"] = edges
        return made

    def test_a_take_that_was_understood_and_has_nothing_before_or_after_the_word_is_clean(self):
        self.assertTrue(self.take(1).clean)

    def test_a_take_with_a_sound_before_the_word_or_after_it_is_valid_and_is_not_clean(self):
        for edges in ([1, 0], [0, 1], [2, 1]):
            made = self.take(1, edges)
            self.assertTrue(made.valid, edges)
            self.assertFalse(made.clean, edges)

    def test_a_take_that_was_not_understood_is_not_clean(self):
        self.assertFalse(self.take(1, understood=False).clean)

    def test_a_take_with_a_flag_is_not_clean(self):
        made = self.take(1)
        made.flags.append("clipped")
        self.assertFalse(made.clean)

    def test_a_clean_take_is_chosen_over_one_with_a_sound_at_its_end_that_the_listeners_scored_better(self):
        taken = [self.take(1, [1, 0], error=0.0), self.take(2, error=0.2), self.take(3, error=0.2)]
        chosen, good, status = generate.choose(taken)
        self.assertIn(chosen.take.seed, (2, 3))
        self.assertEqual((good, status), (3, "ok"), "the take with a sound at its end was good too")

    def test_the_only_clean_take_is_the_one_chosen(self):
        chosen, good, status = generate.choose([self.take(1, [0, 1]), self.take(2, error=0.2), self.take(3, [1, 0])])
        self.assertEqual((chosen.take.seed, good, status), (2, 3, "ok"))

    def test_with_no_clean_take_the_best_of_the_valid_ones_is_chosen_and_one_that_was_not_understood_never_is(self):
        chosen, good, status = generate.choose([self.take(1, [1, 0], error=0.3), self.take(2, [0, 1], error=0.1), self.take(3, understood=False)])
        self.assertEqual((chosen.take.seed, good, status), (2, 2, "ok"))

    def test_a_word_that_none_of_its_takes_understood_is_for_review_whatever_is_at_its_ends(self):
        self.assertEqual(generate.choose([self.take(1, understood=False), self.take(2, [1, 0], understood=False)])[1:], (0, "review"))


class Listening(unittest.TestCase):
    """The listeners are the slow part, so they are asked only about the takes that have a chance, and never twice about one."""

    def run_listen_to(self, verdicts: list[generate.Verdict], understood: set[int] = frozenset(), **how) -> list[int]:
        heard: list[int] = []

        def listen(v, judge, said, sounds, ways=None, same=None, shipped=False):
            heard.append(v.take.seed)
            v.listened, v.understood = True, v.take.seed in understood
            return v

        with mock.patch.object(generate, "listen", listen):
            generate.listen_to(verdicts, None, "x.", "x", **how)
        return heard

    def test_it_says_to_listen_as_the_game_plays_the_take_when_it_is_asked_to(self):
        asked: list[bool] = []

        def listen(v, judge, said, sounds, ways=None, same=None, shipped=False):
            asked.append(shipped)
            return v

        with mock.patch.object(generate, "listen", listen):
            generate.listen_to([verdict(1)], None, "x.", "x")
            generate.listen_to([verdict(2)], None, "x.", "x", shipped=True)
        self.assertEqual(asked, [False, True])

    def test_it_hears_the_takes_that_have_no_flag(self):
        takes = [verdict(1), verdict(2, flags=["clipped"]), verdict(3)]
        self.assertEqual(self.run_listen_to(takes), [1, 3])

    def test_it_does_not_hear_a_take_that_was_heard(self):
        takes = [verdict(1, listened=True, understood=True), verdict(2)]
        self.assertEqual(self.run_listen_to(takes), [2])

    def test_with_every_take_flagged_it_hears_all_of_them_unless_it_is_told_how_many(self):
        takes = [verdict(seed, flags=["a"] * seed) for seed in (1, 2, 3, 4, 5)]
        self.assertEqual(self.run_listen_to(takes), [1, 2, 3, 4, 5])
        self.assertEqual(self.run_listen_to([verdict(seed, flags=["a"] * seed) for seed in (5, 4, 3, 2, 1)], fallback=3), [1, 2, 3], "the fewest flags first")

    def test_with_a_fallback_of_nothing_it_hears_no_flagged_take(self):
        self.assertEqual(self.run_listen_to([verdict(1, flags=["a"]), verdict(2, flags=["b"])], fallback=0), [])

    def test_it_hears_no_flagged_take_when_another_was_understood(self):
        takes = [verdict(1, listened=True, understood=True), verdict(2, flags=["clipped"])]
        self.assertEqual(self.run_listen_to(takes, fallback=3), [])
        self.assertEqual(self.run_listen_to([verdict(1, listened=True, understood=True), verdict(2, flags=["clipped"])]), [])

    def test_it_hears_a_flagged_take_when_none_was_understood(self):
        takes = [verdict(1, listened=True, understood=False), verdict(2, flags=["clipped"])]
        self.assertEqual(self.run_listen_to(takes, fallback=3), [2])


class Shipped(unittest.TestCase):
    """The encoder undoes some clips that were clear as masters, so a take can be heard as the game plays it, at the level the packer sets it to and either side."""

    GO = Heard("Go.", "ɡ O")
    LOST = Heard("Hello.", "h ɛ l O")

    class Listeners:
        """Listeners who write down what the script says, one answer for each time they are asked."""

        def __init__(self, script: list[Heard]) -> None:
            self.script = list(script)
            self.asked = 0

        def listen(self, audio: np.ndarray) -> Heard:
            self.asked += 1
            return self.script.pop(0)

    def run_listen(self, script: list[Heard], shipped: bool = True, said: str = "go.", sounds: str = "ɡˈO.", same=None):
        """Hears one take, with an encoder that only says at which level it was asked. Returns the take, the listeners and the levels that were played."""
        levels: list[float] = []

        def packed(audio: np.ndarray, offset_db: float = 0.0) -> np.ndarray:
            levels.append(offset_db)
            return audio

        listeners, take = self.Listeners(script), verdict(1)
        with mock.patch.object(generate, "as_packed", packed):
            generate.listen(take, listeners, said, sounds, None, same, shipped)
        return take, listeners, levels

    def test_a_take_is_heard_once_unless_it_is_to_be_heard_as_the_game_plays_it(self):
        take, listeners, levels = self.run_listen([self.GO], shipped=False)
        self.assertEqual((take.understood, listeners.asked, levels), (True, 1, []))

    def test_a_take_that_was_understood_is_heard_where_the_packer_sets_it_and_either_side_of_that(self):
        take, listeners, levels = self.run_listen([self.GO] * (1 + len(generate.PACKED_OFFSETS)))
        self.assertEqual((take.understood, listeners.asked, levels), (True, 1 + len(generate.PACKED_OFFSETS), list(generate.PACKED_OFFSETS)))
        self.assertEqual(generate.PACKED_OFFSETS[0], 0.0, "the level the packer sets it to is the one that counts, so it is the first to be heard")
        self.assertLess(min(generate.PACKED_OFFSETS), 0.0)
        self.assertGreater(max(generate.PACKED_OFFSETS), 0.0)
        self.assertNotIn("shipped", take.extra)

    def test_a_take_the_encoder_undoes_at_one_level_is_not_understood_and_is_not_heard_at_the_rest(self):
        take, listeners, levels = self.run_listen([self.GO, self.GO, self.LOST, self.GO])
        self.assertFalse(take.understood)
        self.assertFalse(take.valid)
        self.assertEqual((listeners.asked, levels), (3, list(generate.PACKED_OFFSETS[:2])))

    def test_the_take_says_what_the_listeners_made_of_it_once_it_was_encoded_and_at_which_level(self):
        take, _, _ = self.run_listen([self.GO, self.GO, self.LOST])
        self.assertEqual((take.heard, take.sounds), ("Hello.", "h ɛ l O"))
        self.assertGreater(take.error, UNDERSTOOD)
        self.assertIn(f"{generate.PACKED_OFFSETS[1]:+.0f} dB", take.extra["shipped"])
        self.assertFalse(take.extra["wordsOk"])

    def test_the_level_the_packer_sets_it_to_is_said_as_that_and_not_as_a_distance_from_it(self):
        take, _, _ = self.run_listen([self.GO, self.LOST])
        self.assertIn("as the packer sets it", take.extra["shipped"])
        self.assertNotIn("+0 dB", take.extra["shipped"])

    def test_a_take_that_was_not_understood_as_a_master_is_not_played_through_the_encoder(self):
        take, listeners, levels = self.run_listen([self.LOST])
        self.assertEqual((take.understood, listeners.asked, levels), (False, 1, []))
        self.assertNotIn("shipped", take.extra)

    def test_a_sentence_is_held_to_the_same_rule_by_its_words(self):
        said, sounds = "the cat sat on the mat today.", "ðə kˈæt sˈæt ˈɔn ðə mˈæt tədˈA."
        right, split = Heard("The cat sat on the mat today.", sounds), Heard("The cat sat on the mat to day.", sounds)
        same = lambda a, b: False  # noqa: E731
        take, _, _ = self.run_listen([right] * (1 + len(generate.PACKED_OFFSETS)), said=said, sounds=sounds, same=same)
        self.assertTrue(take.understood)
        # Written without its spaces it is the same letters, which is enough for a word, but a sentence is held to its words.
        take, _, _ = self.run_listen([right, right, split, right], said=said, sounds=sounds, same=same)
        self.assertFalse(take.understood, "a word that the encoder broke in two is two words wrong, whatever it did before")
        self.assertEqual(take.heard, "The cat sat on the mat to day.")

    def test_the_sounds_written_before_and_after_the_word_are_in_the_take_and_it_is_still_understood(self):
        take, _, _ = self.run_listen([Heard("Go.", "d ɡ O t")], shipped=False)
        self.assertEqual(take.extra["edges"], [1, 1])
        self.assertTrue(take.valid)
        self.assertFalse(take.clean)

    def test_a_take_with_nothing_at_its_ends_has_no_edges_in_its_report(self):
        take, _, _ = self.run_listen([self.GO], shipped=False)
        self.assertNotIn("edges", take.extra)
        self.assertTrue(take.clean)

    def run_listen_with_encoder(self, packed):
        take, listeners = verdict(1), self.Listeners([self.GO] * (1 + len(generate.PACKED_OFFSETS)))
        with mock.patch.object(generate, "as_packed", packed):
            generate.listen(take, listeners, "go.", "ɡˈO.", None, None, True)
        return take

    def test_a_take_that_is_a_rattle_once_it_is_encoded_is_flagged_and_is_not_valid(self):
        take = self.run_listen_with_encoder(lambda audio, offset_db=0.0: voice(0.4, 90.0))
        self.assertTrue(take.understood)
        self.assertTrue(any(flag.startswith("rattle once encoded") for flag in take.flags), take.flags)
        self.assertFalse(take.valid)

    def test_a_rattle_does_not_depend_on_the_level_so_it_is_looked_for_where_the_packer_sets_it_only(self):
        take = self.run_listen_with_encoder(lambda audio, offset_db=0.0: voice(0.4, 90.0) if offset_db else audio)
        self.assertEqual(take.flags, [])

    def test_a_take_that_is_no_rattle_once_it_is_encoded_has_no_flag(self):
        self.assertEqual(self.run_listen_with_encoder(lambda audio, offset_db=0.0: audio).flags, [])

    def test_a_take_that_the_encoder_undoes_is_not_also_flagged_for_a_rattle(self):
        take, listeners = verdict(1), self.Listeners([self.GO, self.LOST])
        with mock.patch.object(generate, "as_packed", lambda audio, offset_db=0.0: voice(0.4, 90.0)):
            generate.listen(take, listeners, "go.", "ɡˈO.", None, None, True)
        self.assertFalse(take.understood)
        self.assertEqual(take.flags, [])


class PackedLevel(unittest.TestCase):
    """A line is heard at the gain `tools/assets/speech.ts` gives its master, which runs from about 9 dB down to 5 dB up from clip to clip."""

    ROOT = Path(__file__).resolve().parents[2]

    @staticmethod
    def tone(level: float, seconds: float = 0.5) -> np.ndarray:
        t = np.arange(int(seconds * generate.SAMPLE_RATE)) / generate.SAMPLE_RATE
        return (level * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)

    def test_the_loudness_and_the_ceiling_are_the_ones_the_packer_has(self):
        speech = (self.ROOT / "tools/assets/speech.ts").read_text()
        shared = (self.ROOT / "src/shared/audio.ts").read_text()
        self.assertEqual(generate.CEILING_DB, float(re.search(r"const SAMPLE_PEAK_LIMIT = (-?[\d.]+);", speech).group(1)))
        self.assertEqual(generate.PACK_LUFS, float(re.search(r"export const SPEECH = \{ lufs: (-?[\d.]+),", shared).group(1)))
        self.assertEqual(generate.MP3_QUALITY, int(re.search(r"const QUALITY = (\d+);", speech).group(1)))

    def test_a_quiet_clip_is_set_to_the_loudness_every_clip_is_set_to(self):
        master = self.tone(0.02)
        gain = generate.pack_gain_db(master)
        self.assertGreater(gain, 0.0)
        self.assertAlmostEqual(dsp.momentary_loudness(master * 10 ** (gain / 20)), generate.PACK_LUFS, delta=0.01)

    def test_a_loud_clip_is_made_quieter(self):
        self.assertLess(generate.pack_gain_db(self.tone(0.8)), 0.0)

    def test_a_clip_with_a_tall_peak_is_not_made_louder_than_the_highest_sample_allows(self):
        master = self.tone(0.02)
        master[100] = 0.9
        gain = generate.pack_gain_db(master)
        self.assertLess(gain, generate.PACK_LUFS - dsp.momentary_loudness(master))
        self.assertAlmostEqual(float(dsp.db(dsp.peak(master))) + gain, generate.CEILING_DB, delta=0.01)

    def test_a_take_is_encoded_at_the_packers_gain_and_at_the_offset_it_is_asked_for(self):
        asked: list[float] = []

        def through(audio: np.ndarray, gain_db: float = 0.0) -> np.ndarray:
            asked.append(gain_db)
            return audio

        take = self.tone(0.3)
        with mock.patch.object(generate, "through_mp3", through):
            generate.as_packed(take)
            generate.as_packed(take, -2.0)
            generate.as_packed(take, 2.0)
        packed = generate.pack_gain_db(generate.master_samples(take))
        self.assertEqual([round(gain - packed, 6) for gain in asked], [0.0, -2.0, 2.0])

    def test_a_level_is_written_in_the_steps_the_packer_writes_it_in(self):
        # The levels and the samples of the test of `wavBytes` in tests/tools/speech.test.ts: half a step goes up, as `Math.round` sends it, and a level
        # past full scale is held at it. The sound file library takes -0.7 to -22938 and -0.5 to -16384, and a word on the edge of being understood is heard
        # differently from the one rounding to the other.
        levels = np.array([0.7, -0.7, 0.3, 1.0, -1.0, 1.5, -1.5, 0.5, -0.5, 0.123456789, 0.0, 0.00001, -0.00001], dtype=np.float32)
        written = generate.packer_samples(levels)
        self.assertEqual(written.dtype, np.int16)
        self.assertEqual(written.tolist(), [22937, -22937, 9830, 32767, -32767, 32767, -32767, 16384, -16383, 4045, 0, 0, 0])

    def test_a_take_is_heard_as_the_master_that_is_saved_of_it(self):
        t = np.arange(int(0.4 * generate.SAMPLE_RATE)) / generate.SAMPLE_RATE
        take = (0.55 * np.sin(2 * np.pi * 173 * t) * np.sin(2 * np.pi * 3 * t) ** 2 + 0.01).astype(np.float32)
        with tempfile.TemporaryDirectory() as scratch, mock.patch.object(generate, "OUT", Path(scratch)):
            generate.save("word.x", take)
            saved = generate.sf.read(Path(scratch) / "word.x.wav", dtype="int16")[0]
        heard = generate.master_samples(take)
        self.assertEqual(heard.dtype, np.float32)
        self.assertTrue(np.array_equal((heard * 32768).astype(np.int64), saved.astype(np.int64)))
        self.assertGreater(int(np.count_nonzero(np.abs(heard) > 0.01)), 1000, "the take has sound in it, so a match means something")


class SpeakingAGroup(unittest.TestCase):
    GROUP = ("word.a", "word.b", "word.c", "word.d", "word.e", "word.f")

    def run_group(
        self,
        understood: dict[str, set[int]],
        overrides: dict | None = None,
        tiny: set[tuple[str, int]] = frozenset(),
        members=None,
        shipped: bool = False,
        edged: dict[str, set[int]] | None = None,
    ):
        """
        Speaks the group with a model that says each line the same, and listeners who understand a line in the orders that are named, and who write a sound
        before the word in the orders that are named in `edged`.
        """
        orders: list[list[str]] = []
        asked: list[bool] = []
        self.asked = asked

        def speak_list(kokoro, parts, order, take, carriers):
            orders.append(list(order))
            spoken = len(orders) - 1
            return {key: np.zeros(100 if (key, spoken) in tiny else SAMPLE_RATE // 2, np.float32) for key in order}

        def inspect_cut(piece, phonemes, take, kind):
            return verdict(take.seed)

        def listen_to(verdicts, judge, said, sounds, ways=None, same=None, fallback=None, shipped=False):
            asked.append(shipped)
            for v in verdicts:
                if not v.listened:
                    v.listened, v.understood = True, (v.take.seed - 100) in understood[said]
                    if (v.take.seed - 100) in (edged or {}).get(said, ()):
                        v.extra["edges"] = [1, 0]

        lines = members or [{"id": key, "text": key} for key in self.GROUP]
        phonemes = {key: key for key in self.GROUP}
        with (
            mock.patch.object(generate, "speak_list", speak_list),
            mock.patch.object(generate, "inspect_cut", inspect_cut),
            mock.patch.object(generate, "listen_to", listen_to),
            mock.patch("builtins.print"),
        ):
            found = generate.speak_group(None, None, self.GROUP, lines, phonemes, ["kˈɪt."], overrides or {}, shipped=shipped)
        return orders, found

    def everything(self, orders: set[int]) -> dict[str, set[int]]:
        return {key: set(orders) for key in self.GROUP}

    def test_it_stops_after_a_round_when_every_line_was_understood_twice(self):
        orders, found = self.run_group(self.everything({0, 1}))
        self.assertEqual(len(orders), generate.PER_ROUND)
        self.assertTrue(all(len(takes) == generate.PER_ROUND for takes in found.values()))

    def test_a_line_that_was_understood_once_is_spoken_for_in_a_second_round_and_the_others_are_not(self):
        understood = self.everything({0, 1}) | {"word.b": {0, generate.PER_ROUND + 1}}
        orders, found = self.run_group(understood)
        self.assertEqual(len(orders), 2 * generate.PER_ROUND)
        self.assertEqual(len(found["word.b"]), 2 * generate.PER_ROUND)
        self.assertEqual(len(found["word.a"]), generate.PER_ROUND, "a line that has its takes is not asked for more")

    def test_a_line_whose_takes_were_understood_with_a_sound_at_the_front_is_spoken_for_until_two_are_clean(self):
        everyone = set(range(generate.MAX_ORDERS))
        # understood in every order, and written with a sound before it in the first five
        orders, found = self.run_group({key: everyone for key in self.GROUP}, edged={"word.b": set(range(5))})
        self.assertEqual(len(orders), 2 * generate.PER_ROUND, "the second round has orders 5, 6 and 7, which are clean")
        self.assertEqual(sum(v.clean for v in found["word.b"]), 3)
        self.assertEqual(sum(v.valid for v in found["word.b"]), 2 * generate.PER_ROUND, "the takes with a sound at the front were understood, so they are still takes of the line")
        self.assertEqual(len(found["word.a"]), generate.PER_ROUND, "a line that has two clean takes is not asked for more")

    def test_a_line_that_no_order_gets_clean_is_given_every_order_there_is_and_is_still_understood(self):
        everyone = set(range(generate.MAX_ORDERS))
        orders, found = self.run_group({key: everyone for key in self.GROUP}, edged={"word.b": everyone})
        self.assertEqual(len(orders), generate.MAX_ORDERS)
        self.assertEqual((sum(v.clean for v in found["word.b"]), sum(v.valid for v in found["word.b"])), (0, generate.MAX_ORDERS))

    def test_a_line_nothing_understands_is_given_every_order_there_is_and_then_it_is_left(self):
        orders, found = self.run_group(self.everything({0, 1}) | {"word.c": set()})
        self.assertEqual(len(orders), generate.MAX_ORDERS)
        self.assertEqual(len(found["word.c"]), generate.MAX_ORDERS)
        self.assertEqual(sum(v.valid for v in found["word.c"]), 0)

    def test_the_first_order_is_the_order_of_the_group_and_the_others_are_other_orders_of_it(self):
        orders, _ = self.run_group(self.everything(set()))
        self.assertEqual(orders[0], list(self.GROUP))
        self.assertTrue(all(sorted(order) == sorted(self.GROUP) for order in orders))
        self.assertGreater(len({tuple(order) for order in orders}), generate.MAX_ORDERS // 2)

    def test_the_orders_are_the_same_every_time(self):
        first, _ = self.run_group(self.everything(set()))
        again, _ = self.run_group(self.everything(set()))
        self.assertEqual(first, again)

    def test_a_piece_too_short_to_be_a_word_is_not_looked_at(self):
        _, found = self.run_group(self.everything({0, 1, 2, 3}), tiny={("word.a", 1)})
        self.assertEqual([v.take.seed for v in found["word.a"]], [100, 102, 103])

    def test_a_line_whose_take_is_named_by_hand_is_not_asked_of_the_group(self):
        orders, found = self.run_group(self.everything({0, 1}) | {"word.d": set()}, overrides={"word.d": {"style": 3, "seed": 9}})
        self.assertNotIn("word.d", found)
        self.assertEqual(len(orders), generate.PER_ROUND, "and it does not keep the group going")

    def test_the_lines_that_are_made_are_the_ones_it_asks_for_and_the_rest_of_the_group_is_only_spoken(self):
        members = [{"id": "word.b", "text": "word.b"}]
        orders, found = self.run_group(self.everything({0, 1}), members=members)
        self.assertEqual(list(found), ["word.b"])
        self.assertTrue(all(len(order) == len(self.GROUP) for order in orders))

    def test_the_takes_are_heard_as_the_game_plays_them_only_when_it_is_asked_to(self):
        self.run_group(self.everything({0, 1}))
        self.assertEqual(set(self.asked), {False})
        self.run_group(self.everything({0, 1}), shipped=True)
        self.assertEqual(set(self.asked), {True}, "every line of the group is heard that way")


class Entries(unittest.TestCase):
    def chosen(self) -> generate.Verdict:
        return verdict(1, True, listened=True)

    def test_a_word_shout_or_cheer_says_it_was_made_by_this_method(self):
        for kind in ("word", "shout", "cheer"):
            made = generate.entry(f"{kind}.x", kind, "x.", "x.", self.chosen(), 2, "ok", 4, "plan", "x.")
            self.assertEqual(made["method"], generate.METHOD, kind)

    def test_a_clip_of_another_kind_says_nothing_of_it(self):
        for kind in ("open", "line", "again", "milestone"):
            self.assertNotIn("method", generate.entry(f"{kind}.x", kind, "x.", "x.", self.chosen(), 2, "ok", 4, "plan", "x."), kind)


class JudgeThatSays:
    """Listeners who understand a take or do not, in the order the takes are given them, whatever the take is."""

    def __init__(self, script: list[bool]) -> None:
        self.script = list(script)
        self.calls = 0

    def listen(self, audio: np.ndarray) -> Heard:
        self.calls += 1
        understood = self.script.pop(0) if self.script else False
        return Heard("Go.", "ɡ O") if understood else Heard("Hello.", "h ɛ l O")


class VoiceThatCounts(Tones):
    """A model that says every line as the same voiced buzz and counts how many times it was asked."""

    def say(self, phonemes: str, speed: float, seed: int, style: int = 0) -> Spoken:
        self.said.append(phonemes)
        audio = voice(1.0)
        return Spoken(audio=audio, frames=[3, len(audio) // 600, 1])


class MakingALine(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        for target in ("OUT",):
            patch = mock.patch.object(generate, target, Path(self.dir.name))
            patch.start()
            self.addCleanup(patch.stop)
        printing = mock.patch("builtins.print")
        printing.start()
        self.addCleanup(printing.stop)

    def make(self, kind: str, script: list[bool], candidates: list[generate.Verdict] | None = None):
        line = {"id": f"{kind}.go", "text": "go."}
        report: dict = {}
        voice_model, judge = VoiceThatCounts(), JudgeThatSays(script)
        plan = generate.plan_line(line, "ɡˈO.", "", {})
        generate.make_line(voice_model, judge, line, plan, candidates if candidates is not None else [], report, lambda: None)
        return report[line["id"]], voice_model, judge

    def test_a_kind_spoken_alone_is_spoken_two_ways_at_a_time_and_stops_when_two_were_understood(self):
        made, model, judge = self.make("open", [True, True])
        self.assertEqual((len(model.said), judge.calls, made["status"], made["good"], made["tried"]), (2, 2, "ok", 2, 2))

    def test_it_goes_on_to_the_next_two_ways_when_the_first_were_not_understood(self):
        made, model, judge = self.make("open", [False, False, True, True])
        self.assertEqual((len(model.said), judge.calls, made["good"], made["status"]), (4, 4, 2, "ok"))
        made, model, judge = self.make("open", [False, True, False, True])
        self.assertEqual((len(model.said), judge.calls, made["good"]), (4, 4, 2))

    def test_a_line_that_only_one_way_got_through_is_spoken_every_way_there_is_to_find_a_second(self):
        every = len(generate.STYLES) + generate.MORE_ROUNDS * len(generate.MORE_STYLES)
        made, model, judge = self.make("open", [False, False, True, False])
        self.assertEqual((len(model.said), judge.calls, made["good"], made["status"]), (every, every, 1, "ok"))

    def test_a_line_nobody_understands_is_spoken_every_way_there_is_and_is_left_for_a_person(self):
        made, model, judge = self.make("open", [])
        every = len(generate.STYLES) + generate.MORE_ROUNDS * len(generate.MORE_STYLES)
        self.assertEqual((len(model.said), made["tried"], made["good"]), (every, every, 0))
        self.assertNotEqual(made["status"], "ok")

    def test_a_take_that_was_chosen_by_hand_is_the_only_one_spoken(self):
        line = {"id": "open.go", "text": "go."}
        plan = generate.plan_line(line, "ɡˈO.", "", {"open.go": {"style": 3, "seed": 9}})
        report: dict = {}
        model, judge = VoiceThatCounts(), JudgeThatSays([False])
        generate.make_line(model, judge, line, plan, [], report, lambda: None)
        self.assertEqual((len(model.said), judge.calls), (1, 1))

    def test_a_word_whose_group_gave_two_understood_takes_is_not_spoken_alone_or_listened_to_again(self):
        heard = [verdict(100, True, listened=True), verdict(101, True, listened=True), verdict(102, flags=["clipped"])]
        made, model, judge = self.make("word", [], heard)
        self.assertEqual((len(model.said), judge.calls, made["good"], made["tried"], made["method"]), (0, 0, 2, 3, generate.METHOD))

    def test_a_word_is_spoken_alone_when_the_group_gave_one_understood_take(self):
        heard = [verdict(100, True, listened=True), verdict(101, False, listened=True)]
        made, model, judge = self.make("word", [True, True, True, True, True, True], heard)
        self.assertEqual(len(model.said), len(generate.STYLES))
        self.assertGreaterEqual(made["good"], 2)
        self.assertEqual(made["status"], "ok")

    def test_the_takes_of_the_group_that_nobody_heard_are_heard_before_a_word_is_spoken_alone(self):
        waiting = [verdict(100), verdict(101), verdict(102)]
        made, model, judge = self.make("word", [True, True, True], waiting)
        self.assertEqual((len(model.said), judge.calls, made["good"]), (0, 3, 3))

    def test_with_no_take_clean_the_best_flagged_ones_are_heard_so_that_a_person_can_see_what_was_said(self):
        waiting = [verdict(seed, flags=["a"] * (seed - 99)) for seed in range(100, 106)]
        made, model, judge = self.make("word", [False] * 40, waiting)
        self.assertGreaterEqual(judge.calls, 3)
        self.assertNotEqual(made["status"], "ok")

    def test_the_master_is_written(self):
        self.make("open", [True, True])
        self.assertTrue((Path(self.dir.name) / "open.go.wav").exists())

    def test_a_line_is_kept_only_when_it_is_understood_as_the_game_plays_it_if_it_is_asked_to_be(self):
        line = {"id": "open.go", "text": "go."}
        plan = generate.plan_line(line, "ɡˈO.", "", {})
        # Each way of speaking is heard as a master and at every level, and the first two are lost at the last level, so the next two are the ones.
        every = 1 + len(generate.PACKED_OFFSETS)
        script = [True] * (every - 1) + [False] + [True] * (every - 1) + [False] + [True] * (2 * every)
        model, judge = VoiceThatCounts(), JudgeThatSays(script)
        report: dict = {}
        with mock.patch.object(generate, "as_packed", lambda audio, offset_db=0.0: audio):
            generate.make_line(model, judge, line, plan, [], report, lambda: None, shipped=True)
        made = report[line["id"]]
        self.assertEqual((len(model.said), made["tried"], made["good"], made["status"]), (4, 4, 2, "ok"))


class Framing(unittest.TestCase):
    LINE = {"id": "last.8", "text": "8", "say": "eight", "frame": "What is five plus [eight]?"}

    def test_a_line_with_no_override_is_cut_from_its_own_sentence(self):
        self.assertIs(generate.framed_by_hand(self.LINE, {}), self.LINE)
        self.assertIs(generate.framed_by_hand(self.LINE, {"last.8": {"style": 8, "seed": 3}}), self.LINE)

    def test_an_override_names_another_sentence_with_the_same_piece_in_it(self):
        made = generate.framed_by_hand(self.LINE, {"last.8": {"frame": "What is two plus [eight]?"}})
        self.assertEqual(made["frame"], "What is two plus [eight]?")
        self.assertEqual(made["id"], "last.8")
        self.assertEqual(self.LINE["frame"], "What is five plus [eight]?", "the line itself is not changed")

    def test_an_override_that_cuts_another_piece_is_refused(self):
        with self.assertRaises(SystemExit):
            generate.framed_by_hand(self.LINE, {"last.8": {"frame": "What is two plus [nine]?"}})

    def test_only_the_ends_of_the_sentence_are_held_to_being_quiet_and_not_an_end_that_was_cut_where_the_voice_stopped(self):
        flags = ["loud at start -5dB", "loud at end -17dB", "length 2.00s"]
        leads = frames.parse("What is [eight] plus five?")
        ends = frames.parse("Count them. [How many?]")
        opens = frames.parse("[What is] five plus six?")
        self.assertEqual(generate.kept_flags(flags, leads, hissed=False), ["length 2.00s"])
        self.assertEqual(generate.kept_flags(flags, opens, hissed=False), ["loud at start -5dB", "length 2.00s"])
        self.assertEqual(generate.kept_flags(flags, ends, hissed=False), ["loud at end -17dB", "length 2.00s"])
        self.assertEqual(generate.kept_flags(flags, ends, hissed=True), ["length 2.00s"])

    def test_a_sound_on_the_edge_of_a_piece_that_the_piece_does_not_have_is_counted_on_that_side(self):
        class Writes:
            def __init__(self, sounds: str) -> None:
                self.written = sounds

            def sounds(self, audio: np.ndarray) -> str:
                return self.written

        audio = np.zeros(10, np.float32)
        self.assertEqual(generate.stray_sounds(Writes("t uː"), audio, "tˈu"), [0, 0])
        self.assertEqual(generate.stray_sounds(Writes("d eɪ t"), audio, "ˈAt"), [1, 0])
        self.assertEqual(generate.stray_sounds(Writes("f ɔɹ t"), audio, "fˈɔɹ"), [0, 1])

    def test_a_piece_that_ends_its_sentence_in_voice_has_the_hiss_after_the_voice_cut_and_a_piece_that_leads_does_not(self):
        breath = np.random.default_rng(1).standard_normal(int(0.15 * SAMPLE_RATE))
        spectrum = np.fft.rfft(breath)
        spectrum[np.fft.rfftfreq(len(breath), 1 / SAMPLE_RATE) < 4000] = 0
        breath = np.fft.irfft(spectrum, len(breath))
        piece = np.concatenate([voice(0.4), (0.2 * breath / np.max(np.abs(breath))).astype(np.float32)])
        ends = frames.parse("Count them. [How many?]")
        leads = frames.parse("What is [eight] plus five?")
        self.assertLess(len(generate.closed(piece, ends, "mˈɛni?")), len(piece) - int(0.1 * SAMPLE_RATE))
        self.assertIs(generate.closed(piece, leads, "ˈAt"), piece)
        self.assertIs(generate.closed(piece, ends, "ˈAt?"), piece, "a sentence that ends on a burst is not cut: its breath is the burst")

    def test_every_way_of_speaking_a_sentence_is_tried_in_order_and_there_are_ten(self):
        takes = generate.frame_takes()
        self.assertEqual(len(takes), 10)
        self.assertEqual([t.style for t in takes[:4]], generate.LINE_STYLES)
        self.assertEqual(len({(t.style, t.seed) for t in takes}), 10)


if __name__ == "__main__":
    unittest.main()
