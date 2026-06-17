// Runs Whisper tiny in a Web Worker so it never blocks the UI thread.
// Uses @xenova/transformers which ships models as ONNX and runs them in WASM.

import { pipeline, env } from '@xenova/transformers'

// Use the CDN-hosted WASM + models so we don't bundle them.
env.allowLocalModels = false

type WhisperPipeline = Awaited<ReturnType<typeof pipeline>>
let whisper: WhisperPipeline | null = null

self.onmessage = async (e: MessageEvent) => {
  const { type, audio, segId } = e.data

  if (type === 'load') {
    try {
      whisper = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        chunk_length_s: 30,
        stride_length_s: 5,
      })
      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) })
    }
    return
  }

  if (type === 'transcribe' && whisper && audio) {
    try {
      const result = await whisper(audio, {
        task: 'transcribe',
        language: 'english',
        return_timestamps: false,
      }) as { text: string }
      self.postMessage({ type: 'final', text: result.text, segId })
    } catch {
      self.postMessage({ type: 'final', text: '', segId })
    }
  }
}
