export interface SpeakerFeatures {
  speakerID: number
  name?: string
  talkTimeRatio: number
  turnCount: number
  hedgeCount: number
  questionCount: number
  avgPitch: number        // Hz
  pitchVariance: number   // Hz (stddev of pitch track)
  avgEnergyDB: number     // dB
  energyVariance: number  // dB (stddev of loudness)
  dominanceScore: number  // 0..1
  confidenceScore: number // 0..1
}

/**
 * Expressiveness (vocal variation) 0..1. Combines pitch variation and loudness
 * variation. A flat monotone delivery → near 0; a dynamic, varied voice → near 1.
 * Pitch stddev is normalised against ~40 Hz (lively speech), energy against ~8 dB.
 */
export function expressiveness(s: SpeakerFeatures): number {
  const pitchPart = Math.min(1, s.pitchVariance / 40)
  const energyPart = Math.min(1, s.energyVariance / 8)
  return Math.max(0, Math.min(1, pitchPart * 0.65 + energyPart * 0.35))
}

export function monotonyTip(score: number): string {
  if (score < 0.3) return 'Quite monotone — vary your pitch and volume to hold attention and signal what matters.'
  if (score < 0.55) return 'Moderately expressive. Adding more pitch range on key points would make you more engaging.'
  if (score > 0.85) return 'Very dynamic delivery — expressive and engaging. Just keep it natural, not theatrical.'
  return 'Good vocal variation — your delivery sounds lively and engaged.'
}

export interface CoachingReport {
  headline: string
  insight: string
  tip: string
  dominantSpeakerID: number
}

export interface PauseStats {
  totalSilenceSec: number
  talkRatio: number      // 0..1, speech vs total
  avgPauseSec: number
  longestPauseSec: number
  pauseCount: number
}

/** Silence & pause analysis from completed pause durations + total duration. */
export function pauseStats(pauses: number[], totalSec: number): PauseStats {
  const totalSilence = pauses.reduce((s, p) => s + p, 0)
  const talk = Math.max(0, totalSec - totalSilence)
  return {
    totalSilenceSec: Math.round(totalSilence),
    talkRatio: totalSec > 0 ? talk / totalSec : 1,
    avgPauseSec: pauses.length ? +(totalSilence / pauses.length).toFixed(1) : 0,
    longestPauseSec: pauses.length ? +Math.max(...pauses).toFixed(1) : 0,
    pauseCount: pauses.length,
  }
}

const HEDGES = ['maybe','perhaps','sort of','kind of','i think','i guess',
  'probably','possibly','basically','actually']

// Filler / disfluency words and crutch phrases
export const FILLERS = ['um','uh','er','erm','hmm','like','you know','i mean','so yeah','right,']

export function countHedges(text: string) {
  const t = text.toLowerCase()
  return HEDGES.reduce((n, w) => n + (t.split(w).length - 1), 0)
}

export function countFillers(text: string) {
  const t = ` ${text.toLowerCase()} `
  return FILLERS.reduce((n, w) => n + (t.split(w).length - 1), 0)
}

/** Per-word filler counts, e.g. { um: 4, like: 2 }, sorted desc. */
export function fillerBreakdown(text: string): Record<string, number> {
  const t = ` ${text.toLowerCase()} `
  const out: Record<string, number> = {}
  for (const w of FILLERS) {
    const c = t.split(w).length - 1
    if (c > 0) out[w] = c
  }
  return out
}

// --- Emotion / sentiment ---
const POSITIVE_WORDS = ['great','good','love','excited','happy','glad','perfect','awesome','wonderful','yes',
  'thanks','thank','appreciate','agree','excellent','fantastic','nice','cool','sure','definitely','absolutely','win','win-win','helpful','easy']
const NEGATIVE_WORDS = ['no','not','never','problem','issue','difficult','hard','worried','concern','concerned','unfortunately',
  'sorry','disappointed','frustrated','angry','annoyed','confused','wrong','bad','hate','can\'t','cannot','won\'t','expensive','risk','fail']
const STRESS_WORDS = ['stressed','overwhelmed','urgent','deadline','pressure','anxious','nervous','panic','worried']

export interface Emotion { label: string; emoji: string; valence: number } // valence -1..1

