// Real speaker diarization in the browser.
//
// For each transcript segment we extract a speaker embedding (a "voice
// fingerprint") with a WavLM x-vector model, then cluster the embeddings so
// segments spoken by the same person get the same label. Works two ways:
//   • target = N      → force exactly N speakers (use when you know the count)
//   • target = 'auto' → discover the count; a new voice becomes a new speaker
//
// The model (~96 MB quantized) downloads from HuggingFace on first use and is
// cached by the browser afterwards. Like whisper.ts, @xenova/transformers is
// imported dynamically to keep it out of the eager bundle.

import { SAMPLE_RATE } from './whisper'

const MODEL_ID = 'Xenova/wavlm-base-plus-sv'

// A voice fingerprint is unreliable from a tiny snippet, and pointlessly slow
// from a very long one — clamp each segment's audio to this window.
const MIN_EMBED_S = 0.9
const MAX_EMBED_S = 8

// Cosine similarity above which two voices are treated as the same speaker
// (only used in 'auto' mode). Tuned to lean toward merging over over-splitting.
const SAME_SPEAKER_SIM = 0.55

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _model: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _processor: any = null

export interface DiarizeProgress {
  done: number
  total: number
}

export async function loadDiarizer(onProgress?: (pct: number) => void): Promise<void> {
  if (_model && _processor) return
  const { AutoModel, AutoProcessor, env } = await import('@xenova/transformers')
  env.allowLocalModels = false
  const progress_callback = (info: { status: string; progress?: number }) => {
    if (info.status === 'downloading' && info.progress != null) onProgress?.(info.progress)
  }
  _processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback })
  _model = await AutoModel.from_pretrained(MODEL_ID, { quantized: true, progress_callback })
}

// ── vector helpers ───────────────────────────────────────────────────────────

function unitNormalize(v: Float32Array): Float32Array {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

/** Dot product of two unit vectors == cosine similarity. */
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** Unit-normalized mean of several unit vectors (a cluster centroid). */
function meanUnit(vectors: Float32Array[]): Float32Array {
  const dim = vectors[0].length
  const acc = new Float32Array(dim)
  for (const v of vectors) for (let i = 0; i < dim; i++) acc[i] += v[i]
  for (let i = 0; i < dim; i++) acc[i] /= vectors.length
  return unitNormalize(acc)
}

// ── embedding ────────────────────────────────────────────────────────────────

/** Pick a clamped audio window around a segment for a stable voice fingerprint. */
function segmentWindow(audio: Float32Array, startS: number, endS: number): Float32Array {
  let s = Math.max(0, Math.floor(startS * SAMPLE_RATE))
  let e = Math.min(audio.length, Math.ceil(endS * SAMPLE_RATE))
  if (e <= s) e = Math.min(audio.length, s + Math.floor(MIN_EMBED_S * SAMPLE_RATE))

  // Extend short segments symmetrically so the model has enough signal.
  const durS = (e - s) / SAMPLE_RATE
  if (durS < MIN_EMBED_S) {
    const pad = Math.floor(((MIN_EMBED_S - durS) * SAMPLE_RATE) / 2)
    s = Math.max(0, s - pad)
    e = Math.min(audio.length, e + pad)
  }

  // Cap long segments to the middle MAX_EMBED_S seconds.
  if ((e - s) / SAMPLE_RATE > MAX_EMBED_S) {
    const mid = (s + e) / 2
    const half = Math.floor((MAX_EMBED_S * SAMPLE_RATE) / 2)
    s = Math.max(0, Math.floor(mid - half))
    e = Math.min(audio.length, Math.floor(mid + half))
  }
  return audio.subarray(s, e)
}

async function embed(window: Float32Array): Promise<Float32Array> {
  const inputs = await _processor(window)
  const output = await _model(inputs)
  return unitNormalize(new Float32Array(output.embeddings.data as Float32Array))
}

// ── clustering ───────────────────────────────────────────────────────────────

/** Agglomerative (average-linkage) clustering of unit embeddings. */
function clusterEmbeddings(embeddings: Float32Array[], target: number | 'auto'): number[] {
  const n = embeddings.length
  let clusters = embeddings.map((v, i) => ({ members: [i], centroid: v }))

  while (clusters.length > 1) {
    // Find the two most-similar clusters by centroid cosine similarity.
    let bi = -1, bj = -1, best = -Infinity
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = dot(clusters[i].centroid, clusters[j].centroid)
        if (sim > best) { best = sim; bi = i; bj = j }
      }
    }

    if (typeof target === 'number') {
      if (clusters.length <= Math.max(1, target)) break
    } else if (best < SAME_SPEAKER_SIM) {
      break
    }

    const members = clusters[bi].members.concat(clusters[bj].members)
    const merged = { members, centroid: meanUnit(members.map(m => embeddings[m])) }
    clusters = clusters.filter((_, k) => k !== bi && k !== bj)
    clusters.push(merged)
  }

  const labels = new Array<number>(n).fill(0)
  clusters.forEach((c, label) => c.members.forEach(m => { labels[m] = label }))
  return labels
}

/** Renumber labels so Speaker 0 is whoever spoke first, Speaker 1 next, etc. */
function relabelByFirstAppearance(labels: number[]): number[] {
  const map = new Map<number, number>()
  let next = 0
  return labels.map(l => {
    if (!map.has(l)) map.set(l, next++)
    return map.get(l) as number
  })
}

/**
 * Pure clustering core: turn voice embeddings into ordered speaker labels.
 * Exported so it can be unit-tested without loading the model.
 */
export function labelSpeakers(embeddings: Float32Array[], target: number | 'auto'): number[] {
  if (embeddings.length === 0) return []
  if (embeddings.length === 1) return [0]
  if (typeof target === 'number' && target <= 1) return new Array(embeddings.length).fill(0)
  return relabelByFirstAppearance(clusterEmbeddings(embeddings, target))
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Assign a speaker label to each segment by clustering voice embeddings.
 * Returns one label per input segment (parallel array).
 */
export async function diarize(
  audio16k: Float32Array,
  segments: Array<{ start: number; end: number }>,
  target: number | 'auto',
  onProgress?: (p: DiarizeProgress) => void,
): Promise<number[]> {
  if (segments.length === 0) return []
  if (segments.length === 1) return [0]
  if (typeof target === 'number' && target <= 1) return new Array(segments.length).fill(0)

  const embeddings: Float32Array[] = []
  for (let i = 0; i < segments.length; i++) {
    const window = segmentWindow(audio16k, segments[i].start, segments[i].end)
    embeddings.push(await embed(window))
    onProgress?.({ done: i + 1, total: segments.length })
  }

  return labelSpeakers(embeddings, target)
}
