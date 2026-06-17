import { SpeakerFeatures, CoachingReport } from '@/types'

const HEDGE_WORDS = [
  'maybe', 'perhaps', 'sort of', 'kind of', 'i think', 'i guess',
  'probably', 'possibly', 'might', 'could', 'would', 'like,', 'you know',
  'basically', 'actually', 'literally', 'just', 'um', 'uh', 'er',
]

export function countHedges(text: string): number {
  const lower = text.toLowerCase()
  return HEDGE_WORDS.reduce((n, w) => n + (lower.split(w).length - 1), 0)
}

export function generateReport(
  speakers: SpeakerFeatures[],
  userSpeakerID = 0
): CoachingReport {
  if (speakers.length === 0) {
    return {
      headline: 'No speech detected',
      insight: 'No speakers were identified in this session.',
      actionableTip: 'Try recording in a quieter environment.',
      dominantSpeakerID: 0,
    }
  }

  const sorted = [...speakers].sort((a, b) => b.talkTimeRatio - a.talkTimeRatio)
  const dominant = sorted[0]
  const user = speakers.find(s => s.speakerID === userSpeakerID) ?? speakers[0]

  const talkPct = Math.round(user.talkTimeRatio * 100)
  const hedgeRate = user.turnCount > 0 ? user.hedgeCount / user.turnCount : 0

  let headline: string
  let insight: string
  let actionableTip: string

  if (talkPct > 65) {
    headline = 'You dominated the conversation'
    insight = `You spoke ${talkPct}% of the time with ${user.turnCount} turns. In multi-party conversations, aim for balanced airtime.`
    actionableTip = 'Try asking one open-ended question after each point you make to invite others in.'
  } else if (talkPct < 20 && speakers.length > 1) {
    headline = 'You were mostly listening'
    insight = `You spoke only ${talkPct}% of the time. Asserting yourself early in a conversation anchors your credibility.`
    actionableTip = 'Open with a clear, direct statement in the first 60 seconds of your next conversation.'
  } else {
    headline = 'Balanced participation'
    insight = `You contributed ${talkPct}% of the airtime — a healthy share for a ${speakers.length}-speaker conversation.`
    actionableTip = hedgeRate > 2
      ? 'Watch your hedge words ("I think", "maybe", "sort of") — they soften your impact. State your opinions directly.'
      : 'Maintain this balance and focus on the quality of your turns rather than quantity.'
  }

  return {
    headline,
    insight,
    actionableTip,
    dominantSpeakerID: dominant.speakerID,
  }
}

export function scoreDominance(
  speaker: SpeakerFeatures,
  allSpeakers: SpeakerFeatures[]
): { dominance: number; confidence: number } {
  if (allSpeakers.length === 0) return { dominance: 0.5, confidence: 0.5 }

  const maxTalk = Math.max(...allSpeakers.map(s => s.talkTimeRatio))
  const maxTurns = Math.max(...allSpeakers.map(s => s.turnCount))
  const maxPitch = Math.max(...allSpeakers.map(s => s.avgPitch))

  const talkScore = maxTalk > 0 ? speaker.talkTimeRatio / maxTalk : 0
  const turnScore = maxTurns > 0 ? speaker.turnCount / maxTurns : 0
  const pitchScore = maxPitch > 0 ? 1 - speaker.avgPitch / maxPitch : 0.5

  const dominance = talkScore * 0.5 + turnScore * 0.3 + pitchScore * 0.2
  const hedgePenalty = Math.min(speaker.hedgeCount * 0.02, 0.2)
  const confidence = Math.max(0, Math.min(1, dominance - hedgePenalty))

  return { dominance, confidence }
}
