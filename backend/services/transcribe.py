"""
Transcription via faster-whisper (CTranslate2).

NOTE: the plan named WhisperX, which wraps faster-whisper + wav2vec2 forced
alignment. WhisperX can't install on this Python (it pins an old ctranslate2
with no wheel), so we use faster-whisper directly — it already returns
word-level timestamps, which is all the speaker-merge step needs. The wav2vec2
alignment refinement is dropped for the MVP.

The model is loaded once and cached (loading is the slow part). CPU + int8.
"""
from __future__ import annotations

import os
from typing import Optional

MODEL_SIZE = os.environ.get("MODEL_SIZE", "medium")
DEVICE = os.environ.get("DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("COMPUTE_TYPE", "int8")

# Nudge Whisper toward keeping a few fillers (it still mostly cleans them).
_FILLER_PROMPT = (
    "Umm, let me think, like, um... okay, so, uh, basically what I'm thinking is..."
)

_model = None


def ensure_loaded() -> None:
    """Load + cache the model. Safe to call repeatedly (no-op after first)."""
    global _model
    if _model is not None:
        return
    from faster_whisper import WhisperModel
    _model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)


def transcribe_words(wav_path: str) -> tuple[list[dict], str]:
    """Return (words, language). words: [{start, end, text}] at word granularity."""
    ensure_loaded()
    assert _model is not None

    segments, info = _model.transcribe(
        wav_path,
        language="en",
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
        initial_prompt=_FILLER_PROMPT,
        beam_size=5,
    )

    words: list[dict] = []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                if w.start is None or w.end is None:
                    continue
                words.append({
                    "start": float(w.start),
                    "end": float(w.end),
                    "text": w.word.strip(),
                })
        elif seg.text.strip():  # fallback if word timings are missing
            words.append({
                "start": float(seg.start), "end": float(seg.end),
                "text": seg.text.strip(),
            })

    return words, info.language
