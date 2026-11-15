"""Kokoro, the model that speaks: phonemes in, audio and the time each phoneme starts out.

Everything that makes a clip is decided here and pinned: the weights by revision, the voice by name, and the noise by seed.
The same inputs on the same machine give the same samples.
"""

from __future__ import annotations

import os
import warnings
from dataclasses import dataclass

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
import torch  # noqa: E402
from huggingface_hub import snapshot_download  # noqa: E402

REPO = "hexgrad/Kokoro-82M"
REVISION = "f3ff3571791e39611d31c381e3a41a3af07b4987"
VOICE = "af_heart"
SAMPLE_RATE = 24000
# One step of the model's timing is 600 samples, which is 25 ms at 24 kHz.
FRAME_SECONDS = 600 / SAMPLE_RATE


@dataclass(frozen=True)
class Spoken:
    audio: np.ndarray
    # Frames each token lasts, with the start and end markers of the model at both ends.
    frames: list[int]

    def starts(self) -> list[tuple[float, float]]:
        """Where each phoneme begins and ends in the audio, in seconds, in the order they were given."""
        # The model puts a few frames of lead-in on the start marker, and they belong to no phoneme.
        at = max(0, self.frames[0] - 3) * FRAME_SECONDS
        spans = []
        for frames in self.frames[1:-1]:
            spans.append((at, at + frames * FRAME_SECONDS))
            at += frames * FRAME_SECONDS
        return spans


class Kokoro:
    """The speaker. Turning words into phonemes is cheap and always there. The model itself loads when it is first asked to speak."""

    def __init__(self) -> None:
        from kokoro import KPipeline

        self.pipeline = KPipeline(lang_code="a", repo_id=REPO, model=False)
        self._model = None
        self._styles = None

    def _load(self) -> None:
        if self._model is not None:
            return
        from kokoro import KModel

        root = snapshot_download(REPO, revision=REVISION, allow_patterns=["config.json", "kokoro-v1_0.pth", f"voices/{VOICE}.pt"])
        self._model = KModel(repo_id=REPO, config=f"{root}/config.json", model=f"{root}/kokoro-v1_0.pth").eval()
        # One row of style per length of phonemes, and the model was trained to be given the row for the length it speaks.
        self._styles = torch.load(f"{root}/voices/{VOICE}.pt", weights_only=True)

    def room(self) -> int:
        """How many phonemes the model takes in one breath."""
        self._load()
        return self._model.context_length - 2

    def phonemes(self, text: str) -> str:
        """The phonemes the model is given for some words, in its own alphabet."""
        phonemes, _ = self.pipeline.g2p(text)
        return phonemes

    def say(self, phonemes: str, speed: float, seed: int, style: int = 0) -> Spoken:
        """Speaks the phonemes. `style` moves along the rows of style next to the one for this length, which changes tempo and tone a little."""
        self._load()
        model, styles = self._model, self._styles
        unknown = sorted({ch for ch in phonemes if ch not in model.vocab})
        if unknown:
            raise ValueError(f"the model has no phoneme for {unknown} in {phonemes!r}")
        if len(phonemes) + 2 > model.context_length:
            raise ValueError(f"{phonemes!r} is too long for the model")
        row = min(max(len(phonemes) - 1 + style, 0), len(styles) - 1)
        torch.manual_seed(seed)
        out = model(phonemes, styles[row], speed, return_output=True)
        return Spoken(audio=out.audio.numpy().astype(np.float32), frames=[int(f) for f in out.pred_dur.tolist()])
