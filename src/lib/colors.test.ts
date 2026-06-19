import { describe, it, expect } from 'vitest'
import { speakerColor, SPEAKER_COLORS } from './colors'

describe('speakerColor', () => {
  it('returns a distinct color for each speaker index', () => {
    expect(speakerColor(0)).toBe(SPEAKER_COLORS[0])
    expect(speakerColor(1)).toBe(SPEAKER_COLORS[1])
  })
  it('wraps around for indices beyond the palette', () => {
    expect(speakerColor(SPEAKER_COLORS.length)).toBe(SPEAKER_COLORS[0])
  })
})
