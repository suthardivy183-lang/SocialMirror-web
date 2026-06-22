"""
Upload validation + normalization.

Every upload is checked (type, size, duration) and converted to **mono 16 kHz
WAV** with ffmpeg before any ML runs — Whisper and pyannote both expect 16 kHz
mono, and normalizing up front means the rest of the pipeline never worries
about codecs or sample rates.
"""
from __future__ import annotations

import json
import os
import subprocess
from typing import Optional

from .jobs import PipelineError

ALLOWED_EXTS = {".wav", ".mp3", ".m4a", ".webm", ".mp4", ".ogg", ".aac", ".flac"}

MAX_FILE_SIZE_MB = int(os.environ.get("MAX_FILE_SIZE_MB", "50"))
MAX_DURATION_SECONDS = int(os.environ.get("MAX_DURATION_SECONDS", "180"))


def validate_extension(filename: str) -> None:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTS:
        raise PipelineError(
            "unsupported_type",
            f"Unsupported file type '{ext or '?'}'. Allowed: wav, mp3, m4a, webm, mp4.",
        )


def validate_size(size_bytes: int) -> None:
    if size_bytes > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise PipelineError(
            "file_too_large",
            f"File is too large ({size_bytes / 1e6:.1f} MB). Max {MAX_FILE_SIZE_MB} MB.",
        )


def probe_duration(path: str) -> float:
    """Return audio duration in seconds via ffprobe (0.0 if unknown)."""
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "json", path,
            ],
            capture_output=True, text=True, check=True,
        )
        return float(json.loads(out.stdout)["format"]["duration"])
    except Exception:
        return 0.0


def validate_duration(path: str) -> float:
    dur = probe_duration(path)
    if dur > MAX_DURATION_SECONDS:
        raise PipelineError(
            "file_too_long",
            f"Audio is {dur:.0f}s. Max {MAX_DURATION_SECONDS}s for this demo — "
            f"try a 30–90s clip.",
        )
    return dur


def to_mono_16k_wav(src_path: str, dst_path: str) -> str:
    """Convert any input to mono 16 kHz PCM WAV. Raises on ffmpeg failure."""
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", src_path, "-ac", "1", "-ar", "16000", dst_path],
            capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError as e:
        raise PipelineError(
            "decode_failed",
            f"Could not decode the audio file. ffmpeg: {e.stderr[-300:] if e.stderr else e}",
        )
    return dst_path