/** Text valence in [-1, 1] from positive vs negative word balance. */
export function textValence(text: string): number {
  const words = text.toLowerCase().split(/\s+/)
  let pos = 0, neg = 0
  for (const w of words) {
    const clean = w.replace(/[.,!?;:]/g, '')
    if (POSITIVE_WORDS.includes(clean)) pos++
    if (NEGATIVE_WORDS.includes(clean) || STRESS_WORDS.includes(clean)) neg++
  }
  const total = pos + neg
  return total > 0 ? (pos - neg) / total : 0
}

/** Combine text valence with vocal arousal (energy + pitch variation) into an emotion label. */
export function emotionFor(text: string, arousal: number): Emotion {
  const valence = textValence(text)
  const stressed = STRESS_WORDS.some(w => text.toLowerCase().includes(w))
  if (valence > 0.25) return { label: arousal > 0.6 ? 'Enthusiastic' : 'Positive', emoji: arousal > 0.6 ? '😄' : '🙂', valence }
  if (valence < -0.2 || stressed) return { label: arousal > 0.55 ? 'Tense' : 'Negative', emoji: arousal > 0.55 ? '😣' : '🙁', valence }
  return { label: arousal > 0.6 ? 'Animated' : 'Neutral', emoji: arousal > 0.6 ? '😯' : '😐', valence }
}

/** Normalised vocal arousal 0..1 from energy + pitch variation. */
export function arousalOf(s: SpeakerFeatures): number {
  return Math.max(0, Math.min(1, (s.energyVariance / 8) * 0.5 + (s.pitchVariance / 40) * 0.5))
}

export function emotionTip(overall: number, trend: number): string {
  let base = overall > 0.2 ? 'The conversation carried a positive tone overall.'
    : overall < -0.15 ? 'The conversation leaned negative or tense overall.'
    : 'The conversation stayed fairly neutral in tone.'
  if (trend > 0.25) base += ' It warmed up as it went on — a good sign you built rapport.'
  else if (trend < -0.25) base += ' Tone cooled toward the end — worth reviewing what shifted.'
  return base
}

// Short affirmations that signal active listening
export const BACKCHANNELS = ['yeah','yep','uh-huh','uh huh','mhm','mm-hmm','right','okay','ok',
  'i see','exactly','totally','makes sense','got it','sure','agreed','true','for sure','nice','wow','really','i know']

export interface BackchannelLine { speakerID: number; text: string }

/**
 * Active-listening score from backchannel utterances. A backchannel is a short
 * acknowledgement (≤4 words) containing an affirmation, said by the user while
 * others hold the floor. More backchannels relative to others' turns → more
 * engaged listening.
 */
export function backchannelStats(lines: BackchannelLine[], userID = 0): {
  count: number
  score: number
  phrases: Record<string, number>
} {
  const userLines = lines.filter(l => l.speakerID === userID)
  const othersTurns = lines.filter(l => l.speakerID !== userID).length
  const phrases: Record<string, number> = {}
  let count = 0

  for (const l of userLines) {
    const words = l.text.trim().split(/\s+/)
    if (words.length > 4) continue // backchannels are short
    const lower = l.text.toLowerCase()
    for (const b of BACKCHANNELS) {
      if (lower.includes(b)) { phrases[b] = (phrases[b] ?? 0) + 1; count++; break }
    }
  }
  // Score: backchannels relative to others' turns, capped at 1
  const score = othersTurns > 0 ? Math.min(1, count / othersTurns * 2.5) : 0
  return { count, score, phrases }
}

export function backchannelTip(score: number, count: number, hasOthers: boolean): string {
  if (!hasOthers) return 'Hard to gauge listening in a solo recording — backchannels matter most when others are speaking.'
  if (count === 0) return 'No verbal acknowledgements detected. Small cues like "right" or "got it" show people you’re engaged.'
  if (score > 0.7) return 'Excellent active listening — you gave plenty of supportive cues that keep others talking.'
  if (score > 0.35) return 'Good listening signals. A few more acknowledgements would make others feel even more heard.'
  return 'You acknowledged others occasionally. Adding more "mhm"/"I see" cues signals deeper attention.'
}

export interface TurnLine { speakerID: number; startTime: number }

/**
 * Approximate interruption detection from turn timing. When a different speaker
 * starts within `gapThreshold` seconds of the previous turn, we treat it as the
 * new speaker interrupting the previous one. (Approximate — true overlap needs
 * full diarization, but this captures rapid barge-in turns.)
 */
