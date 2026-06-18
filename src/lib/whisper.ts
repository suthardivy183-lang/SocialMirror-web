// Lazy-loads Whisper in the browser via @xenova/transformers.
// First call downloads the model from HuggingFace and caches it in the browser's
// Cache API — subsequent calls use the cache instantly.
//
// We use whisper-small.en (quantized ~240 MB): the most accurate Whisper model
// that's still practical to download and run in the browser. Much better word
// recognition than base/tiny, at the cost of a larger first-load download and
// slower transcription.
//
// NOTE: @xenova/transformers is imported *dynamically* (not at the top level).
// It's a large package that pulls in Node-only deps (onnxruntime-node, sharp);
// a static import makes Vite's dependency scanner hang on startup. Loading it
// lazily inside loadWhisper() keeps it out of the eager import graph.

const MODEL_ID = 'Xenova/whisper-small.en'

const WHISPER_SAMPLE_RATE = 16000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipe: any = null

export interface Segment {
  text: string
  start: number // seconds
  end: number   // seconds
}

export async function loadWhisper(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (_pipe) return
  const { pipeline, env } = await import('@xenova/transformers')
  // Allow downloading from the default HuggingFace CDN
  env.allowLocalModels = false
  _pipe = await pipeline('automatic-speech-recognition', MODEL_ID, {
    quantized: true,
    progress_callback: (info: { status: string; progress?: number }) => {
      if (info.status === 'downloading' && info.progress != null) {
        onProgress?.(info.progress)
      }
    },
  })
}

/** Resample Float32Array from sourceSR to 16 000 Hz (Whisper input). */
function resampleTo16k(audio: Float32Array, sourceSR: number): Float32Array {
  if (sourceSR === WHISPER_SAMPLE_RATE) return audio
  const ratio = sourceSR / WHISPER_SAMPLE_RATE
  const outLen = Math.round(audio.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const lo = Math.floor(src)
    const hi = Math.min(lo + 1, audio.length - 1)
    const t = src - lo
    out[i] = audio[lo] * (1 - t) + audio[hi] * t
  }
  return out
}

/**
 * Boost quiet recordings so low-volume speech reaches Whisper clearly.
 *
 * Steps:
 *  1. Remove any DC offset (constant bias from the mic/encoder).
 *  2. Scale the whole signal toward a comfortable speech level (RMS-based), so
 *     a clip recorded at -40 dB is amplified just like a normal one. A gain cap
 *     prevents near-silent files from having their noise floor blown up.
 *  3. Hard-clamp the rare transient that overshoots ±1 after the boost.
 *
 * RMS (average energy) is used rather than peak so that one loud cough doesn't
 * stop the quiet conversation around it from being amplified.
 */
function normalizeLoudness(audio: Float32Array): Float32Array {
  const n = audio.length
  if (n === 0) return audio

  // 1. DC offset
  let sum = 0
  for (let i = 0; i < n; i++) sum += audio[i]
  const dc = sum / n

  // 2. RMS after DC removal
  let sq = 0
  for (let i = 0; i < n; i++) {
    const v = audio[i] - dc
    sq += v * v
  }
  const rms = Math.sqrt(sq / n)
  if (rms < 1e-5) return audio // effectively silent — nothing to boost

  const TARGET_RMS = 0.12 // ~ -18 dBFS, a comfortable speech loudness
  const MAX_GAIN = 30     // cap so faint background hiss isn't amplified to a roar
  const gain = Math.min(TARGET_RMS / rms, MAX_GAIN)

  // 3. Apply gain with a safety clamp
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let v = (audio[i] - dc) * gain
    if (v > 1) v = 1
    else if (v < -1) v = -1
    out[i] = v
  }
  return out
}

/** Mix a decoded buffer down to a single mono channel. */
function toMono(decoded: AudioBuffer): Float32Array {
  if (decoded.numberOfChannels === 1) return decoded.getChannelData(0)
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
    decoded.getChannelData(i),
  )
  const mixed = new Float32Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) {
    let s = 0
    for (const c of channels) s += c[i]
    mixed[i] = s / channels.length
  }
  return mixed
}

/**
 * Transcribes an audio File/Blob.
 * Returns segments with start/end timestamps.
 *
 * The audio is mixed to mono, resampled to 16 kHz, and loudness-normalized so
 * quiet recordings transcribe as accurately as loud ones.
 */
export async function transcribeFile(file: File): Promise<Segment[]> {
  if (!_pipe) throw new Error('Call loadWhisper() first')

  const arrayBuffer = await file.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  audioCtx.close()

  const mono = toMono(decoded)
  const audio16k = resampleTo16k(mono, decoded.sampleRate)
  const normalized = normalizeLoudness(audio16k)

  // The library's call signature is a huge union that doesn't include a bare
  // Float32Array audio input cleanly; cast to a narrow callable for this use.
  const asr = _pipe as unknown as (
    audio: Float32Array,
    opts: {
      return_timestamps: boolean
      chunk_length_s: number
      stride_length_s: number
      // Greedy decode with a temperature fallback ladder: if a chunk decodes
      // with low confidence (common for quiet/noisy audio), Whisper retries at
      // a higher temperature instead of emitting garbage or dropping the chunk.
      temperature: number | number[]
      no_speech_threshold: number
    },
  ) => Promise<{ chunks?: Array<{ text: string; timestamp: [number, number] }> }>

  const result = await asr(normalized, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    temperature: [0, 0.2, 0.4, 0.6, 0.8, 1.0],
    no_speech_threshold: 0.6,
  })

  if (!result.chunks) return []

  return result.chunks
    .map(c => ({
      text: c.text.trim(),
      start: c.timestamp[0] ?? 0,
      end: c.timestamp[1] ?? c.timestamp[0] ?? 0,
    }))
    .filter(s => s.text.length > 0)
}
