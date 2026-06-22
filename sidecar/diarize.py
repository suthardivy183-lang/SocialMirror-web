#!/usr/bin/env python3
"""
Speaker diarization for SocialMirror.

Two engines, tried in order:
  1. pyannote.audio  — state-of-the-art, auto speaker count. Needs HF_TOKEN and
     accepted conditions for `pyannote/speaker-diarization-3.1`.
  2. ECAPA + clustering — speechbrain x-vectors + agglomerative cosine
     clustering. No token, works offline once the model is cached. This is the
     automatic fallback so diarization works even without pyannote access.

Public API:
    diarize(audio_path, segments, num_speakers=0) -> dict
      segments: [{ "start": float, "end": float, "text": str,
                   "words"?: [{ "start": float, "end": float, "word": str }] }]
      returns:  {
        "lines":   [{ "speaker": int, "start": float, "end": float,
                      "text": str, "confidence": float }],
        "timeline":[{ "speaker": int, "start": float, "end": float }],
        "speaker_count": int,
        "diarizer": "pyannote" | "ecapa" | "single",
      }

Speakers are renumbered by first appearance, so labels are 1, 2, 3… in the order
they first speak.
"""
import os
import sys
import json
import math

SAMPLE_RATE = 16000

# A voice fingerprint is unreliable from a tiny snippet and slow from a huge one.
MIN_EMBED_S = 0.9
MAX_EMBED_S = 8.0

# Cosine-distance link below which two segments are treated as the same speaker
# (ECAPA auto mode). Lower = splits speakers more eagerly.
ECAPA_DISTANCE_THRESHOLD = 0.55


# ── pyannote engine ───────────────────────────────────────────────────────────

def _pyannote_turns(audio_path, num_speakers):
    """Return [(start, end, raw_label, conf)] or None if pyannote is unavailable.
    pyannote doesn't expose a per-turn confidence, so we use 1.0 and let the
    token-overlap fraction carry the per-line confidence."""
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if not token:
        return None
    try:
        from pyannote.audio import Pipeline
        import torch
    except Exception:
        return None

    try:
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1", use_auth_token=token
        )
        if pipeline is None:
            return None
        # CPU is the safe default; MPS has occasional op-coverage gaps.
        pipeline.to(torch.device("cpu"))

        kwargs = {}
        if num_speakers and num_speakers > 0:
            kwargs["num_speakers"] = num_speakers
        diarization = pipeline(audio_path, **kwargs)

        turns = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            turns.append((float(turn.start), float(turn.end), str(speaker), 1.0))
        turns.sort(key=lambda t: t[0])
        return turns or None
    except Exception as e:
        sys.stderr.write(f"pyannote failed, falling back to ECAPA: {e}\n")
        return None


def _overlap(a_start, a_end, b_start, b_end):
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def _assign_tokens_by_turns(tokens, turns):
    """For each token (word or segment) pick the speaker whose turns overlap it
    most. Per-token confidence = (overlapped fraction of the token) × (the
    winning turn's own confidence)."""
    out = []
    for tok in tokens:
        dur = max(1e-3, tok["end"] - tok["start"])
        by_speaker = {}
        conf_of = {}
        for (ts, te, spk, tconf) in turns:
            ov = _overlap(tok["start"], tok["end"], ts, te)
            if ov > 0:
                by_speaker[spk] = by_speaker.get(spk, 0.0) + ov
                conf_of[spk] = max(conf_of.get(spk, 0.0), tconf)
        if by_speaker:
            spk = max(by_speaker, key=by_speaker.get)
            frac = min(1.0, by_speaker[spk] / dur)
            conf = round(frac * conf_of.get(spk, 1.0), 3)
        else:
            spk, conf = None, 0.0
        out.append((spk, conf))
    return out


# ── ECAPA engine ──────────────────────────────────────────────────────────────

_ecapa_model = None


def _load_ecapa():
    global _ecapa_model
    if _ecapa_model is not None:
        return _ecapa_model
    from speechbrain.inference.speaker import EncoderClassifier
    savedir = os.path.expanduser("~/.cache/socialmirror/ecapa")
    _ecapa_model = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        savedir=savedir,
        run_opts={"device": "cpu"},
    )
    return _ecapa_model


