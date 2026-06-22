"""
Orchestrates one transcription job: WhisperX -> pyannote -> librosa -> merge.

Set MOCK_PIPELINE=1 to return canned output without loading any models — used to
test the job/polling flow and the frontend wiring quickly.
"""
from __future__ import annotations

import os
import time
from typing import Callable, Optional

ProgressCb = Callable[[float, str], None]

MODEL_SIZE = os.environ.get("MODEL_SIZE", "medium")


def run_mock(wav_path: str, num_speakers: Optional[int], duration: float,
             progress: ProgressCb) -> dict:
    """Canned two-speaker result for flow testing (no models)."""
    for frac, msg in [
        (0.15, "loading models"), (0.4, "transcribing"),
        (0.7, "diarizing"), (0.9, "analyzing acoustics"),
    ]:
        progress(frac, msg)
        time.sleep(0.4)
    return {
        "language": "en",
        "model": MODEL_SIZE,
        "diarizer": "mock",
        "speaker_count": 2,
        "transcript": [
            {"speaker": 1, "start": 0.0, "end": 3.1, "text": "Hello everyone, thanks for joining.", "confidence": 0.86},
            {"speaker": 2, "start": 3.4, "end": 5.0, "text": "Happy to be here.", "confidence": 0.82},
            {"speaker": 1, "start": 5.2, "end": 7.6, "text": "Let's get started then.", "confidence": 0.88},
        ],
        "speakers": [
            {"id": 1, "avg_pitch": 138, "pitch_variance": 26, "avg_energy_db": -21, "energy_variance": 4.8},
            {"id": 2, "avg_pitch": 192, "pitch_variance": 31, "avg_energy_db": -24, "energy_variance": 6.2},
        ],
        "timeline": [
            {"speaker": 1, "start": 0.0, "end": 3.1},
            {"speaker": 2, "start": 3.4, "end": 5.0},
            {"speaker": 1, "start": 5.2, "end": 7.6},
        ],
    }


def run_pipeline(wav_path: str, num_speakers: Optional[int], duration: float,
                 progress: ProgressCb) -> dict:
    """Real pipeline. Imports are lazy so /health and mock mode never pull in torch."""
    if os.environ.get("MOCK_PIPELINE") == "1":
        return run_mock(wav_path, num_speakers, duration, progress)

    from . import transcribe as tx
    from . import diarize as dz
    from . import acoustics as ac
    from . import merge as mg

    progress(0.1, "loading models")
    tx.ensure_loaded()

    progress(0.35, "transcribing")
    words, language = tx.transcribe_words(wav_path)

    progress(0.6, "diarizing")
    turns = dz.diarize_turns(wav_path, num_speakers)

    progress(0.8, "analyzing acoustics")
    lines, timeline, speaker_count, relabel = mg.merge(words, turns)
    speakers = ac.per_speaker_features(wav_path, lines)

    progress(0.97, "finishing")
    return {
        "language": language,
        "model": MODEL_SIZE,
        "diarizer": "pyannote-community-1" if turns else "single",
        "speaker_count": speaker_count,
        "transcript": lines,
        "speakers": speakers,
        "timeline": timeline,
    }
