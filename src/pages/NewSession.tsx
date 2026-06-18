import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as store from '../lib/store'
import { speakerColor } from '../lib/colors'
import { generateReport, countHedges, scoreSpeaker, pauseStats, type SpeakerFeatures } from '../lib/coaching'

const SESSION_TYPES = [
  { value: 'meeting', label: 'Meeting', icon: '👥' },
  { value: 'interview', label: 'Interview', icon: '🎯' },
  { value: 'call', label: 'Call', icon: '📞' },
  { value: 'podcast', label: 'Podcast', icon: '🎙️' },
  { value: 'negotiation', label: 'Negotiation', icon: '⚖️' },
  { value: 'other', label: 'Other', icon: '💬' },
]

interface Line { id: string; speaker: number; text: string; time: number }

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

/** Autocorrelation pitch detector (returns Hz, or 0 if no clear pitch). */
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length
  let rms = 0
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / SIZE)
  if (rms < 0.01) return 0 // too quiet

  let bestOffset = -1, bestCorr = 0
  const minOffset = Math.floor(sampleRate / 350) // ~350 Hz max
  const maxOffset = Math.floor(sampleRate / 75)  // ~75 Hz min
  for (let offset = minOffset; offset <= maxOffset; offset++) {
    let corr = 0
    for (let i = 0; i < SIZE - offset; i++) corr += buf[i] * buf[i + offset]
    corr /= SIZE - offset
    if (corr > bestCorr) { bestCorr = corr; bestOffset = offset }
  }
  if (bestOffset <= 0 || bestCorr < 0.01) return 0
  return sampleRate / bestOffset
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
const stddev = (a: number[]) => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length)
}