def _segment_window(samples, start_s, end_s):
    """Clamp a segment's audio to a stable [MIN, MAX]-second window."""
    n = len(samples)
    s = max(0, int(start_s * SAMPLE_RATE))
    e = min(n, int(math.ceil(end_s * SAMPLE_RATE)))
    if e <= s:
        e = min(n, s + int(MIN_EMBED_S * SAMPLE_RATE))
    dur = (e - s) / SAMPLE_RATE
    if dur < MIN_EMBED_S:  # extend short segments symmetrically
        pad = int(((MIN_EMBED_S - dur) * SAMPLE_RATE) / 2)
        s = max(0, s - pad)
        e = min(n, e + pad)
    if (e - s) / SAMPLE_RATE > MAX_EMBED_S:  # cap long ones to the middle
        mid = (s + e) // 2
        half = int(MAX_EMBED_S * SAMPLE_RATE / 2)
        s, e = max(0, mid - half), min(n, mid + half)
    return samples[s:e]


# Window primarily at natural pauses: speakers usually take the floor across a
# silence, so a gap is the most reliable switch cue. Cap long monologues so a
# single speaker still yields several (stable) same-voice windows to cluster.
WINDOW_GAP_S = 0.4    # a silence longer than this starts a new window
WINDOW_MAX_S = 8.0    # also break a window once it gets this long
WINDOW_MIN_KEEP_S = 0.4  # ignore windows shorter than this (too little voice)


def _build_windows(segments):
    """Slice the timeline into utterance-sized windows for embedding. Uses word
    timestamps when present (so diarization is independent of Whisper's segment
    count); otherwise falls back to the segments themselves.

    ECAPA needs ~2–3 s of voice for a stable fingerprint, so we keep windows
    pause-delimited and reasonably long rather than chopping every ~1.5 s, which
    over-splits a single speaker into many noisy clusters."""
    words = []
    for seg in segments:
        for w in (seg.get("words") or []):
            if w.get("start") is not None and w.get("end") is not None:
                words.append(w)
    if not words:
        return [(s["start"], s["end"]) for s in segments]

    windows = []
    cur_s = words[0]["start"]
    cur_e = words[0]["end"]
    for w in words[1:]:
        gap = w["start"] - cur_e
        if gap > WINDOW_GAP_S or (cur_e - cur_s) >= WINDOW_MAX_S:
            windows.append((cur_s, cur_e))
            cur_s, cur_e = w["start"], w["end"]
        else:
            cur_e = w["end"]
    windows.append((cur_s, cur_e))

    # Drop windows with too little voice to fingerprint reliably.
    kept = [(s, e) for (s, e) in windows if (e - s) >= WINDOW_MIN_KEEP_S]
    return _merge_short_windows(kept or windows)


# A window shorter than this gives a noisy ECAPA embedding; merge it into a
# neighbour — but only across a small gap (a hesitation pause within one
# speaker's turn), never across a big gap (a likely speaker change).
WINDOW_MIN_S = 2.0
MERGE_MAX_GAP_S = 0.5


def _merge_short_windows(windows):
    """Grow sub-2s windows by merging them with an adjacent window when the gap
    between them is small, so each embedding has enough voice to be stable."""
    if len(windows) <= 1:
        return windows
    merged = [windows[0]]
    for (s, e) in windows[1:]:
        ps, pe = merged[-1]
        prev_short = (pe - ps) < WINDOW_MIN_S
        cur_short = (e - s) < WINDOW_MIN_S
        small_gap = (s - pe) < MERGE_MAX_GAP_S
        if small_gap and (prev_short or cur_short):
            merged[-1] = (ps, e)  # absorb into the previous window
        else:
            merged.append((s, e))
    return merged


