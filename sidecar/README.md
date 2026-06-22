# SocialMirror sidecar (desktop transcription + diarization)

The desktop app (Tauri) shells out to these Python scripts for on-device speech
processing. Nothing is uploaded — audio stays on the machine.

## Pipeline

`transcribe.py <audio> [num_speakers]` →

1. **Transcribe** with faster-whisper (CrisperWhisper if installed, else
   `medium.en` + a filler-biasing prompt). Produces word-level timestamps.
2. **Diarize** with `diarize.py` (pyannote if `HF_TOKEN` is set, else ECAPA
   clustering). Produces speaker turns.
3. **Merge** — assign each word to a speaker by overlap, group consecutive
   same-speaker words into lines, renumber speakers by first appearance.

Output JSON:

```json
{
  "model": "crisperwhisper | medium.en",
  "language": "en",
  "diarizer": "pyannote | ecapa | single",
  "speaker_count": 2,
  "segments": [ { "start", "end", "text", "words":[...] } ],
  "lines":    [ { "speaker": 1, "start", "end", "text", "confidence": 0.79 } ],
  "timeline": [ { "speaker": 1, "start", "end" } ]
}
```

`num_speakers` = 0 means auto-detect; a positive number forces that many.

## Diarization engines

| Engine | Quality | Setup |
|--------|---------|-------|
| **pyannote** | Best — trained neural VAD + segmentation + clustering. Robust auto speaker count, handles short interjections. | Needs a free HF token + accepting two model licences. Run `python3 sidecar/setup_pyannote.py`. |
| **ECAPA** (fallback) | Good when speakers have substantial, balanced talk time. Auto-count is approximate; **set the speaker count for best results**. No token, runs offline once the model is cached. | Automatic — used whenever pyannote isn't available. |

### Enable pyannote (recommended)

```bash
# 1. Accept conditions (click "Agree") on both pages:
#    https://huggingface.co/pyannote/speaker-diarization-3.1
#    https://huggingface.co/pyannote/segmentation-3.0
# 2. Create a read token: https://huggingface.co/settings/tokens
export HF_TOKEN=hf_xxx
python3 sidecar/setup_pyannote.py     # verifies access
```

### Verbatim fillers (optional)

```bash
python3 sidecar/setup_models.py        # downloads + converts CrisperWhisper
```

## Dependencies

```bash
pip3 install faster-whisper pyannote.audio speechbrain
```
