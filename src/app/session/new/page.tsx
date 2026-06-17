'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { OnlineSpeakerClusterer, extractEmbedding } from '@/lib/diarization'
import { generateReport, scoreDominance, countHedges } from '@/lib/coaching'
import { saveSesssion } from '@/lib/db'
import { speakerColor } from '@/lib/colors'
import { TranscriptLine, SpeakerFeatures, SessionType } from '@/types'

const SESSION_TYPES: { value: SessionType; label: string; icon: string }[] = [
  { value: 'meeting', label: 'Meeting', icon: '👥' },
  { value: 'interview', label: 'Interview', icon: '🎯' },
  { value: 'call', label: 'Call', icon: '📞' },
  { value: 'podcast', label: 'Podcast', icon: '🎙️' },
  { value: 'negotiation', label: 'Negotiation', icon: '⚖️' },
  { value: 'other', label: 'Other', icon: '💬' },
]

const SAMPLE_RATE = 16000
const SEGMENT_MS = 2000    // send 2-second chunks for diarization
const MIN_SPEECH_ENERGY = 0.003

interface LiveLine {
  id: string
  speakerID: number
  text: string
  partial: boolean
  startTime: number
}

export default function NewSessionPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionName, setSessionName] = useState('Untitled session')
  const [sessionType, setSessionType] = useState<SessionType>('meeting')
  const [phase, setPhase] = useState<'setup' | 'recording' | 'processing'>('setup')
  const [elapsed, setElapsed] = useState(0)
  const [lines, setLines] = useState<LiveLine[]>([])
  const [modelStatus, setModelStatus] = useState('Loading Whisper model…')
  const [rms, setRms] = useState(0)
  const [activeSpeaker, setActiveSpeaker] = useState<number | null>(null)
  const [speakerCount, setSpeakerCount] = useState(0)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const clustererRef = useRef<OnlineSpeakerClusterer | null>(null)
  const lineCounterRef = useRef(0)
  const segBufferRef = useRef<Float32Array[]>([])
  const segStartTimeRef = useRef(0)
  const startTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const whisperRef = useRef<Worker | null>(null)
  const pendingSegRef = useRef<Map<string, { speakerID: number; startTime: number }>>(new Map())
  const transcriptRef = useRef<LiveLine[]>([])
  const linesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
    })
  }, [router])

  // Lazy-load Whisper worker
  useEffect(() => {
    const worker = new Worker(new URL('@/workers/whisper.worker.ts', import.meta.url))
    worker.onmessage = (e) => {
      const { type, text, segId } = e.data
      if (type === 'ready') setModelStatus('')
      if (type === 'partial') updateLine(segId, text, true)
      if (type === 'final') updateLine(segId, text, false)
    }
    worker.postMessage({ type: 'load' })
    whisperRef.current = worker
    return () => worker.terminate()
  }, [])

  function updateLine(segId: string, text: string, partial: boolean) {
    const meta = pendingSegRef.current.get(segId)
    if (!meta) return
    setLines(prev => {
      const existing = prev.findIndex(l => l.id === segId)
      const trimmed = text.trim()
      if (!trimmed) return prev
      const line: LiveLine = { id: segId, speakerID: meta.speakerID, text: trimmed, partial, startTime: meta.startTime }
      if (existing !== -1) {
        const next = [...prev]; next[existing] = line; return next
      }
      const next = [...prev, line]
      transcriptRef.current = next
      return next
    })
    if (!partial) pendingSegRef.current.delete(segId)
  }

  useEffect(() => {
    linesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const handleSegment = useCallback((samples: Float32Array, startTime: number) => {
    if (!clustererRef.current || !whisperRef.current) return
    const energy = samples.reduce((s, x) => s + x * x, 0) / samples.length
    if (energy < MIN_SPEECH_ENERGY) return

    const embedding = extractEmbedding(samples)
    const speakerID = clustererRef.current.assign(embedding)
    setActiveSpeaker(speakerID)
    setSpeakerCount(clustererRef.current.speakerCount())

    const segId = `seg-${lineCounterRef.current++}`
    pendingSegRef.current.set(segId, { speakerID, startTime })
    whisperRef.current.postMessage({ type: 'transcribe', audio: samples, segId }, [samples.buffer])
  }, [])

  async function startRecording() {
    setPhase('recording')
    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000)
    clustererRef.current = new OnlineSpeakerClusterer(
      ['podcast', 'meeting'].includes(sessionType) ? 0.65 : 0.75
    )

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: SAMPLE_RATE, channelCount: 1 } })
    streamRef.current = stream

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    audioCtxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    let segBuffer: Float32Array[] = []
    let segStart = Date.now()

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      const copy = new Float32Array(input)
      segBuffer.push(copy)

      // RMS for visualiser
      const r = Math.sqrt(copy.reduce((s, x) => s + x * x, 0) / copy.length)
      setRms(Math.min(r * 20, 1))

      if (Date.now() - segStart >= SEGMENT_MS) {
        const totalLen = segBuffer.reduce((s, b) => s + b.length, 0)
        const merged = new Float32Array(totalLen)
        let offset = 0
        for (const b of segBuffer) { merged.set(b, offset); offset += b.length }
        handleSegment(merged, (segStart - startTimeRef.current) / 1000)
        segBuffer = []
        segStart = Date.now()
      }
    }

    source.connect(processor)
    processor.connect(ctx.destination)
  }

  async function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    processorRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
    setPhase('processing')
    await buildAndSave()
  }

  async function buildAndSave() {
    if (!userId) return
    const finalLines = transcriptRef.current.filter(l => !l.partial)
    const speakerIDs = [...new Set(finalLines.map(l => l.speakerID))]

    const speakers: SpeakerFeatures[] = speakerIDs.map(id => {
      const myLines = finalLines.filter(l => l.speakerID === id)
      const totalWords = myLines.reduce((s, l) => s + l.text.split(' ').length, 0)
      const allWords = finalLines.reduce((s, l) => s + l.text.split(' ').length, 0)
      const hedges = myLines.reduce((s, l) => s + countHedges(l.text), 0)
      const qs = myLines.filter(l => l.text.includes('?')).length
      return {
        speakerID: id,
        talkTimeRatio: allWords > 0 ? totalWords / allWords : 0,
        turnCount: myLines.length,
        avgPitch: 150 + id * 30,
        avgEnergyDB: -20,
        hedgeCount: hedges,
        questionCount: qs,
        dominanceScore: 0,
        confidenceScore: 0,
      }
    })

    for (let i = 0; i < speakers.length; i++) {
      const { dominance, confidence } = scoreDominance(speakers[i], speakers)
      speakers[i].dominanceScore = dominance
      speakers[i].confidenceScore = confidence
    }

    const report = generateReport(speakers, 0)
    const session = {
      id: crypto.randomUUID(),
      name: sessionName,
      sessionType,
      createdAt: new Date().toISOString(),
      durationSeconds: elapsed,
      speakerCount: speakerIDs.length,
      transcript: finalLines.map(l => ({
        id: l.id, speakerID: l.speakerID, text: l.text,
        startTime: l.startTime, endTime: l.startTime + 2,
      })),
      speakers,
      report,
    }

    await saveSesssion(session, userId)
    router.push(`/session/${session.id}`)
  }

  function formatElapsed(s: number) {
    const m = Math.floor(s / 60), sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  if (phase === 'processing') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>⚙️</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Processing session…</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Building your coaching report</p>
        </div>
      </div>
    )
  }

  if (phase === 'setup') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <button onClick={() => router.push('/dashboard')} style={{
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: 14, marginBottom: 32, padding: 0,
          }}>← Back</button>

          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.03em' }}>New session</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: 15 }}>
            {modelStatus || 'Ready to record'}
          </p>

          {/* Session name */}
          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              SESSION NAME
            </span>
            <input
              value={sessionName} onChange={e => setSessionName(e.target.value)}
              style={{
                width: '100%', background: 'var(--bg-input)', border: '1.5px solid var(--border)',
                borderRadius: 10, padding: '12px 16px', fontSize: 16,
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
          </label>

          {/* Session type */}
          <div style={{ marginBottom: 36 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 10 }}>
              SESSION TYPE
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {SESSION_TYPES.map(t => (
                <button key={t.value} onClick={() => setSessionType(t.value)} style={{
                  padding: '12px 8px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  border: `1.5px solid ${sessionType === t.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: sessionType === t.value ? 'var(--accent-dim)' : 'var(--bg-input)',
                  color: sessionType === t.value ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ fontSize: 22 }}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startRecording}
            disabled={!!modelStatus}
            style={{
              width: '100%', padding: '15px', borderRadius: 12, fontSize: 16, fontWeight: 700,
              background: modelStatus ? 'var(--border)' : 'var(--accent)', color: '#fff',
              border: 'none', cursor: modelStatus ? 'not-allowed' : 'pointer',
              opacity: modelStatus ? 0.6 : 1,
            }}>
            {modelStatus ? 'Loading AI model…' : '🎙️  Start recording'}
          </button>
        </div>
      </div>
    )
  }

  // Recording phase
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--recording)', animation: 'pulse 1.5s infinite' }} />
        <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{sessionName}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
          {formatElapsed(elapsed)}
        </span>
        <button onClick={stopRecording} style={{
          padding: '9px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
          background: 'var(--recording)', color: '#fff', border: 'none', cursor: 'pointer',
        }}>
          Stop
        </button>
      </div>

      {/* RMS visualiser */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 6, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${rms * 100}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.05s' }} />
        </div>
        {activeSpeaker !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: speakerColor(activeSpeaker) }} />
            Speaker {activeSpeaker + 1}
          </div>
        )}
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{speakerCount} speaker{speakerCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Live transcript */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', maxWidth: 780, width: '100%', margin: '0 auto' }}>
        {lines.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: 80, fontSize: 15 }}>
            Listening… speak now
          </div>
        ) : (
          lines.map(line => (
            <div key={line.id} style={{ display: 'flex', gap: 14, marginBottom: 18, opacity: line.partial ? 0.6 : 1 }}>
              <div style={{ paddingTop: 3, flexShrink: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: speakerColor(line.speakerID) }} />
              </div>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: speakerColor(line.speakerID), display: 'block', marginBottom: 3 }}>
                  Speaker {line.speakerID + 1}
                </span>
                <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--text-primary)' }}>{line.text}</p>
              </div>
            </div>
          ))
        )}
        <div ref={linesEndRef} />
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
