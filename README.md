# SocialMirror

**AI-powered communication coach — upload a conversation, get speaker-separated transcript + objective coaching analytics.**

🌐 **Live demo:** [socialmirror-nine.vercel.app](https://socialmirror-nine.vercel.app)  
🔧 **API:** [divy401-socialmirror-backend.hf.space](https://divy401-socialmirror-backend.hf.space/health)  
📱 **iOS App:** [github.com/suthardivy183-lang/SocialMirror](https://github.com/suthardivy183-lang/SocialMirror)

---

## What it does

Upload or record a conversation (interview, group discussion, mock viva) and get:

- **Speaker-separated transcript** — who said what, with timestamps
- **Speaker timeline** — visual horizontal track showing when each person spoke
- **Coaching dashboard** per speaker:
  - Talk-time ratio & dominance
  - Filler words ("um", "uh", "like", "you know") with breakdown
  - Questions asked vs answered
  - Interruptions & backchannels
  - Rapport / conversational entrainment
  - Vocal delivery — pitch variation & energy expressiveness
  - Pause analysis (silence ratio, longest pause, average gap)
  - Radar chart across all dimensions
- **Plain-language tip** — one actionable thing to change
- **Trends over time** — track improvement across sessions

---

## Architecture

```
Browser (React/Vercel)          Python Backend (FastAPI/HF Spaces Docker)
  record / upload audio   ─────▶  POST /transcribe  →  { job_id }
  poll for progress       ◀─────  GET  /status/{id}  →  { phase, % }
  render dashboard        ◀─────  GET  /result/{id}  →  JSON
  analytics via coaching.ts        ffmpeg → faster-whisper → pyannote
                                   → librosa → merge → speaker JSON
```

**Frontend:** React 19 + TypeScript + Vite, deployed on Vercel.  
**Backend:** FastAPI + Uvicorn, Dockerized, deployed on HuggingFace Spaces (free CPU).  
**Job queue:** single `ThreadPoolExecutor` worker — one job at a time, instant `server_busy` on overlap.

---

## Current ML stack (v1 — CPU)

| Component | Model | Notes |
|-----------|-------|-------|
| Transcription | `faster-whisper` `small` (CTranslate2 int8) | Word-level timestamps, VAD filter |
| Diarization | `pyannote/speaker-diarization-community-1` | Neural VAD → ECAPA embeddings → clustering |
| Acoustic features | `librosa` pyin + RMS | Per-speaker pitch & energy |
| Audio normalisation | `ffmpeg` | Mono 16 kHz WAV before any ML |

Processing: ~70–90 s for a 30 s clip on free HF CPU. Max clip: 3 min / 50 MB.

---

## Upcoming: GPU upgrade (NVIDIA Lab — 2× RTX 6000 Ada, 48 GB each)

This is the next major accuracy jump. With dedicated GPU access:

### Model upgrades

| Component | CPU (current) | GPU (upcoming) |
|-----------|--------------|----------------|
| Transcription | `whisper-small` | **`whisper-large-v3`** or `large-v3-turbo` |
| Word alignment | Built-in timestamps | **WhisperX + wav2vec2** forced alignment (sub-100ms precision) |
| Filler detection | Prompt-biased | **CrisperWhisper** — trained for verbatim "um/uh" |
| Diarization | `pyannote-community-1` | **`pyannote/speaker-diarization-3.1`** (state-of-the-art, much lower DER) |
| Concurrent jobs | 1 | **2** (one GPU each) |
| Processing speed | ~90 s / 30 s clip | **~5–10 s / 30 s clip** |

### What this fixes

- **Similar-voice merging** — `pyannote-3.1` handles similar-sounding speakers far better than the community model.
- **Filler word accuracy** — CrisperWhisper was trained on verbatim speech; fillers appear in transcript instead of being silently cleaned.
- **Word boundary precision** — wav2vec2 forced alignment gives accurate word-to-speaker assignment at turn boundaries.
- **Accented / technical speech** — `large-v3` is significantly more accurate on Indian accents and domain vocabulary.
- **Latency** — 10× faster; opens the path to near-real-time processing.

### What stays the same

- The `coaching.ts` analytics pipeline (frontend) — all metrics, radar, tip generation, session storage.
- The job-based API contract — only env vars change (`DEVICE=cuda`, `MODEL_SIZE=large-v3`, etc.).
- The Vercel frontend — no changes needed.

---

## Roadmap

| Phase | Feature |
|-------|---------|
| **GPU v2** | `whisper-large-v3` + `pyannote-3.1` + WhisperX alignment + CrisperWhisper |
| **Indian languages** | Hindi, Gujarati, Tamil via `whisper-large-v3` multilingual mode |
| **Real-time streaming** | WebSocket stream → live per-speaker dashboard while recording |
| **On-device privacy mode** | WebGPU Whisper in-browser — audio never leaves the device |
| **Cross-session speaker identity** | Recognise the same speaker across sessions |
| **Coaching curriculum** | Structured improvement plans based on trend data |
| **Mobile app** | React Native wrapper around the same backend |

---

## Run locally

### Frontend
```bash
git clone https://github.com/suthardivy183-lang/SocialMirror-web.git
cd SocialMirror-web
npm install
cp .env.example .env.local   # set VITE_API_URL
npm run dev                  # http://localhost:5174
```

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # set HF_TOKEN, MODEL_SIZE, DEVICE
uvicorn main:app --reload --port 8000
```

**Backend env vars:**
| Variable | Default | Notes |
|----------|---------|-------|
| `HF_TOKEN` | — | Required — pyannote model access |
| `MODEL_SIZE` | `medium` | `small` / `medium` / `large-v3` |
| `DEVICE` | `cpu` | `cpu` or `cuda` |
| `COMPUTE_TYPE` | `int8` | `int8` (CPU) / `float16` (GPU) |
| `MAX_DURATION_SECONDS` | `180` | Clip limit |
| `MAX_FILE_SIZE_MB` | `50` | Upload limit |
| `MOCK_PIPELINE` | `0` | Set `1` to skip ML models (fast testing) |

For the Docker path see [`backend/README.md`](backend/README.md).

---

## Tests

```bash
npm run test          # 29 unit tests (coaching analytics + diarization + colors)
npm run typecheck     # tsc -b
```

---

## Stack

**Frontend:** React 19, TypeScript, Vite, Vitest  
**Backend:** Python 3.11, FastAPI, faster-whisper, pyannote.audio, librosa, soundfile, ffmpeg  
**Infra:** Vercel (frontend) · HuggingFace Spaces Docker (backend) · GitHub

---

## License

MIT — see [LICENSE](LICENSE).

Built by **Divy Suthar** · Parul University
