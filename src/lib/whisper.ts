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

const CHUNK_LENGTH_S = 30
const STRIDE_LENGTH_S = 5

/** Progress while transcribing: 0..1 fraction, plus seconds done / total. */
export interface TranscribeProgress {
  fraction: number
  secondsDone: number
  secondsTotal: number
}

/** Sample rate Whisper (and the diarizer) expect. */
export const SAMPLE_RATE = WHISPER_SAMPLE_RATE

/**
 * Decode an audio Blob to a mono, 16 kHz, loudness-normalized Float32Array.
 * Exposed separately so the same buffer can be reused for diarization without
 * decoding twice.
 */
export async function decodeAudio(file: Blob): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  audioCtx.close()

  const mono = toMono(decoded)
  const audio16k = resampleTo16k(mono, decoded.sampleRate)
  return normalizeLoudness(audio16k)
}

/**
 * Transcribes prepared 16 kHz audio. Returns segments with start/end timestamps.
 *
 * Whisper processes long audio in sequential 30 s chunks. `onProgress` fires
 * after each chunk so the UI can show real progress instead of looking frozen.
 */
export async function transcribeAudio(
  audio16k: Float32Array,
  onProgress?: (p: TranscribeProgress) => void,
): Promise<Segment[]> {
  if (!_pipe) throw new Error('Call loadWhisper() first')

  const secondsTotal = audio16k.length / WHISPER_SAMPLE_RATE
  // Mirror the library's chunking math so we can estimate total chunk count.
  const jump = WHISPER_SAMPLE_RATE * (CHUNK_LENGTH_S - 2 * STRIDE_LENGTH_S)
  const totalChunks = Math.max(1, Math.ceil(audio16k.length / jump))
  let chunksDone = 0

  // The library's call signature is a huge union that doesn't include a bare
  // Float32Array audio input cleanly; cast to a narrow callable for this use.
  const asr = _pipe as unknown as (
    audio: Float32Array,
    opts: {
      return_timestamps: boolean
      chunk_length_s: number
      stride_length_s: number
      chunk_callback: () => void
    },
  ) => Promise<{
    text?: string
    chunks?: Array<{ text: string; timestamp: [number, number] }>
  }>

  const result = await asr(audio16k, {
    return_timestamps: true,
    chunk_length_s: CHUNK_LENGTH_S,
    stride_length_s: STRIDE_LENGTH_S,
    chunk_callback: () => {
      chunksDone++
      const fraction = Math.min(chunksDone / totalChunks, 1)
      onProgress?.({ fraction, secondsDone: fraction * secondsTotal, secondsTotal })
    },
  })

  // Preferred path: timestamped chunks (lets us separate speakers by pauses).
  if (result.chunks && result.chunks.length > 0) {
    const segments = result.chunks
      .map(c => ({
        text: c.text.trim(),
        start: c.timestamp[0] ?? 0,
        end: c.timestamp[1] ?? c.timestamp[0] ?? 0,
      }))
      .filter(s => s.text.length > 0)
    if (segments.length > 0) return segments
  }

  // Fallback: timestamp decoding produced nothing but we still have full text.
  // Return it as one segment rather than dropping the whole transcript.
  if (result.text && result.text.trim().length > 0) {
    return [{ text: result.text.trim(), start: 0, end: secondsTotal }]
  }

  return []
}

/**
 * Convenience: decode + transcribe an audio Blob in one call.
 * The audio is mixed to mono, resampled to 16 kHz, and loudness-normalized so
 * quiet recordings transcribe as accurately as loud ones.
 */
export async function transcribeFile(
  file: Blob,
  onProgress?: (p: TranscribeProgress) => void,
): Promise<Segment[]> {
  const audio16k = await decodeAudio(file)
  return transcribeAudio(audio16k, onProgress)
}