def _ecapa_turns(audio_path, segments, num_speakers):
    """Diarize by embedding short word-windows with ECAPA and clustering them.
    Returns [(start, end, label, confidence)] turns, or None on failure."""
    try:
        import numpy as np
        import torch
        from faster_whisper.audio import decode_audio

        samples = decode_audio(audio_path, sampling_rate=SAMPLE_RATE)
        samples = np.asarray(samples, dtype=np.float32)

        windows = _build_windows(segments)
        if len(windows) < 2:
            return None  # nothing to separate

        model = _load_ecapa()
        embeddings = []
        for (s, e) in windows:
            win = _segment_window(samples, s, e)
            if len(win) < int(0.2 * SAMPLE_RATE):
                win = np.zeros(int(MIN_EMBED_S * SAMPLE_RATE), dtype=np.float32)
            wav = torch.tensor(win, dtype=torch.float32).unsqueeze(0)
            with torch.no_grad():
                emb = model.encode_batch(wav).squeeze().cpu().numpy()
            norm = np.linalg.norm(emb) or 1.0
            embeddings.append(emb / norm)
        embeddings = np.vstack(embeddings)

        labels = _cluster(embeddings, num_speakers)
        confs = _cluster_confidence(embeddings, labels)

        # Merge consecutive same-speaker windows into turns.
        turns = []
        for (s, e), lab, conf in zip(windows, labels, confs):
            lab = int(lab)
            if turns and turns[-1][2] == lab and s - turns[-1][1] < 1.0:
                ps, pe, pl, pc, pn = turns[-1]
                turns[-1] = (ps, e, pl, pc + conf, pn + 1)
            else:
                turns.append((s, e, lab, conf, 1))
        return [(s, e, lab, round(csum / cnt, 3)) for (s, e, lab, csum, cnt) in turns]
    except Exception as e:
        sys.stderr.write(f"ECAPA diarization failed: {e}\n")
        return None


def _cluster(embeddings, num_speakers):
    """Agglomerative average-linkage cosine clustering. Auto-detects the count
    via a distance threshold when num_speakers is 0/None."""
    import numpy as np
    from sklearn.cluster import AgglomerativeClustering

    n = len(embeddings)
    if n == 1:
        return np.zeros(1, dtype=int)

    if num_speakers and num_speakers > 1:
        model = AgglomerativeClustering(
            n_clusters=min(num_speakers, n), metric="cosine", linkage="average"
        )
    elif num_speakers == 1:
        return np.zeros(n, dtype=int)
    else:
        model = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=ECAPA_DISTANCE_THRESHOLD,
            metric="cosine",
            linkage="average",
        )
    return model.fit_predict(embeddings)


def _cluster_confidence(embeddings, labels):
    """Confidence = how much closer a segment sits to its own speaker centroid
    than to the nearest other centroid (margin), mapped to 0..1."""
    import numpy as np

    uniq = sorted(set(labels))
    centroids = {}
    for c in uniq:
        members = embeddings[[i for i, l in enumerate(labels) if l == c]]
        mean = members.mean(axis=0)
        norm = np.linalg.norm(mean) or 1.0
        centroids[c] = mean / norm

    confs = []
    for i, l in enumerate(labels):
        own = float(np.dot(embeddings[i], centroids[l]))
        others = [float(np.dot(embeddings[i], centroids[c])) for c in uniq if c != l]
        best_other = max(others) if others else -1.0
        margin = (own - best_other)  # ~[-2, 2]
        confs.append(round(min(1.0, max(0.0, 0.5 + margin / 2.0)), 3))
    return confs


# ── merge / shaping ───────────────────────────────────────────────────────────

def _tokens_from_segments(segments):
    """Flatten to word tokens when word timestamps exist, else use segments.
    Word-level lets us split a segment when speakers switch mid-sentence."""
    has_words = any(seg.get("words") for seg in segments)
    if not has_words:
        return [
            {"start": s["start"], "end": s["end"], "text": s["text"]}
            for s in segments
        ], False
    tokens = []
    for seg in segments:
        words = seg.get("words") or []
        if words:
            for w in words:
                tokens.append({
                    "start": float(w["start"]), "end": float(w["end"]),
                    "text": (w.get("word") or "").strip(),
                })
        else:  # segment had no per-word timing; keep it whole
            tokens.append({"start": seg["start"], "end": seg["end"], "text": seg["text"]})
    return tokens, True


