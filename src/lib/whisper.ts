// Lazy-loads Whisper (whisper-tiny.en) in the browser via @xenova/transformers.
// First call downloads the model (~75 MB) from HuggingFace and caches it in the
// browser's Cache API — subsequent calls use the cache instantly.

// NOTE: @xenova/transformers is imported *dynamically* (not at the top level).
// It's a large package that pulls in Node-only deps (onnxruntime-node, sharp);
// a static import makes Vite's dependency scanner hang on startup. Loading it
// lazily inside loadWhisper() keeps it out of the eager import graph.

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
  _pipe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
    progress_callback: (info: { status: string; progress?: number }) => {
      if (info.status === 'downloading' && info.progress != null) {
        onProgress?.(info.progress)
      }
    },
  })
}

/** Resample Float32Array from sourceSR to 16 000 Hz (Whisper input). */
function resampleTo16k(audio: Float32Array, sourceSR: number): Float32Array {
  if (sourceSR === 16000) return audio
  const ratio = sourceSR / 16000
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
 * Transcribes an audio File/Blob.
 * Returns segments with start/end timestamps.
 * Whisper tiny handles ~10 min audio in a couple of seconds in the browser.
 */
export async function transcribeFile(file: File): Promise<Segment[]> {
  if (!_pipe) throw new Error('Call loadWhisper() first')

  const arrayBuffer = await file.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  audioCtx.close()

  // Mix down to mono
  const mono = decoded.numberOfChannels === 1
    ? decoded.getChannelData(0)
    : (() => {
        const ch = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
          decoded.getChannelData(i),
        )
        const mixed = new Float32Array(decoded.length)
        for (let i = 0; i < decoded.length; i++) {
          mixed[i] = ch.reduce((s, c) => s + c[i], 0) / ch.length
        }
        return mixed
      })()

  const audio16k = resampleTo16k(mono, decoded.sampleRate)

  // The library's call signature is a huge union that doesn't include a bare
  // Float32Array audio input cleanly; cast to a narrow callable for this use.
  const asr = _pipe as unknown as (
    audio: Float32Array,
    opts: { return_timestamps: boolean; chunk_length_s: number; stride_length_s: number },
  ) => Promise<{ chunks?: Array<{ text: string; timestamp: [number, number] }> }>

  const result = await asr(audio16k, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  })

  if (!result.chunks) return []

  return result.chunks.map(c => ({
    text: c.text.trim(),
    start: c.timestamp[0] ?? 0,
    end: c.timestamp[1] ?? c.timestamp[0] ?? 0,
  }))
}
