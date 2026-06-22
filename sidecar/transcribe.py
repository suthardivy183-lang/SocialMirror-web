#!/usr/bin/env python3
"""
SocialMirror transcription sidecar.
Usage: python3 transcribe.py <audio_path> [num_speakers]
Outputs JSON to stdout.

Models (in preference order):
  1. CrisperWhisper (verbatim, captures um/uh/ahh) — downloaded on first run
  2. large-v3 + filler prompt (fallback)
"""
import sys
import os
import json

MODEL_CACHE = os.path.expanduser("~/.cache/socialmirror")
CRISPER_PATH = os.path.join(MODEL_CACHE, "crisperwhisper-ct2")
FILLER_PROMPT = (
    "Umm, let me think like, um... Okay, here's what I'm, uh, thinking. "
    "So basically, ahh, what we need to do is, like, uh..."
)

def _run(model, audio_path: str, use_prompt: bool):
    """Transcribe with a loaded model. Returns (segments, language).
    Each segment carries word-level timestamps so diarization can split a
    segment when speakers switch mid-sentence."""
    kwargs = dict(
        language="en",
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
    )
    if use_prompt:
        kwargs["initial_prompt"] = FILLER_PROMPT

    raw_segments, info = model.transcribe(audio_path, **kwargs)
    segments = []
    for seg in raw_segments:
        words = [
            {"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word}
            for w in (seg.words or [])
        ]
        segments.append({
            "text": seg.text.strip(),
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "words": words,
        })
    return segments, info.language


def _load_fallback():
    """medium.en — reliable, captures some fillers via the prompt."""
    from faster_whisper import WhisperModel
    return WhisperModel("medium.en", device="cpu", compute_type="int8")


def _emit(segments, lang, model_name, audio_path, num_speakers):
    """Diarize, then print the merged transcript + speaker structure as JSON."""
    from diarize import diarize as run_diarize
    diar = run_diarize(audio_path, segments, num_speakers)
    print(json.dumps({
        "segments": segments,          # raw transcript segments (back-compat)
        "lines": diar["lines"],        # speaker-labelled transcript lines
        "timeline": diar["timeline"],  # [{speaker,start,end}] for the visualization
        "speaker_count": diar["speaker_count"],
        "diarizer": diar["diarizer"],  # "pyannote" | "ecapa" | "single"
        "language": lang,
        "model": model_name,
        "error": None,
    }))


def transcribe(audio_path: str, num_speakers: int = 0):
    # 1. Try CrisperWhisper (verbatim fillers) if it's cached.
    if os.path.exists(CRISPER_PATH):
        try:
            from faster_whisper import WhisperModel
            model = WhisperModel(CRISPER_PATH, device="cpu", compute_type="int8")
            segments, lang = _run(model, audio_path, use_prompt=False)
            _emit(segments, lang, "crisperwhisper", audio_path, num_speakers)
            return
        except Exception as e:
            # CrisperWhisper failed — fall through to the reliable model below.
            sys.stderr.write(f"CrisperWhisper failed, falling back: {e}\n")

    # 2. Reliable fallback: medium.en + filler-biasing prompt.
    try:
        model = _load_fallback()
        segments, lang = _run(model, audio_path, use_prompt=True)
        _emit(segments, lang, "medium.en", audio_path, num_speakers)
    except Exception as e:
        print(json.dumps({"error": str(e), "segments": [], "lines": []}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcribe.py <audio_path> [num_speakers]", "segments": []}))
        sys.exit(1)

    audio_path = sys.argv[1]
    num_speakers = int(sys.argv[2]) if len(sys.argv) > 2 else 0

    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"File not found: {audio_path}", "segments": []}))
        sys.exit(1)

    transcribe(audio_path, num_speakers)
