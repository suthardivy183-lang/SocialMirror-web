export interface TranscriptLine {
  id: string
  speakerID: number
  text: string
  startTime: number
  endTime: number
}

export interface SpeakerFeatures {
  speakerID: number
  talkTimeRatio: number
  turnCount: number
  avgPitch: number
  avgEnergyDB: number
  hedgeCount: number
  questionCount: number
  dominanceScore: number
  confidenceScore: number
}

export interface CoachingReport {
  headline: string
  insight: string
  actionableTip: string
  dominantSpeakerID: number
}

export interface Session {
  id: string
  name: string
  sessionType: SessionType
  createdAt: string
  durationSeconds: number
  speakerCount: number
  transcript: TranscriptLine[]
  speakers: SpeakerFeatures[]
  report: CoachingReport | null
}

export type SessionType =
  | 'interview'
  | 'meeting'
  | 'negotiation'
  | 'call'
  | 'podcast'
  | 'other'

export interface DiarizedSegment {
  id: string
  speakerID: number
  startTime: number
  endTime: number
  samples: Float32Array
}