export default function NewSession() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<'setup' | 'recording' | 'done'>('setup')
  const [name, setName] = useState('Untitled session')
  const [type, setType] = useState('meeting')
  const [elapsed, setElapsed] = useState(0)
  const [rms, setRms] = useState(0)
  const [lines, setLines] = useState<Line[]>([])
  const [activeSpeaker, setActiveSpeaker] = useState(0)
  const [speakerCount, setSpeakerCount] = useState(1)

  const ctxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const linesRef = useRef<Line[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const speakerRef = useRef(0)
  const lineIdRef = useRef(0)
  // Acoustic accumulators per speaker: pitch samples + energy samples
  const acousticRef = useRef<Record<number, { pitches: number[]; energies: number[] }>>({})
  // Completed pause durations (seconds) for silence/pause analysis
  const pausesRef = useRef<number[]>([])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
    setPhase('recording')
    startRef.current = Date.now()
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500)

    // Audio analyser for RMS visualiser + pitch detection
    const ctx = new AudioContext()
    ctxRef.current = ctx
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    src.connect(analyser)
    const freqBuf = new Uint8Array(analyser.frequencyBinCount)
    const timeBuf = new Float32Array(analyser.fftSize)

    const MIN_PAUSE_MS = 500       // gaps longer than this count as a pause
    let silenceStart = 0           // when the current silent stretch began
    let switched = false           // speaker already toggled for this stretch
    pollRef.current = setInterval(() => {
      analyser.getByteFrequencyData(freqBuf)
      analyser.getFloatTimeDomainData(timeBuf)
      const r = Math.sqrt(freqBuf.reduce((s, v) => s + v * v, 0) / freqBuf.length) / 128
      setRms(r)
      const now = Date.now()

      if (r < 0.05) {
        // In silence
        if (!silenceStart) { silenceStart = now; switched = false }
        else if (!switched && now - silenceStart > 800) {
          speakerRef.current = (speakerRef.current + 1) % Math.max(2, speakerCount)
          setActiveSpeaker(speakerRef.current)
          switched = true
        }
      } else {
        // Speech resumed — close out any pause that just ended
        if (silenceStart) {
          const dur = now - silenceStart
          if (dur >= MIN_PAUSE_MS) pausesRef.current.push(dur / 1000)
          silenceStart = 0
        }
        // Accumulate acoustic features for the active speaker while they talk
        const spk = speakerRef.current
        const acc = acousticRef.current[spk] ?? { pitches: [], energies: [] }
        const pitch = detectPitch(timeBuf, ctx.sampleRate)
        if (pitch > 0) acc.pitches.push(pitch)
        const energyDB = 20 * Math.log10(Math.max(r, 1e-4))
        acc.energies.push(energyDB)
        acousticRef.current[spk] = acc
      }
    }, 100)

    // Web Speech API for transcription
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      const rec = new SR()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'
      recognitionRef.current = rec

      rec.onresult = (e) => {
        const result = e.results[e.results.length - 1]
        const text = result[0].transcript.trim()
        if (!text) return
        const id = `l${lineIdRef.current}`
        const spk = speakerRef.current
        const t = (Date.now() - startRef.current) / 1000

        if (result.isFinal) {
          lineIdRef.current++
          const line: Line = { id, speaker: spk, text, time: t }
          linesRef.current = [...linesRef.current, line]
          setLines([...linesRef.current])
          setSpeakerCount(prev => Math.max(prev, spk + 1))
        } else {
          setLines([...linesRef.current, { id: 'partial', speaker: spk, text, time: t }])
        }
      }
      rec.start()
    }
  }

  async function stop() {
    recognitionRef.current?.stop()
    ctxRef.current?.close()
    if (timerRef.current) clearInterval(timerRef.current)
    if (pollRef.current) clearInterval(pollRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    setPhase('done')

    const user = await store.getUser()
    if (!user) { navigate('/auth'); return }

    const finalLines = linesRef.current
    const speakerIDs = [...new Set(finalLines.map(l => l.speaker))]
    const allWords = finalLines.reduce((s, l) => s + l.text.split(' ').length, 0)

    const speakers: SpeakerFeatures[] = speakerIDs.map(id => {
      const myLines = finalLines.filter(l => l.speaker === id)
      const words = myLines.reduce((s, l) => s + l.text.split(' ').length, 0)
      const ac = acousticRef.current[id] ?? { pitches: [], energies: [] }
      return {
        speakerID: id,
        talkTimeRatio: allWords > 0 ? words / allWords : 0,
        turnCount: myLines.length,
        hedgeCount: myLines.reduce((s, l) => s + countHedges(l.text), 0),
        questionCount: myLines.filter(l => l.text.includes('?')).length,
        avgPitch: Math.round(mean(ac.pitches)) || 150,
        pitchVariance: Math.round(stddev(ac.pitches)),
        avgEnergyDB: Math.round(mean(ac.energies)) || -30,
        energyVariance: +stddev(ac.energies).toFixed(1),
        dominanceScore: 0,
        confidenceScore: 0,
      }
    })

    // Dominance + confidence scoring (needs the full set)
    for (const s of speakers) {
      const { dominance, confidence } = scoreSpeaker(s, speakers)
      s.dominanceScore = dominance
      s.confidenceScore = confidence
    }

    const report = generateReport(speakers, 0)
    const pauses = pauseStats(pausesRef.current, elapsed)
    const session = {
      id: crypto.randomUUID(),
      user_id: user.id,
      name,
      session_type: type,
      duration_seconds: elapsed,
      speaker_count: speakerIDs.length || 1,
      transcript: finalLines.map(l => ({ id: l.id, speakerID: l.speaker, text: l.text, startTime: l.time, endTime: l.time + 2 })),
      speakers,
      report,
      pauses,
      created_at: new Date().toISOString(),
    }
    await store.saveSession(session)
    navigate(`/session/${session.id}`)
  }

  function fmt(s: number) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }

  if (phase === 'done') return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Saving session…</h2>
      </div>
    </div>
  )

  if (phase === 'setup') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <button onClick={() => navigate('/dashboard')} style={{
          background: 'none', border: 'none', color: 'var(--muted)', fontSize: 14, marginBottom: 32,
        }}>← Back</button>

        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.03em' }}>New session</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 32, fontSize: 14 }}>Uses your browser's built-in speech recognition.</p>

        <label style={{ display: 'block', marginBottom: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 8, letterSpacing: '0.06em' }}>SESSION NAME</span>
          <input value={name} onChange={e => setName(e.target.value)} style={{
            width: '100%', background: 'var(--bg-input)', border: '1.5px solid var(--border)',
            borderRadius: 10, padding: '12px 16px', fontSize: 16, color: 'var(--text)', outline: 'none',
          }} />
        </label>

        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 10, letterSpacing: '0.06em' }}>SPEAKERS</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1,2,3,4].map(n => (
              <button key={n} onClick={() => setSpeakerCount(n)} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 700,
                border: `1.5px solid ${speakerCount === n ? 'var(--accent)' : 'var(--border)'}`,
                background: speakerCount === n ? 'var(--accent-dim)' : 'var(--bg-input)',
                color: speakerCount === n ? 'var(--accent)' : 'var(--muted)',
              }}>{n}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 36 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 10, letterSpacing: '0.06em' }}>SESSION TYPE</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {SESSION_TYPES.map(t => (
              <button key={t.value} onClick={() => setType(t.value)} style={{
                padding: '12px 8px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${type === t.value ? 'var(--accent)' : 'var(--border)'}`,
                background: type === t.value ? 'var(--accent-dim)' : 'var(--bg-input)',
                color: type === t.value ? 'var(--accent)' : 'var(--muted)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 22 }}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={start} style={{
          width: '100%', padding: 15, borderRadius: 12, fontSize: 16, fontWeight: 700,
          background: 'var(--accent)', color: '#fff', border: 'none',
        }}>🎙️ Start recording</button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, background: 'var(--nav-bg)',
        backdropFilter: 'blur(18px)', zIndex: 50,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--red)', animation: 'pulse 1.4s infinite' }} />
        <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{name}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{fmt(elapsed)}</span>
        <button onClick={stop} style={{
          padding: '9px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
          background: 'var(--red)', color: '#fff', border: 'none',
        }}>Stop</button>
      </div>

      {/* RMS bar + speaker */}
      <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 5, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(rms * 100, 100)}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.08s' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: speakerColor(activeSpeaker) }} />
          Speaker {activeSpeaker + 1} · {speakerCount} total
        </div>
      </div>

      {/* Live transcript */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', maxWidth: 780, width: '100%', margin: '0 auto' }}>
        {lines.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 80, fontSize: 15 }}>
            Listening… speak now
          </div>
        ) : lines.map((line, i) => (
          <div key={line.id + i} style={{ display: 'flex', gap: 14, marginBottom: 18, opacity: line.id === 'partial' ? 0.55 : 1 }}>
            <div style={{ paddingTop: 3, flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: speakerColor(line.speaker) }} />
            </div>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: speakerColor(line.speaker), display: 'block', marginBottom: 3 }}>
                Speaker {line.speaker + 1}
              </span>
              <p style={{ fontSize: 15, lineHeight: 1.65 }}>{line.text}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}`}</style>
    </div>
  )
}
