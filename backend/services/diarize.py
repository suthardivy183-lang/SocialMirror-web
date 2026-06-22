"""
Speaker diarization via pyannote.audio (speaker-diarization-community-1).

Returns speaker *turns* [(start, end, raw_label)] — "this voice spoke from t1 to
t2". merge.py then assigns each transcribed word to a turn.

The pipeline is loaded once and cached. CPU only. Requires HF_TOKEN with the
community-1 license accepted.
"""
from __future__ import annotations

import os
from typing import Optional

from .jobs import PipelineError

MODEL_ID = "pyannote/speaker-diarization-community-1"

_pipeline = None
_load_error: Optional[str] = None


def _load():
    global _pipeline, _load_error
    if _pipeline is not None or _load_error is not None:
        return
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if not token:
        _load_error = "missing_token"
        raise PipelineError(
            "missing_token",
            "HF_TOKEN is not set. Diarization needs a HuggingFace token with the "
            "pyannote/speaker-diarization-community-1 license accepted.",
        )
    try:
        from pyannote.audio import Pipeline
        import torch
        pipe = Pipeline.from_pretrained(MODEL_ID, token=token)
        if pipe is None:
            raise RuntimeError("pipeline is None — license likely not accepted")
        pipe.to(torch.device("cpu"))
        _pipeline = pipe
    except PipelineError:
        raise
    except Exception as e:
        _load_error = "diarizer_unavailable"
        raise PipelineError(
            "diarizer_unavailable",
            f"Could not load pyannote ({MODEL_ID}). Accept the model license on "
            f"HuggingFace and check HF_TOKEN. Detail: {e}",
        )


def diarize_turns(wav_path: str, num_speakers: Optional[int]) -> list[tuple]:
    """Return [(start, end, raw_label)] sorted by start. Raises PipelineError on
    setup problems (missing token / license)."""
    _load()
    assert _pipeline is not None

    kwargs = {}
    if num_speakers and num_speakers > 0:
        kwargs["num_speakers"] = num_speakers

    output = _pipeline(wav_path, **kwargs)

    # community-1 exposes exclusive (non-overlapping) diarization which is the
    # cleanest source for word→speaker reconciliation; fall back if absent.
    annotation = getattr(output, "exclusive_speaker_diarization", None) or output

    turns: list[tuple] = []
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        turns.append((float(turn.start), float(turn.end), str(speaker)))
    turns.sort(key=lambda t: t[0])
    return turns