export function interruptionStats(lines: TurnLine[], gapThreshold = 1.0): {
  total: number
  made: Record<number, number>      // interruptions each speaker made
  received: Record<number, number>  // times each speaker was interrupted
} {
  const made: Record<number, number> = {}
  const received: Record<number, number> = {}
  const sorted = [...lines].sort((a, b) => a.startTime - b.startTime)
  let total = 0
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i]
    if (cur.speakerID !== prev.speakerID && cur.startTime - prev.startTime < gapThreshold) {
      made[cur.speakerID] = (made[cur.speakerID] ?? 0) + 1
      received[prev.speakerID] = (received[prev.speakerID] ?? 0) + 1
      total++
    }
  }
  return { total, made, received }
}

export function interruptionTip(made: number, total: number): string {
  if (total === 0) return 'Clean turn-taking — no interruptions detected. Everyone got space to finish.'
  if (made >= 3) return `You interrupted ${made} time${made !== 1 ? 's' : ''}. Letting others complete their thought builds trust and shows you’re listening.`
  if (made > 0) return `A couple of interruptions. Mostly fine, but watch for cutting people off when they pause to think.`
  return 'You were interrupted more than you interrupted — hold your ground and finish your points.'
}

const INTERROGATIVES = ['what','why','how','when','where','who','which','can ','could ','would ','should ','do you','are you','is it','did you']

/** Split text into sentences and classify each as a question or statement. */
export function questionStats(text: string): { questions: number; statements: number; ratio: number } {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 1)
  let questions = 0
  for (const s of sentences) {
    const lower = s.toLowerCase()
    if (s.includes('?') || INTERROGATIVES.some(w => lower.startsWith(w))) questions++
  }
  const statements = Math.max(0, sentences.length - questions)
  const total = questions + statements
  return { questions, statements, ratio: total > 0 ? questions / total : 0 }
}

export function questionTip(ratio: number, count: number, sessionType: string): string {
  const inquisitiveTypes = ['interview', 'negotiation', 'call']
  if (count === 0) return 'You asked no questions. Open-ended questions invite others in and surface what really matters to them.'
  if (ratio < 0.1) return `Only ${Math.round(ratio * 100)}% of what you said were questions. ${inquisitiveTypes.includes(sessionType) ? 'In this kind of conversation, asking more shows curiosity and builds rapport.' : 'A few more questions would draw others out.'}`
  if (ratio > 0.5) return 'Very question-heavy — great for discovery, but make sure you also share your own perspective.'
  return 'A healthy mix of asking and telling — you engage others while contributing your own views.'
}

export function fillerTip(perMinute: number, topWord: string): string {
  if (perMinute < 2) return 'Clean, fluent delivery — very few filler words. Keep it up.'
  if (perMinute < 5) return `A few fillers crept in${topWord ? ` ("${topWord}" most often)` : ''}. A short silent pause reads as more confident than "um".`
  return `Lots of fillers${topWord ? ` — especially "${topWord}"` : ''}. Try pausing silently instead; it signals control and gives you time to think.`
}

/** Dominance from talk-time, turns, and pitch authority. Confidence subtracts hedging. */
export function scoreSpeaker(s: SpeakerFeatures, all: SpeakerFeatures[]): { dominance: number; confidence: number } {
  if (!all.length) return { dominance: 0.5, confidence: 0.5 }
  const maxTalk = Math.max(...all.map(x => x.talkTimeRatio), 0.0001)
  const maxTurns = Math.max(...all.map(x => x.turnCount), 1)
  const maxPitch = Math.max(...all.map(x => x.avgPitch), 1)

  const talk = s.talkTimeRatio / maxTalk
  const turns = s.turnCount / maxTurns
  const pitchAuthority = 1 - (s.avgPitch / maxPitch) * 0.5 // lower pitch ~ more authority

  const dominance = Math.min(1, talk * 0.55 + turns * 0.25 + pitchAuthority * 0.20)
  const hedgePenalty = Math.min(s.hedgeCount * 0.02, 0.25)
  const confidence = Math.max(0, Math.min(1, dominance * 0.7 + (1 - s.pitchVariance / 80) * 0.3 - hedgePenalty))
  return { dominance, confidence }
}