def _group_into_lines(tokens, speakers, confidences, word_level):
    """Merge consecutive same-speaker tokens into transcript lines."""
    lines = []
    cur = None
    for tok, spk, conf in zip(tokens, speakers, confidences):
        if spk is None:
            spk = cur["speaker"] if cur else 0  # carry the previous speaker
        if cur is None or spk != cur["speaker"]:
            if cur:
                lines.append(cur)
            cur = {
                "speaker": spk, "start": tok["start"], "end": tok["end"],
                "_text": [tok["text"]], "_confs": [conf],
            }
        else:
            cur["end"] = tok["end"]
            cur["_text"].append(tok["text"])
            cur["_confs"].append(conf)
    if cur:
        lines.append(cur)

    joiner = " " if word_level else " "
    out = []
    for ln in lines:
        text = joiner.join(t for t in ln["_text"] if t).strip()
        if not text:
            continue
        confs = [c for c in ln["_confs"] if c is not None]
        out.append({
            "speaker": ln["speaker"],
            "start": round(ln["start"], 3),
            "end": round(ln["end"], 3),
            "text": text,
            "confidence": round(sum(confs) / len(confs), 3) if confs else 0.0,
        })
    return out


def _relabel_by_first_appearance(lines):
    """Renumber raw labels to Speaker 1, 2, 3… in order of first appearance."""
    mapping = {}
    nxt = 1
    for ln in lines:
        raw = ln["speaker"]
        if raw not in mapping:
            mapping[raw] = nxt
            nxt += 1
        ln["speaker"] = mapping[raw]
    return lines, (nxt - 1)


# ── public entry point ────────────────────────────────────────────────────────

def diarize(audio_path, segments, num_speakers=0):
    if not segments:
        return {"lines": [], "timeline": [], "speaker_count": 0, "diarizer": "single"}

    tokens, word_level = _tokens_from_segments(segments)

    # 1. pyannote (if HF_TOKEN present and model accessible), else
    # 2. ECAPA embedding-clustering fallback. Both yield speaker *turns*.
    turns = _pyannote_turns(audio_path, num_speakers)
    diarizer = "pyannote"
    if not turns:
        turns = _ecapa_turns(audio_path, segments, num_speakers)
        diarizer = "ecapa"

    if turns:
        assigned = _assign_tokens_by_turns(tokens, turns)
        speakers = [a[0] for a in assigned]
        confidences = [a[1] for a in assigned]
    else:
        # 3. last resort — single speaker
        speakers = [0] * len(tokens)
        confidences = [0.0] * len(tokens)
        diarizer = "single"

    lines = _group_into_lines(tokens, speakers, confidences, word_level)
    lines, speaker_count = _relabel_by_first_appearance(lines)

    timeline = [
        {"speaker": ln["speaker"], "start": ln["start"], "end": ln["end"]}
        for ln in lines
    ]
    return {
        "lines": lines,
        "timeline": timeline,
        "speaker_count": max(speaker_count, 1),
        "diarizer": diarizer,
    }


if __name__ == "__main__":
    # Standalone smoke test: python3 diarize.py <audio> [num_speakers]
    # Transcribes with faster-whisper, then diarizes, then prints JSON.
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: diarize.py <audio> [num_speakers]"}))
        sys.exit(1)
    audio = sys.argv[1]
    nspk = int(sys.argv[2]) if len(sys.argv) > 2 else 0

    from faster_whisper import WhisperModel
    model = WhisperModel("medium.en", device="cpu", compute_type="int8")
    raw, info = model.transcribe(audio, language="en", word_timestamps=True,
                                 vad_filter=True)
    segs = []
    for s in raw:
        segs.append({
            "start": s.start, "end": s.end, "text": s.text.strip(),
            "words": [{"start": w.start, "end": w.end, "word": w.word}
                      for w in (s.words or [])],
        })
    result = diarize(audio, segs, nspk)
    print(json.dumps(result, indent=2))
