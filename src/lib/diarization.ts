// MFCC-based speaker diarization — mirrors the iOS ECAPA cosine clustering
// but uses mel-filterbank features computable in the browser without a heavy model.

const SAMPLE_RATE = 16000
const FRAME_SIZE = 512
const HOP_SIZE = 160
const N_MELS = 40
const N_MFCC = 13

function hanning(n: number): Float32Array {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
  return w
}

function rfft(signal: Float32Array): Float32Array {
  const n = signal.length
  const out = new Float32Array(n)
  for (let k = 0; k < n / 2; k++) {
    let re = 0, im = 0
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * k * t) / n
      re += signal[t] * Math.cos(angle)
      im -= signal[t] * Math.sin(angle)
    }
    out[k] = Math.sqrt(re * re + im * im)
  }
  return out
}

function melFilterbank(fftSize: number, nMels: number, sr: number): number[][] {
  const fMin = 0, fMax = sr / 2
  const melMin = 2595 * Math.log10(1 + fMin / 700)
  const melMax = 2595 * Math.log10(1 + fMax / 700)
  const melPoints = Array.from({ length: nMels + 2 }, (_, i) =>
    melMin + (i * (melMax - melMin)) / (nMels + 1)
  )
  const hzPoints = melPoints.map(m => 700 * (Math.pow(10, m / 2595) - 1))
  const binPoints = hzPoints.map(f => Math.floor((fftSize + 1) * f / sr))

  return Array.from({ length: nMels }, (_, m) => {
    const filter = new Array(fftSize / 2).fill(0)
    for (let k = binPoints[m]; k < binPoints[m + 1]; k++)
      filter[k] = (k - binPoints[m]) / (binPoints[m + 1] - binPoints[m])
    for (let k = binPoints[m + 1]; k < binPoints[m + 2]; k++)
      filter[k] = (binPoints[m + 2] - k) / (binPoints[m + 2] - binPoints[m + 1])
    return filter
  })
}

const filterbank = melFilterbank(FRAME_SIZE, N_MELS, SAMPLE_RATE)
const window = hanning(FRAME_SIZE)

function extractEmbedding(samples: Float32Array): Float32Array {
  const frames: Float32Array[] = []
  for (let start = 0; start + FRAME_SIZE <= samples.length; start += HOP_SIZE) {
    const frame = new Float32Array(FRAME_SIZE)
    for (let i = 0; i < FRAME_SIZE; i++) frame[i] = samples[start + i] * window[i]
    frames.push(frame)
  }

  if (frames.length === 0) return new Float32Array(N_MFCC)

  // Mean log-mel over all frames → compact fixed-dim embedding
  const melMean = new Float32Array(N_MELS)
  for (const frame of frames) {
    const spectrum = rfft(frame)
    for (let m = 0; m < N_MELS; m++) {
      let energy = 0
      for (let k = 0; k < spectrum.length; k++) energy += filterbank[m][k] * spectrum[k]
      melMean[m] += Math.log(Math.max(energy, 1e-10))
    }
  }
  for (let m = 0; m < N_MELS; m++) melMean[m] /= frames.length

  // DCT to get MFCCs
  const mfcc = new Float32Array(N_MFCC)
  for (let n = 0; n < N_MFCC; n++) {
    let sum = 0
    for (let m = 0; m < N_MELS; m++)
      sum += melMean[m] * Math.cos((Math.PI * n * (2 * m + 1)) / (2 * N_MELS))
    mfcc[n] = sum
  }

  // L2 normalise
  let norm = 0
  for (let i = 0; i < N_MFCC; i++) norm += mfcc[i] * mfcc[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < N_MFCC; i++) mfcc[i] /= norm
  return mfcc
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot // already L2-normalised
}

export interface Cluster {
  id: number
  centroid: Float32Array
  count: number
}

export class OnlineSpeakerClusterer {
  private clusters: Cluster[] = []
  private nextID = 0
  readonly threshold: number

  constructor(threshold = 0.75) {
    this.threshold = threshold
  }

  assign(embedding: Float32Array): number {
    let bestID = -1, bestSim = -Infinity
    for (const c of this.clusters) {
      const sim = cosineSimilarity(embedding, c.centroid)
      if (sim > bestSim) { bestSim = sim; bestID = c.id }
    }

    if (bestSim >= this.threshold && bestID !== -1) {
      const c = this.clusters.find(x => x.id === bestID)!
      // Running average centroid update
      for (let i = 0; i < c.centroid.length; i++)
        c.centroid[i] = (c.centroid[i] * c.count + embedding[i]) / (c.count + 1)
      c.count++
      // Re-normalise
      let norm = 0
      for (let i = 0; i < c.centroid.length; i++) norm += c.centroid[i] ** 2
      norm = Math.sqrt(norm) || 1
      for (let i = 0; i < c.centroid.length; i++) c.centroid[i] /= norm
      return bestID
    }

    const id = this.nextID++
    this.clusters.push({ id, centroid: embedding.slice(), count: 1 })
    return id
  }

  speakerCount(): number { return this.clusters.length }
}

export { extractEmbedding }
