"""
Per-speaker acoustic features via librosa.

The frontend's vocal-delivery analytics (expressiveness, monotony, the
pitch-based confidence score) need pitch and energy per speaker. We pull each
speaker's audio (the spans they own in the transcript), then measure:

  avg_pitch       mean f0 in Hz over voiced frames
  pitch_variance  stddev of f0 (Hz)         -> pitch range / liveliness
  avg_energy_db   mean RMS loudness (dB)
  energy_variance stddev of loudness (dB)   -> dynamic vs flat delivery

These map 1:1 to SpeakerFeatures in the frontend's coaching.ts.
"""
from __future__ import annotations

import math

SR = 16000
FMIN, FMAX = 75.0, 350.0  # human speech f0 range


def _stats(values) -> tuple[float, float]:
    import numpy as np
    if len(values) == 0:
        return 0.0, 0.0
    arr = np.asarray(values, dtype=float)
    return float(arr.mean()), float(arr.std())


def per_speaker_features(wav_path: str, lines: list[dict]) -> list[dict]:
    """lines: merged transcript lines [{speaker,start,end,...}]. Returns one
    feature dict per speaker id present."""
    import numpy as np
    import librosa

    try:
        audio, _ = librosa.load(wav_path, sr=SR, mono=True)
    except Exception:
        # Acoustics are a nice-to-have; never fail the whole job over them.
        speaker_ids = sorted({ln["speaker"] for ln in lines})
        return [_defaults(sid) for sid in speaker_ids]

    # Collect each speaker's audio samples from the spans they own.
    by_speaker: dict[int, list] = {}
    for ln in lines:
        s = max(0, int(ln["start"] * SR))
        e = min(len(audio), int(ln["end"] * SR))
        if e > s:
            by_speaker.setdefault(ln["speaker"], []).append(audio[s:e])

    out = []
    for sid in sorted(by_speaker.keys()):
        seg = np.concatenate(by_speaker[sid]) if by_speaker[sid] else np.zeros(SR // 2)
        out.append(_features_for(sid, seg))
    # Speakers with no audio span still get a default row.
    for sid in sorted({ln["speaker"] for ln in lines} - set(by_speaker.keys())):
        out.append(_defaults(sid))
    return sorted(out, key=lambda d: d["id"])


def _features_for(sid: int, seg) -> dict:
    import numpy as np
    import librosa

    # Pitch (f0) via pYIN over voiced frames.
    try:
        f0, voiced, _ = librosa.pyin(seg, fmin=FMIN, fmax=FMAX, sr=SR)
        f0v = f0[~np.isnan(f0)] if f0 is not None else np.array([])
    except Exception:
        f0v = np.array([])
    avg_pitch, pitch_var = _stats(f0v)

    # Energy: RMS per frame -> dB.
    try:
        rms = librosa.feature.rms(y=seg, frame_length=1024, hop_length=512)[0]
        rms = rms[rms > 1e-6]
        db = 20.0 * np.log10(rms) if len(rms) else np.array([])
    except Exception:
        db = np.array([])
    avg_db, db_var = _stats(db)

    return {
        "id": sid,
        "avg_pitch": round(avg_pitch) if avg_pitch else 150,
        "pitch_variance": round(pitch_var),
        "avg_energy_db": round(avg_db) if avg_db else -30,
        "energy_variance": round(db_var, 1),
    }


def _defaults(sid: int) -> dict:
    return {"id": sid, "avg_pitch": 150, "pitch_variance": 0,
            "avg_energy_db": -30, "energy_variance": 0.0}