/** Five dimensions (0..1) for the radar chart. */
export function radarDimensions(s: SpeakerFeatures): { label: string; value: number }[] {
  return [
    { label: 'Talk time', value: s.talkTimeRatio },
    { label: 'Dominance', value: s.dominanceScore },
    { label: 'Confidence', value: s.confidenceScore },
    { label: 'Engagement', value: Math.min(1, s.questionCount / Math.max(s.turnCount, 1) * 3) },
    { label: 'Directness', value: Math.max(0, 1 - s.hedgeCount / Math.max(s.turnCount, 1) / 2) },
  ]
}

/**
 * Prosodic entrainment / rapport. People in rapport converge on pitch, loudness
 * and expressiveness. We approximate it as how similar two speakers' prosodic
 * profiles are, blended with how balanced their airtime is (mutual engagement).
 * Returns an overall score plus per-pair scores.
 */
export function entrainmentStats(speakers: SpeakerFeatures[]): {
  score: number
  pairs: { a: number; b: number; score: number }[]
} {
  const pairs: { a: number; b: number; score: number }[] = []
  const PITCH_RANGE = 150, ENERGY_RANGE = 20 // normalisers (Hz, dB)

  for (let i = 0; i < speakers.length; i++) {
    for (let j = i + 1; j < speakers.length; j++) {
      const a = speakers[i], b = speakers[j]
      const dPitch = Math.min(1, Math.abs(a.avgPitch - b.avgPitch) / PITCH_RANGE)
      const dEnergy = Math.min(1, Math.abs(a.avgEnergyDB - b.avgEnergyDB) / ENERGY_RANGE)
      const dExpr = Math.abs(expressiveness(a) - expressiveness(b))
      const profileSim = 1 - (dPitch * 0.4 + dEnergy * 0.3 + dExpr * 0.3)
      // Airtime balance: closer to 50/50 → more mutual engagement
      const balance = 1 - Math.abs(a.talkTimeRatio - b.talkTimeRatio)
      const score = Math.max(0, Math.min(1, profileSim * 0.7 + balance * 0.3))
      pairs.push({ a: a.speakerID, b: b.speakerID, score })
    }
  }
  const score = pairs.length ? pairs.reduce((s, p) => s + p.score, 0) / pairs.length : 0
  return { score, pairs }
}

export function entrainmentTip(score: number): string {
  if (score > 0.75) return 'Strong vocal alignment — your speaking styles converged, a hallmark of genuine rapport.'
  if (score > 0.5) return 'Decent rapport. You were reasonably in sync; matching the other person’s energy a bit more deepens connection.'
  return 'Quite different speaking styles. Subtly mirroring the other person’s pace and energy can build rapport.'
}

export function generateReport(speakers: SpeakerFeatures[], userID = 0): CoachingReport {
  if (!speakers.length) return { headline: 'No speech detected', insight: 'Try again in a quieter environment.', tip: '', dominantSpeakerID: 0 }
  const sorted = [...speakers].sort((a, b) => b.talkTimeRatio - a.talkTimeRatio)
  const dominant = sorted[0]
  const user = speakers.find(s => s.speakerID === userID) ?? speakers[0]
  const pct = Math.round(user.talkTimeRatio * 100)
  const hedgeRate = user.turnCount > 0 ? user.hedgeCount / user.turnCount : 0

  let headline: string, insight: string, tip: string
  if (pct > 65) {
    headline = 'You dominated the conversation'
    insight = `You spoke ${pct}% of the time across ${user.turnCount} turns. In group settings, aim for more balanced airtime.`
    tip = 'After each point, ask an open-ended question to invite others in.'
  } else if (pct < 20 && speakers.length > 1) {
    headline = 'You were mostly listening'
    insight = `You spoke only ${pct}% of the time. Asserting yourself early anchors your credibility.`
    tip = 'Open with a direct statement in the first 60 seconds next time.'
  } else {
    headline = 'Balanced participation'
    insight = `You contributed ${pct}% of the airtime — a healthy share for ${speakers.length} speaker${speakers.length !== 1 ? 's' : ''}.`
    tip = hedgeRate > 2
      ? 'Cut hedge words ("I think", "maybe") — state opinions directly.'
      : 'Maintain this balance and focus on the quality of your contributions.'
  }
  return { headline, insight, tip, dominantSpeakerID: dominant.speakerID }
}
