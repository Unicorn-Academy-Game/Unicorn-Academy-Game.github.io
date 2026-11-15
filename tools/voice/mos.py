"""How natural a clip sounds, as a learned predictor of what listeners rate it, from 1 to 5 (UTMOS22 strong).

It is a proxy and not an ear: it is blind to some faults and hard on others, and it can only say that one build of the voice sounds more like
speech than another does, on the same sentences. It is used that way, to compare, and no clip is held to a number.

The predictor is a repository that imports torchaudio only to resample, and the torch the voice is made with has no torchaudio. A stand-in for
it, which resamples with scipy, lives only while the repository is imported.
"""

from __future__ import annotations

import subprocess
import sys
import types
from functools import lru_cache
from math import gcd
from pathlib import Path

import numpy as np
import torch
from scipy.signal import resample_poly

REPO = "https://github.com/tarepan/SpeechMOS"
TAG = "v1.2.0"
WEIGHTS = "https://github.com/tarepan/SpeechMOS/releases/download/v1.0.0/utmos22_strong_step7459_v1.pt"


def resample(wave: torch.Tensor, orig_freq: int, new_freq: int) -> torch.Tensor:
    """What the predictor asks torchaudio for."""
    divisor = gcd(orig_freq, new_freq)
    out = resample_poly(wave.numpy(), new_freq // divisor, orig_freq // divisor, axis=-1)
    return torch.from_numpy(np.ascontiguousarray(out)).float()


def checkout() -> Path:
    """The predictor's code at its tag, fetched into torch's cache the first time."""
    where = Path(torch.hub.get_dir()) / f"tarepan_SpeechMOS_{TAG}"
    if not where.exists():
        subprocess.run(["git", "clone", "--quiet", "--depth", "1", "--branch", TAG, REPO, str(where)], check=True)
    return where


@lru_cache(maxsize=1)
def model():
    stand_in = types.ModuleType("torchaudio")
    stand_in.functional = types.SimpleNamespace(resample=resample)
    sys.modules["torchaudio"] = stand_in
    sys.path.insert(0, str(checkout()))
    try:
        from speechmos.utmos22.strong.model import UTMOS22Strong
    finally:
        # Left in, it would make the libraries that look for torchaudio believe that it is there.
        del sys.modules["torchaudio"]
    predictor = UTMOS22Strong()
    predictor.load_state_dict(torch.hub.load_state_dict_from_url(WEIGHTS, map_location="cpu", progress=False))
    return predictor.eval()


def utmos(audio: np.ndarray, rate: int = 24000) -> float:
    """The predicted mean opinion score of mono audio, as floats from -1 to 1."""
    wave = torch.from_numpy(np.asarray(audio, dtype=np.float32))[None, :]
    with torch.inference_mode():
        return float(model()(wave, rate).item())
