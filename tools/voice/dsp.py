"""Plain signal work on the clips: cutting, fading, and the measures the checks use."""

from __future__ import annotations

import numpy as np
import parselmouth
from scipy import signal

SAMPLE_RATE = 24000


def db(x: float | np.ndarray) -> float | np.ndarray:
    return 20 * np.log10(np.maximum(x, 1e-9))


def peak(audio: np.ndarray) -> float:
    return float(np.max(np.abs(audio))) if len(audio) else 0.0


def _k_weighting(rate: int) -> tuple[tuple[np.ndarray, np.ndarray], tuple[np.ndarray, np.ndarray]]:
    """The two filters of BS.1770, as `tools/audio/loudness.ts` derives them for the rate in use: a high shelf near 1.7 kHz and a high-pass near 38 Hz."""
    gain, f0, q = 3.999843853973347, 1681.974450955533, 0.7071752369554196
    k = np.tan(np.pi * f0 / rate)
    vh = 10 ** (gain / 20)
    vb = vh**0.4996667741545416
    a0 = 1 + k / q + k * k
    shelf = (
        np.array([(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0]),
        np.array([1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]),
    )
    f0, q = 38.13547087602444, 0.5003270373238773
    k = np.tan(np.pi * f0 / rate)
    a0 = 1 + k / q + k * k
    return shelf, (np.array([1.0, -2.0, 1.0]), np.array([1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]))


def momentary_loudness(audio: np.ndarray, rate: int = SAMPLE_RATE) -> float:
    """
    The loudest 400 ms of a clip in LUFS, measured the way the packer measures it (`momentaryLoudness` in `tools/audio/loudness.ts`): K-weighted,
    in blocks of 400 ms every 50 ms, with the clip padded by silence to fill a block, and both channels the same.
    """
    block, hop = round(0.4 * rate), round(0.05 * rate)
    padded = np.zeros(max(len(audio), block) + block)
    padded[: len(audio)] = audio
    shelf, high_pass = _k_weighting(rate)
    weighted = signal.lfilter(*high_pass, signal.lfilter(*shelf, padded))
    running = np.concatenate([[0.0], np.cumsum(2.0 * weighted**2)])
    starts = np.arange(0, len(weighted) - block + 1, hop)
    best = float(((running[starts + block] - running[starts]) / block).max())
    return -0.691 + 10 * np.log10(best) if best > 0 else float("-inf")


def trim_bounds(audio: np.ndarray, floor_db: float = -45.0, pad: float = 0.012) -> tuple[int, int]:
    """Where `trim` cuts, as the first and the last-plus-one sample it keeps."""
    loud = np.abs(audio) > peak(audio) * 10 ** (floor_db / 20)
    if not loud.any():
        return 0, len(audio)
    where = np.flatnonzero(loud)
    keep = int(pad * SAMPLE_RATE)
    return max(0, where[0] - keep), min(len(audio), where[-1] + 1 + keep)


def trim(audio: np.ndarray, floor_db: float = -45.0, pad: float = 0.012) -> np.ndarray:
    """Cuts the quiet off both ends and keeps `pad` seconds of it. The floor is measured from the loudest sample."""
    start, end = trim_bounds(audio, floor_db, pad)
    return audio[start:end]


def trim_speech(audio: np.ndarray, vowel_first: bool = False, head: float = 0.006, tail: float = 0.02) -> np.ndarray:
    """Cuts a clip to the sound in it, as `speech_bounds` says."""
    start, end = speech_bounds(audio, vowel_first, head, tail)
    return audio[start:end]


def speech_bounds(audio: np.ndarray, vowel_first: bool = False, head: float = 0.006, tail: float = 0.02) -> tuple[int, int]:
    """
    Cuts a clip to the sound in it. The speech begins where the level first reaches 26 dB below the loudest, and the clip starts at the
    quiet before that where the level was last above -46 dB, so a soft consonant that leads into the vowel is kept and the breath, tails
    and clicks of what came before are not. The end is found the same way, going the other direction. Levels are read in steps of 5 ms
    from the loudest sample in each, not from single samples, so one click does not decide where a clip begins.

    A sound that begins with a vowel has no soft consonant to keep, and what is ahead of its first sharp rise is the breath of the model,
    which a listener hears as a consonant that is not there (an `n` before an `f`, a `th` before an `e`). With `vowel_first` the clip
    starts where the sound rises to within 20 dB of the loudest, and only the last stretch above -32 dB is kept before that.
    """
    step = 0.005
    n = int(step * SAMPLE_RATE)
    frames = len(audio) // n
    if frames < 2:
        return 0, len(audio)
    levels = np.asarray(db(np.abs(audio[: frames * n]).reshape(frames, n).max(axis=1) / max(peak(audio), 1e-9)))
    reach, floor = (-20.0, -32.0) if vowel_first else (-26.0, -46.0)
    reaching = np.flatnonzero(levels >= reach)
    if len(reaching) == 0:
        return trim_bounds(audio)
    first = int(reaching[0])
    last = int(np.flatnonzero(levels >= -26.0)[-1]) if (levels >= -26.0).any() else int(reaching[-1])
    while first > 0 and levels[first - 1] > floor:
        first -= 1
    while last < frames - 1 and levels[last + 1] > -46.0:
        last += 1
    start = max(0, first * n - int(head * SAMPLE_RATE))
    end = min(len(audio), (last + 1) * n + int(tail * SAMPLE_RATE))
    return start, end


def settle(audio: np.ndarray, f2_min: float, stay: float = 0.02, head: float = 0.004) -> np.ndarray:
    """
    Cuts away what is before the second formant has risen to `f2_min` and stayed there for `stay` seconds. A vowel the model speaks
    with nothing before it begins with a glide, as in `wee` for `ee`, which a listener hears as a consonant. What is kept is the vowel
    once it has arrived. A clip whose formant never gets there is returned as it was.
    """
    sound = parselmouth.Sound(audio.astype(np.float64), sampling_frequency=SAMPLE_RATE)
    if sound.duration < 0.1:
        return audio
    formants = sound.to_formant_burg(time_step=0.005, max_number_of_formants=5, maximum_formant=5500, window_length=0.03, pre_emphasis_from=50)
    pitch = sound.to_pitch(time_step=0.005, pitch_floor=100, pitch_ceiling=500)
    needed = max(1, int(round(stay / 0.005)))
    run = 0
    for t in np.arange(0.01, sound.duration - 0.01, 0.005):
        high = not np.isnan(pitch.get_value_at_time(t)) and formants.get_value_at_time(2, t) >= f2_min
        run = run + 1 if high else 0
        if run == needed:
            start = max(0.0, t - (needed - 1) * 0.005 - head)
            return audio[int(start * SAMPLE_RATE) :]
    return audio


def cut_hiss(audio: np.ndarray, level: float = -42.0, share: float = 0.5, after: float = 0.02, ramp: float = 0.012) -> np.ndarray:
    """
    Cuts away the hiss that some takes breathe out after the last voiced sound. It is for a clip that ends in a sound with voice (a vowel,
    `n`, `l`), where nothing that is meant is hissy, and a listener hears it as an `s` or a `t` that is not there: `apples`, `bunnies`.
    The hiss is the first stretch after the voice that is louder than `level` dB below the loudest sound and has more than `share` of its
    energy above 4 kHz, read in steps of 10 ms. The clip ends there, with a short fall. A clip with no hiss is returned as it was.
    """
    pitch = Pitch(audio)
    voiced = np.flatnonzero(pitch.voiced)
    if len(voiced) == 0:
        return audio
    top = max(peak(audio), 1e-9)
    n = int(0.01 * SAMPLE_RATE)
    freqs = np.fft.rfftfreq(n, 1 / SAMPLE_RATE)
    for i in range(int((pitch.times[voiced[-1]] + after) * SAMPLE_RATE) // n, len(audio) // n):
        step = audio[i * n : (i + 1) * n]
        spectrum = np.abs(np.fft.rfft(step * np.hanning(n))) ** 2
        if db(np.sqrt(np.mean(step**2)) / top) > level and spectrum[freqs > 4000].sum() > share * max(spectrum.sum(), 1e-12):
            return fade(audio[: i * n], head=0.0, tail=ramp)
    return audio


def onset_db(audio: np.ndarray, within: float = 0.05) -> float:
    """How loud the first moments of a clip are, in dB below its loudest, so a consonant that the model spoke too softly to be heard can be told from one that was not."""
    n = max(1, int(within * SAMPLE_RATE))
    return float(db(peak(audio[:n]) / max(peak(audio), 1e-9)))


def fade(audio: np.ndarray, head: float = 0.008, tail: float = 0.03) -> np.ndarray:
    """A short rise at the start and a longer fall at the end, so a clip never begins or stops with a click."""
    out = audio.copy()
    n_head = min(int(head * SAMPLE_RATE), len(out) // 2)
    n_tail = min(int(tail * SAMPLE_RATE), len(out) // 2)
    if n_head:
        out[:n_head] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(n_head) / n_head)
    if n_tail:
        out[-n_tail:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(n_tail) / n_tail)
    return out


def normalise(audio: np.ndarray, peak_db: float = -3.0) -> np.ndarray:
    top = peak(audio)
    return audio if top == 0 else audio * (10 ** (peak_db / 20) / top)


def envelope(audio: np.ndarray, step: float = 0.01) -> np.ndarray:
    """Loudest sample in each step, in dB below the loudest in the clip."""
    n = int(step * SAMPLE_RATE)
    frames = len(audio) // n
    if frames == 0:
        return np.array([0.0])
    levels = np.abs(audio[: frames * n]).reshape(frames, n).max(axis=1)
    return np.asarray(db(levels / max(peak(audio), 1e-9)))


def bursts(audio: np.ndarray, floor_db: float = -35.0, gap: float = 0.09) -> list[tuple[float, float]]:
    """Stretches of sound, in seconds. Sound that comes again after a silence longer than `gap` is another burst."""
    step = 0.01
    loud = envelope(audio, step) > floor_db
    runs: list[list[int]] = []
    for i, on in enumerate(loud):
        if not on:
            continue
        if runs and i - runs[-1][1] <= round(gap / step):
            runs[-1][1] = i
        else:
            runs.append([i, i])
    return [(a * step, (b + 1) * step) for a, b in runs]


def longest_silence(audio: np.ndarray, floor_db: float = -40.0) -> float:
    """The longest quiet stretch inside the clip, in seconds."""
    step = 0.01
    quiet = envelope(audio, step) < floor_db
    longest = run = 0
    for q in quiet:
        run = run + 1 if q else 0
        longest = max(longest, run)
    return longest * step


def edge_db(audio: np.ndarray, seconds: float = 0.012) -> tuple[float, float]:
    """How loud the first and last moments are, in dB below the peak. A clip that was cut in the middle of a sound is loud there."""
    n = max(1, int(seconds * SAMPLE_RATE))
    top = max(peak(audio), 1e-9)
    return float(db(peak(audio[:n]) / top)), float(db(peak(audio[-n:]) / top))


class Pitch:
    """The voice's pitch over time, and what it says about how the clip was spoken."""

    def __init__(self, audio: np.ndarray) -> None:
        # The tracker refuses a sound shorter than a few periods of its lowest pitch. A piece that short is silence to it.
        audio = np.pad(audio, (0, max(0, int(0.06 * SAMPLE_RATE) - len(audio))))
        sound = parselmouth.Sound(audio.astype(np.float64), sampling_frequency=SAMPLE_RATE)
        track = sound.to_pitch(time_step=0.01, pitch_floor=120, pitch_ceiling=500)
        self.hz = track.selected_array["frequency"]
        self.times = np.asarray(track.xs())
        self.voiced = self.hz > 0

    @property
    def fraction(self) -> float:
        return float(self.voiced.mean()) if len(self.hz) else 0.0

    @property
    def median(self) -> float:
        return float(np.median(self.hz[self.voiced])) if self.voiced.any() else 0.0

    @property
    def semitones(self) -> np.ndarray:
        """Voiced pitch in semitones from the clip's own median."""
        return 12 * np.log2(self.hz[self.voiced] / self.median) if self.voiced.any() else np.zeros(1)

    @property
    def span(self) -> float:
        s = self.semitones
        return float(s.max() - s.min())

    @property
    def jump(self) -> float:
        """The biggest step between two voiced moments side by side, in semitones. A pitch tracker losing the voice jumps by an octave."""
        both = self.voiced[1:] & self.voiced[:-1]
        if not both.any():
            return 0.0
        steps = 12 * np.abs(np.log2(self.hz[1:][both] / self.hz[:-1][both]))
        return float(steps.max())

    def at(self, part: float) -> float:
        """Pitch at a fraction through the voiced stretch, in semitones from the median, for judging whether a clip rises or falls."""
        s = self.semitones
        return float(s[min(len(s) - 1, int(part * len(s)))])


def deep_share(audio: np.ndarray, below: float = 130.0, within: float = 12.0) -> float:
    """
    The share of the loud voiced moments of a clip, those within `within` dB of the loudest, whose pitch is under `below` Hz. The model's voice sits
    between 160 and 270 Hz. Now and then it says a clip, mostly a back vowel at the end of a word, in a rattle at half that pitch, which is not a
    low voice and is not a pleasant one to hear a child's lesson in. `Pitch` does not see it, since it looks for nothing under 120 Hz and takes
    the second overtone for the pitch, so this looks lower.
    """
    # The loudness tracker refuses a sound shorter than six periods of its lowest pitch, which is 0.085 s here.
    audio = np.pad(audio, (0, max(0, int(0.1 * SAMPLE_RATE) - len(audio))))
    sound = parselmouth.Sound(audio.astype(np.float64), sampling_frequency=SAMPLE_RATE)
    pitch = sound.to_pitch(time_step=0.005, pitch_floor=60, pitch_ceiling=500)
    loudness = sound.to_intensity(minimum_pitch=75, time_step=0.005)
    moments = [(pitch.get_value_at_time(t), loudness.get_value(t)) for t in np.arange(0.01, sound.duration - 0.01, 0.005)]
    voiced = [(hz, level) for hz, level in moments if not np.isnan(hz) and not np.isnan(level)]
    if not voiced:
        return 0.0
    loudest = max(level for _, level in voiced)
    loud = [hz for hz, level in voiced if level >= loudest - within]
    return float(np.mean([hz < below for hz in loud]))


class Vowel:
    """
    Where the first two formants are, in Hz, across the vowel of a clip. The first says how open the mouth is and the second how far
    forward the tongue. They are the medians of the early, middle and late third of the voiced frames that are within 15 dB of the
    loudest, so a vowel that glides, like the one in `a` or `o`, shows where it starts and where it ends. Hiss is not voiced, so the
    `s` of `c` does not count.
    """

    def __init__(self, early: tuple[float, float], middle: tuple[float, float], late: tuple[float, float]) -> None:
        self.early, self.middle, self.late = early, middle, late

    @property
    def whole(self) -> tuple[float, float]:
        return (float(np.median([self.early[0], self.middle[0], self.late[0]])), float(np.median([self.early[1], self.middle[1], self.late[1]])))

    def describe(self) -> dict:
        return {name: [round(f1), round(f2)] for name, (f1, f2) in (("early", self.early), ("middle", self.middle), ("late", self.late))}


def vowel(audio: np.ndarray) -> Vowel | None:
    """The formants of the vowel in a clip, or None when the clip has too little voice to say."""
    sound = parselmouth.Sound(audio.astype(np.float64), sampling_frequency=SAMPLE_RATE)
    if sound.duration < 0.08:
        return None
    formants = sound.to_formant_burg(time_step=0.005, max_number_of_formants=5, maximum_formant=5500, window_length=0.03, pre_emphasis_from=50)
    pitch = sound.to_pitch(time_step=0.005, pitch_floor=100, pitch_ceiling=500)
    loudness = sound.to_intensity(minimum_pitch=100, time_step=0.005)
    times = [t for t in np.arange(0.01, sound.duration - 0.01, 0.005) if not np.isnan(pitch.get_value_at_time(t)) and not np.isnan(loudness.get_value(t))]
    if len(times) < 6:
        return None
    levels = np.array([loudness.get_value(t) for t in times])
    core = [t for t, level in zip(times, levels) if level >= levels.max() - 15]
    if len(core) < 6:
        return None
    parts = []
    for third in np.array_split(np.array(core), 3):
        first = np.nanmedian([formants.get_value_at_time(1, t) for t in third])
        second = np.nanmedian([formants.get_value_at_time(2, t) for t in third])
        if np.isnan(first) or np.isnan(second):
            return None
        parts.append((float(first), float(second)))
    return Vowel(*parts)


def mel(audio: np.ndarray, bands: int = 32) -> np.ndarray:
    """Log mel spectrum, one column per 20 ms, with each clip's own overall level taken out so only the shape is left."""
    _, _, spectrum = signal.stft(audio, SAMPLE_RATE, nperseg=int(0.032 * SAMPLE_RATE), noverlap=int(0.012 * SAMPLE_RATE))
    power = np.abs(spectrum) ** 2
    hz = np.linspace(0, SAMPLE_RATE / 2, power.shape[0])
    top = 2595 * np.log10(1 + hz[-1] / 700)
    edges = 700 * (10 ** (np.linspace(0, top, bands + 2) / 2595) - 1)
    bank = np.zeros((bands, len(hz)))
    for i in range(bands):
        lo, mid, hi = edges[i], edges[i + 1], edges[i + 2]
        bank[i] = np.clip(np.minimum((hz - lo) / (mid - lo), (hi - hz) / (hi - mid)), 0, None)
    log = np.log10(bank @ power + 1e-10)
    return (log - log.max()).T


def alike(a: np.ndarray, b: np.ndarray) -> float:
    """How different two clips of the same words are, by lining their spectra up in time. Lower is more alike."""
    x, y = mel(a), mel(b)
    cost = np.sqrt(((x[:, None, :] - y[None, :, :]) ** 2).mean(axis=2))
    n, m = cost.shape
    total = np.full((n + 1, m + 1), np.inf)
    total[0, 0] = 0.0
    for i in range(1, n + 1):
        row, above = total[i], total[i - 1]
        for j in range(1, m + 1):
            row[j] = cost[i - 1, j - 1] + min(above[j - 1], above[j], row[j - 1])
    return float(total[n, m] / (n + m))
