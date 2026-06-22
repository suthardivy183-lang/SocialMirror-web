// Transcription layer — runs in the browser (WASM Whisper) or in the Tauri
// desktop app (faster-whisper Python sidecar).
//
// When running inside Tauri, audio is sent to a local Python process using
// faster-whisper + CrisperWhisper, which captures fillers (um/uh/ahh) that
// browser Whisper deliberately omits.

const MODEL_ID = 'Xenova/whisper-small.en'
const WHISPER_SAMPLE_RATE = 16000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipe: any = null

export interface Segment {
  text: string
  start: number
  end: number
}

export interface TranscribeProgress {
  fraction: number
  secondsDone: number
  secondsTotal: number
}

/** A speaker-labelled transcript line from the native diarizer. */
export interface SpeakerLine {
  speaker: number   // 1-based: Speaker 1, 2, 3…
  start: number
  end: number
  text: string
  confidence: number
}

export interface TimelineSpan {
  speaker: number
  start: number
  end: number
}

export interface NativeDiarization {
  lines: SpeakerLine[]
  timeline: TimelineSpan[]
  speakerCount: number
  diarizer: 'pyannote' | 'ecapa' | 'single'
}

// The desktop sidecar transcribes AND diarizes in one call. transcribeAudio()
// returns plain segments for a uniform interface; the richer speaker data from
// that same call is stashed here for the caller to pick up (one-shot).
let _lastNativeDiarization: NativeDiarization | null = null

/** Consume the diarization produced by the most recent native transcription
 *  (desktop only). Returns null in the browser or after it's been read once. */
export function takeNativeDiarization(): NativeDiarization | null {
  const r = _lastNativeDiarization
  _lastNativeDiarization = null
  return r
}

export const SAMPLE_RATE = WHISPER_SAMPLE_RATE

// ── Tauri detection ──────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// ── WAV encoder (Float32 PCM-16 mono) ───────────────────────────────────────

function float32ToWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numSamples = samples.length
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)

  const w32 = (off: number, val: number) => view.setUint32(off, val, true)
  const w16 = (off: number, val: number) => view.setUint16(off, val, true)

  // RIFF header
  view.setUint32(0, 0x46464952, false)   // 'RIFF'
  w32(4, 36 + numSamples * 2)
  view.setUint32(8, 0x45564157, false)   // 'WAVE'
  // fmt  chunk
  view.setUint32(12, 0x20746d66, false)  // 'fmt '
  w32(16, 16); w16(20, 1); w16(22, 1)   // PCM, mono
  w32(24, sampleRate); w32(28, sampleRate * 2); w16(32, 2); w16(34, 16)
  // data chunk
  view.setUint32(36, 0x61746164, false)  // 'data'
  w32(40, numSamples * 2)

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Uint8Array(buffer)
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// ── Native (Tauri) transcription path ───────────────────────────────────────

async function transcribeNative(
  audio16k: Float32Array,
  numSpeakers: number,
  onProgress?: (p: TranscribeProgress) => void,
): Promise<Segment[]> {
  const { invoke } = await import('@tauri-apps/api/core')

  // Signal start
  const secondsTotal = audio16k.length / WHISPER_SAMPLE_RATE
  onProgress?.({ fraction: 0.05, secondsDone: 0, secondsTotal })

  const wavBytes = float32ToWav(audio16k, WHISPER_SAMPLE_RATE)
  const audioB64 = uint8ToBase64(wavBytes)

  onProgress?.({ fraction: 0.1, secondsDone: 0, secondsTotal })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await invoke<any>('transcribe_audio', {
    audioB64,
    numSpeakers,
  })

  if (result.error) throw new Error(result.error)

  onProgress?.({ fraction: 1, secondsDone: secondsTotal, secondsTotal })

  // Stash the speaker diarization done by the sidecar so the caller can use it
  // directly instead of running browser-side WavLM clustering.
  if (Array.isArray(result.lines)) {
    _lastNativeDiarization = {
      lines: result.lines.map((l: SpeakerLine) => ({
        speaker: l.speaker, start: l.start, end: l.end,
        text: (l.text ?? '').trim(), confidence: l.confidence ?? 0,
      })),
      timeline: result.timeline ?? [],
      speakerCount: result.speaker_count ?? 1,
      diarizer: result.diarizer ?? 'single',
    }
  } else {
    _lastNativeDiarization = null
  }

  const segments: Segment[] = (result.segments ?? [])
    .map((s: { text: string; start: number; end: number }) => ({
      text: s.text.trim(),
      start: s.start,
      end: s.end,
    }))
    .filter((s: Segment) => s.text.length > 0)

  return segments
}

// ── Browser (WASM) path ──────────────────────────────────────────────────────

/** Resample Float32Array from sourceSR to 16 000 Hz. */
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

function normalizeLoudness(audio: Float32Array): Float32Array {
  const n = audio.length
  if (n === 0) return audio
  let sum = 0
  for (let i = 0; i < n; i++) sum += audio[i]
  const dc = sum / n
  let sq = 0
  for (let i = 0; i < n; i++) { const v = audio[i] - dc; sq += v * v }
  const rms = Math.sqrt(sq / n)
  if (rms < 1e-5) return audio
  const gain = Math.min(0.12 / rms, 30)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let v = (audio[i] - dc) * gain
    if (v > 1) v = 1; else if (v < -1) v = -1
    out[i] = v
  }
  return out
}

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

export async function loadWhisper(onProgress?: (pct: number) => void): Promise<void> {
  if (isTauri()) return // browser model not needed in desktop mode
  if (_pipe) return
  const { pipeline, env } = await import('@xenova/transformers')
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

export async function decodeAudio(file: Blob): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  audioCtx.close()
  const mono = toMono(decoded)
  const audio16k = resampleTo16k(mono, decoded.sampleRate)
  return normalizeLoudness(audio16k)
}

const CHUNK_LENGTH_S = 30
const STRIDE_LENGTH_S = 5

export async function transcribeAudio(
  audio16k: Float32Array,
  onProgress?: (p: TranscribeProgress) => void,
  numSpeakers = 0,
): Promise<Segment[]> {
  // Desktop: use faster-whisper sidecar
  if (isTauri()) {
    return transcribeNative(audio16k, numSpeakers, onProgress)
  }

  // Browser: WASM Whisper
  if (!_pipe) throw new Error('Call loadWhisper() first')

  const secondsTotal = audio16k.length / WHISPER_SAMPLE_RATE
  const jump = WHISPER_SAMPLE_RATE * (CHUNK_LENGTH_S - 2 * STRIDE_LENGTH_S)
  const totalChunks = Math.max(1, Math.ceil(audio16k.length / jump))
  let chunksDone = 0

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

  if (result.text && result.text.trim().length > 0) {
    return [{ text: result.text.trim(), start: 0, end: secondsTotal }]
  }

  return []
}

export async function transcribeFile(
  file: Blob,
  onProgress?: (p: TranscribeProgress) => void,
): Promise<Segment[]> {
  const audio16k = await decodeAudio(file)
  return transcribeAudio(audio16k, onProgress)
}
