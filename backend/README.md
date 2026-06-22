---
title: SocialMirror Backend
emoji: 🎙️
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# SocialMirror backend (FastAPI)

Audio in → speaker-labelled transcript + per-speaker acoustics out. Heavy ML runs
here so the browser just uploads and renders.

## Pipeline

```
upload -> ffmpeg (mono 16k WAV) -> faster-whisper (medium, int8)  -> words
                                 -> pyannote community-1            -> speaker turns
                                 -> merge (words -> speakers)       -> lines + timeline + confidence
                                 -> librosa                         -> per-speaker pitch/energy
```

> The plan named **WhisperX**; it can't install on recent Python (pins an old
> ctranslate2 with no wheel), so we use its transcription core **faster-whisper**
> directly. Word timestamps come from faster-whisper; the wav2vec2 alignment
> refinement is skipped for the MVP.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Instant liveness (never loads models). |
| POST | `/transcribe` | multipart `file` (+ optional `num_speakers`) → `{ job_id, status }`. |
| GET | `/status/{job_id}` | `{ status, progress, message }`. |
| GET | `/result/{job_id}` | Final JSON when `done`. |
| POST | `/transcribe-sync` | Blocking; local curl testing only. |

One job at a time (`ThreadPoolExecutor(max_workers=1)`); a second concurrent
request gets `429 server_busy`. Limits: ≤180s, ≤50MB, wav/mp3/m4a/webm/mp4.

## Result JSON

```json
{
  "language": "en", "model": "medium", "diarizer": "pyannote-community-1", "speaker_count": 2,
  "transcript": [ { "speaker": 1, "start": 0.0, "end": 4.2, "text": "Hello everyone", "confidence": 0.84 } ],
  "speakers":   [ { "id": 1, "avg_pitch": 142, "pitch_variance": 28, "avg_energy_db": -22, "energy_variance": 5.1 } ],
  "timeline":   [ { "speaker": 1, "start": 0.0, "end": 4.2 } ]
}
```

`confidence` is a heuristic (word-overlap fraction with the assigned speaker turn),
not model certainty.

## Run locally (Mac M2)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # optional
pip install -r requirements.txt
cp .env.example .env        # then put your HF_TOKEN in .env
uvicorn main:app --reload --port 8000
```

Quick test:
```bash
curl localhost:8000/health
curl -F file=@sample.mp3 -F num_speakers=2 localhost:8000/transcribe-sync
```

## pyannote token (required for speaker detection)

1. Accept the license on https://huggingface.co/pyannote/speaker-diarization-community-1
2. Create a token: https://huggingface.co/settings/tokens
3. Put it in `.env` as `HF_TOKEN=hf_...` (or set it as a Space secret).

## Docker (local + HuggingFace Spaces)

```bash
docker build -t socialmirror-backend .
docker run -p 8000:7860 -e HF_TOKEN=hf_xxx socialmirror-backend
```

On **HuggingFace Spaces**: create a Space (SDK = Docker), push this folder, add
`HF_TOKEN` as a secret. Spaces serves on port 7860 (already the default).

## Expose the M2 backend to a deployed frontend (free)

```bash
cloudflared tunnel --url http://localhost:8000   # or: ngrok http 8000
```
Set the printed URL as `VITE_API_URL` in the frontend.
