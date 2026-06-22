"""
Merge WhisperX words with pyannote speaker turns into a labelled transcript.

Ported from the desktop sidecar's diarize.py:
  - assign each word to the speaker whose turns overlap it most
  - group consecutive same-speaker words into lines
  - renumber speakers 1,2,3… by first appearance
  - build a timeline

`confidence` is a *heuristic*, not model certainty: it's how cleanly a line's
words sit inside one speaker's turns (overlap fraction) — low when words straddle
a speaker boundary, high when they're squarely inside one turn.
"""
from __future__ import annotations

from typing import Optional


def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def _assign_tokens_by_turns(tokens: list[dict], turns: list[tuple]) -> list[tuple]:
    """For each token pick the speaker with the most overlap. Returns
    [(speaker_label | None, confidence)] parallel to tokens."""
    out: list[tuple[Optional[str], float]] = []
    for tok in tokens:
        dur = max(1e-3, tok["end"] - tok["start"])
        by_speaker: dict[str, float] = {}
        for (ts, te, spk) in turns:
            ov = _overlap(tok["start"], tok["end"], ts, te)
            if ov > 0:
                by_speaker[spk] = by_speaker.get(spk, 0.0) + ov
        if by_speaker:
            spk = max(by_speaker, key=by_speaker.get)
            conf = min(1.0, by_speaker[spk] / dur)
        else:
            spk, conf = None, 0.0
        out.append((spk, conf))
    return out


def _group_into_lines(tokens: list[dict], speakers: list, confidences: list) -> list[dict]:
    """Merge consecutive same-speaker word tokens into transcript lines."""
    lines: list[dict] = []
    cur: Optional[dict] = None
    for tok, spk, conf in zip(tokens, speakers, confidences):
        if spk is None:
            spk = cur["speaker"] if cur else 0  # carry previous speaker
        if cur is None or spk != cur["speaker"]:
            if cur:
                lines.append(cur)
            cur = {"speaker": spk, "start": tok["start"], "end": tok["end"],
                   "_text": [tok["text"]], "_confs": [conf]}
        else:
            cur["end"] = tok["end"]
            cur["_text"].append(tok["text"])
            cur["_confs"].append(conf)
    if cur:
        lines.append(cur)

    out = []
    for ln in lines:
        text = " ".join(t for t in ln["_text"] if t).strip()
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


def _relabel_by_first_appearance(lines: list[dict]) -> tuple[list[dict], int]:
    mapping: dict = {}
    nxt = 1
    for ln in lines:
        raw = ln["speaker"]
        if raw not in mapping:
            mapping[raw] = nxt
            nxt += 1
        ln["speaker"] = mapping[raw]
    return lines, (nxt - 1)


def merge(words: list[dict], turns: list[tuple]) -> tuple[list[dict], list[dict], int, dict]:
    """words: [{start,end,text}] (WhisperX). turns: [(start,end,raw_label)] (pyannote).
    Returns (lines, timeline, speaker_count, relabel_map)."""
    tokens = [w for w in words if w.get("text") and w.get("start") is not None
              and w.get("end") is not None]
    if not tokens:
        return [], [], 0, {}

    if turns:
        assigned = _assign_tokens_by_turns(tokens, turns)
        speakers = [a[0] for a in assigned]
        confidences = [a[1] for a in assigned]
    else:  # no diarization — everyone is one speaker
        speakers = [0] * len(tokens)
        confidences = [0.0] * len(tokens)

    lines = _group_into_lines(tokens, speakers, confidences)
    lines, speaker_count = _relabel_by_first_appearance(lines)
    timeline = [{"speaker": ln["speaker"], "start": ln["start"], "end": ln["end"]}
                for ln in lines]
    return lines, timeline, max(speaker_count, 1), {}
