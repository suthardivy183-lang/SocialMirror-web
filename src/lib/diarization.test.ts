import { describe, it, expect } from 'vitest'
import { labelSpeakers } from './diarization'

/** Unit-normalize a vector (embeddings are compared by cosine similarity). */
function unit(v: number[]): Float32Array {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return new Float32Array(v.map(x => x / norm))
}

// Two clearly distinct "voices": one near axis A, one near axis B.
const A1 = unit([1, 0, 0, 0])
const A2 = unit([0.95, 0.25, 0, 0]) // ~same voice as A1
const B1 = unit([0, 1, 0, 0])
const B2 = unit([0, 0.95, 0.25, 0]) // ~same voice as B1

describe('labelSpeakers', () => {
  it('returns [] for no segments and [0] for one', () => {
    expect(labelSpeakers([], 'auto')).toEqual([])
    expect(labelSpeakers([A1], 'auto')).toEqual([0])
  })

  it('forces a single speaker when target is 1', () => {
    expect(labelSpeakers([A1, B1, A2, B2], 1)).toEqual([0, 0, 0, 0])
  })

  it('groups same-voice segments together with a fixed count', () => {
    // Interleaved A,B,A,B should resolve to two voice groups.
    const labels = labelSpeakers([A1, B1, A2, B2], 2)
    expect(labels[0]).toBe(labels[2]) // both "A" voice
    expect(labels[1]).toBe(labels[3]) // both "B" voice
    expect(labels[0]).not.toBe(labels[1])
    expect(new Set(labels).size).toBe(2)
  })

  it('numbers speakers by first appearance', () => {
    const labels = labelSpeakers([A1, A2, B1, B2], 2)
    expect(labels).toEqual([0, 0, 1, 1])
  })

  it('auto-detects the number of distinct voices', () => {
    const labels = labelSpeakers([A1, A2, B1, B2], 'auto')
    expect(new Set(labels).size).toBe(2)
    expect(labels[0]).toBe(labels[1])
    expect(labels[2]).toBe(labels[3])
  })

  it('auto keeps one speaker when every voice is similar', () => {
    const labels = labelSpeakers([A1, A2, unit([0.9, 0.3, 0, 0])], 'auto')
    expect(new Set(labels).size).toBe(1)
  })
})
