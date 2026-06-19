import { describe, it, expect } from 'vitest'
import {
  textValence,
  countFillers,
  countHedges,
  fillerBreakdown,
  questionStats,
  pauseStats,
  expressiveness,
  arousalOf,
  scoreSpeaker,
  interruptionStats,
  backchannelStats,
  entrainmentStats,
  radarDimensions,
  generateReport,
  type SpeakerFeatures,
} from './coaching'

/** Build a SpeakerFeatures with sensible defaults, overriding as needed. */
function speaker(overrides: Partial<SpeakerFeatures> = {}): SpeakerFeatures {
  return {
    speakerID: 0,
    talkTimeRatio: 0.5,
    turnCount: 5,
    hedgeCount: 0,
    questionCount: 0,
    avgPitch: 150,
    pitchVariance: 20,
    avgEnergyDB: -30,
    energyVariance: 4,
    dominanceScore: 0,
    confidenceScore: 0,
    ...overrides,
  }
}

describe('textValence', () => {
  it('is positive when positive words dominate', () => {
    expect(textValence('This is great, I love it, thanks')).toBeGreaterThan(0)
  })
  it('is negative when negative words dominate', () => {
    expect(textValence('This is a problem, very difficult and I am worried')).toBeLessThan(0)
  })
  it('is 0 for neutral text', () => {
    expect(textValence('the meeting is at noon today')).toBe(0)
  })
})

describe('countFillers / fillerBreakdown', () => {
  it('counts filler occurrences', () => {
    expect(countFillers('um uh um')).toBe(3) // um×2 + uh×1
  })
  it('breaks fillers down per word, only non-zero', () => {
    const b = fillerBreakdown('um um like')
    expect(b['um']).toBe(2)
    expect(b['like']).toBe(1)
    expect(b['uh']).toBeUndefined()
  })
})

describe('countHedges', () => {
  it('counts hedge phrases', () => {
    expect(countHedges('I think maybe we should')).toBe(2) // "i think" + "maybe"
  })
})

describe('questionStats', () => {
  it('classifies questions vs statements', () => {
    const q = questionStats('What is this? It is a test.')
    expect(q.questions).toBe(1)
    expect(q.statements).toBe(1)
    expect(q.ratio).toBeCloseTo(0.5)
  })
  it('detects interrogative openers without a question mark', () => {
    const q = questionStats('How does this work')
    expect(q.questions).toBe(1)
  })
})

describe('pauseStats', () => {
  it('computes silence and talk ratio', () => {
    const p = pauseStats([1, 2], 10)
    expect(p.totalSilenceSec).toBe(3)
    expect(p.talkRatio).toBeCloseTo(0.7)
    expect(p.avgPauseSec).toBe(1.5)
    expect(p.longestPauseSec).toBe(2)
    expect(p.pauseCount).toBe(2)
  })
  it('handles no pauses', () => {
    const p = pauseStats([], 10)
    expect(p.talkRatio).toBe(1)
    expect(p.pauseCount).toBe(0)
  })
})

describe('expressiveness / arousalOf', () => {
  it('is ~1 for highly varied voices and 0 for flat ones', () => {
    expect(expressiveness(speaker({ pitchVariance: 40, energyVariance: 8 }))).toBeCloseTo(1)
    expect(expressiveness(speaker({ pitchVariance: 0, energyVariance: 0 }))).toBe(0)
  })
  it('arousal stays within [0,1]', () => {
    const a = arousalOf(speaker({ pitchVariance: 100, energyVariance: 100 }))
    expect(a).toBeLessThanOrEqual(1)
    expect(a).toBeGreaterThanOrEqual(0)
  })
})

describe('scoreSpeaker', () => {
  it('gives the bigger talker higher dominance', () => {
    const all = [
      speaker({ speakerID: 0, talkTimeRatio: 0.8, turnCount: 10 }),
      speaker({ speakerID: 1, talkTimeRatio: 0.2, turnCount: 3 }),
    ]
    const d0 = scoreSpeaker(all[0], all).dominance
    const d1 = scoreSpeaker(all[1], all).dominance
    expect(d0).toBeGreaterThan(d1)
  })
  it('penalises hedging in confidence', () => {
    const all = [speaker({ talkTimeRatio: 0.6 })]
    const noHedge = scoreSpeaker(speaker({ talkTimeRatio: 0.6, hedgeCount: 0 }), all).confidence
    const lotsHedge = scoreSpeaker(speaker({ talkTimeRatio: 0.6, hedgeCount: 10 }), all).confidence
    expect(lotsHedge).toBeLessThan(noHedge)
  })
})

describe('interruptionStats', () => {
  it('flags a fast barge-in by a different speaker', () => {
    const ir = interruptionStats([
      { speakerID: 0, startTime: 0 },
      { speakerID: 1, startTime: 0.5 }, // <1s after speaker 0 → interruption
      { speakerID: 0, startTime: 5 },   // >1s gap → clean
    ])
    expect(ir.total).toBe(1)
    expect(ir.made[1]).toBe(1)
    expect(ir.received[0]).toBe(1)
  })
})

describe('backchannelStats', () => {
  it('credits short acknowledgements from the user while others speak', () => {
    const bc = backchannelStats([
      { speakerID: 1, text: 'So here is my long detailed point about the thing' },
      { speakerID: 0, text: 'yeah' },
      { speakerID: 1, text: 'and another point' },
      { speakerID: 0, text: 'got it' },
    ])
    expect(bc.count).toBe(2)
    expect(bc.phrases['yeah']).toBe(1)
  })
})

describe('entrainmentStats', () => {
  it('scores identical voices as highly aligned', () => {
    const a = speaker({ speakerID: 0 })
    const b = speaker({ speakerID: 1 })
    const { score } = entrainmentStats([a, b])
    expect(score).toBeGreaterThan(0.9)
  })
})

describe('radarDimensions', () => {
  it('returns five dimensions in [0,1]', () => {
    const dims = radarDimensions(speaker())
    expect(dims).toHaveLength(5)
    for (const d of dims) {
      expect(d.value).toBeGreaterThanOrEqual(0)
      expect(d.value).toBeLessThanOrEqual(1)
    }
  })
})

describe('generateReport', () => {
  it('flags domination when the user talks most of the time', () => {
    const r = generateReport([
      speaker({ speakerID: 0, talkTimeRatio: 0.8 }),
      speaker({ speakerID: 1, talkTimeRatio: 0.2 }),
    ], 0)
    expect(r.headline.toLowerCase()).toContain('dominated')
  })
  it('flags mostly-listening when the user barely talks', () => {
    const r = generateReport([
      speaker({ speakerID: 0, talkTimeRatio: 0.1 }),
      speaker({ speakerID: 1, talkTimeRatio: 0.9 }),
    ], 0)
    expect(r.headline.toLowerCase()).toContain('listening')
  })
  it('handles the empty case', () => {
    expect(generateReport([]).headline).toBe('No speech detected')
  })
})
