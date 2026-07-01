import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as store from '../lib/store'
import { speakerColor } from '../lib/colors'
import { generateReport, countHedges, scoreSpeaker, pauseStats, type SpeakerFeatures } from '../lib/coaching'
import { transcribeViaBackend, ApiError, backendHealthy } from '../lib/api'
import { TypeIcon, WaveIcon, MusicIcon, UploadIcon } from '../components/Icons'

const SESSION_TYPES = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'interview', label: 'Interview' },
  { value: 'call', label: 'Call' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'other', label: 'Other' },
]

interface Line { id: string; speaker: number; text: string; time: number; end?: number; confidence?: number }

/** Pick a MediaRecorder mime type the current browser actually supports. */
function pickRecorderMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  if (typeof MediaRecorder === 'undefined') return ''
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

/** Autocorrelation pitch detector (returns Hz, or 0 if no clear pitch). */
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length
  let rms = 0
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / SIZE)
  if (rms < 0.01) return 0

  let bestOffset = -1, bestCorr = 0
  const minOffset = Math.floor(sampleRate / 350)
  const maxOffset = Math.floor(sampleRate / 75)
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
  const [mode, setMode] = useState<'live' | 'file'>('live')
  const [phase, setPhase] = useState<'setup' | 'recording' | 'transcribing' | 'done'>('setup')
  const [name, setName] = useState('Untitled session')
  const [type, setType] = useState('meeting')
  const [elapsed, setElapsed] = useState(0)
  const [rms, setRms] = useState(0)
  const [lines, setLines] = useState<Line[]>([])
  const [activeSpeaker, setActiveSpeaker] = useState(0)
  const [speakerCount, setSpeakerCount] = useState(2)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [modelReady, setModelReady] = useState(false)
  const [modelError, setModelError] = useState('')
  const [transcribeProgress, setTranscribeProgress] = useState('')
  const [transcribePct, setTranscribePct] = useState(0)

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
  const acousticRef = useRef<Record<number, { pitches: number[]; energies: number[] }>>({})
  const pausesRef = useRef<number[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  // Transcription runs on the backend now. Check it's reachable so we can gate
  // the upload button and show a clear message if the server is down.
  useEffect(() => {
    backendHealthy().then(ok => {
      setModelReady(ok)
      setModelError(ok ? '' : 'Backend not reachable. Start the server or set VITE_API_URL.')
    })
  }, [])

  // ── LIVE RECORDING ──────────────────────────────────────────────────────────

  async function startLive() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
    setPhase('recording')
    startRef.current = Date.now()
    recordingRef.current = true
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500)

    // Record the raw audio so we can run the real Whisper + voice-diarization
    // pipeline on Stop. The Web Speech captions below are just a live preview.
    chunksRef.current = []
    try {
      const mime = pickRecorderMime()
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(1000) // collect a chunk each second
      recorderRef.current = recorder
    } catch (err) {
      console.warn('MediaRecorder unavailable; will save live captions only:', err)
      recorderRef.current = null
    }

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    src.connect(analyser)
    const freqBuf = new Uint8Array(analyser.frequencyBinCount)
    const timeBuf = new Float32Array(analyser.fftSize)

    const MIN_PAUSE_MS = 500
    let silenceStart = 0
    let switched = false
    pollRef.current = setInterval(() => {
      analyser.getByteFrequencyData(freqBuf)
      analyser.getFloatTimeDomainData(timeBuf)
      const r = Math.sqrt(freqBuf.reduce((s, v) => s + v * v, 0) / freqBuf.length) / 128
      setRms(r)
      const now = Date.now()

      if (r < 0.05) {
        if (!silenceStart) { silenceStart = now; switched = false }
        else if (!switched && now - silenceStart > 800) {
          speakerRef.current = (speakerRef.current + 1) % Math.max(2, speakerCount)
          setActiveSpeaker(speakerRef.current)
          switched = true
        }
      } else {
        if (silenceStart) {
          const dur = now - silenceStart
          if (dur >= MIN_PAUSE_MS) pausesRef.current.push(dur / 1000)
          silenceStart = 0
        }
        const spk = speakerRef.current
        const acc = acousticRef.current[spk] ?? { pitches: [], energies: [] }
        const pitch = detectPitch(timeBuf, ctx.sampleRate)
        if (pitch > 0) acc.pitches.push(pitch)
        const energyDB = 20 * Math.log10(Math.max(r, 1e-4))
        acc.energies.push(energyDB)
        acousticRef.current[spk] = acc
      }
    }, 100)

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

      // The Web Speech API auto-stops after silence ("falls asleep"). Restart it
      // automatically while we're still recording so the live preview keeps going.
      rec.onend = () => {
        if (recordingRef.current) {
          try { rec.start() } catch { /* already starting; ignore */ }
        }
      }
      rec.onerror = () => { /* onend fires next and handles the restart */ }
      rec.start()
    }
  }

  async function stopLive() {
    recordingRef.current = false
    recognitionRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    if (pollRef.current) clearInterval(pollRef.current)

    // Finalize the recorded audio before tearing down the stream.
    const recorder = recorderRef.current
    let audioBlob: Blob | null = null
    if (recorder && recorder.state !== 'inactive') {
      audioBlob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
        recorder.stop()
      })
    }

    ctxRef.current?.close()
    streamRef.current?.getTracks().forEach(t => t.stop())

    // Preferred path: re-transcribe the recording with Whisper and separate
    // speakers by voice — robust to long pauses, and real diarization.
    if (audioBlob && audioBlob.size > 1000) {
      await runTranscription(audioBlob, 'No speech was detected in the recording.')
      return
    }

    // Fallback (no MediaRecorder / empty recording): keep the live captions.
    setPhase('done')
    await saveSession(linesRef.current, elapsed)
  }

  // ── BACKEND TRANSCRIPTION (upload → FastAPI → speaker-labelled JSON) ──────────

  /** Friendly, phase-aware label for the backend's progress messages. */
  function phaseLabel(message: string): string {
    const m = message.toLowerCase()
    if (m.includes('upload')) return 'Uploading audio…'
    if (m.includes('queue')) return 'Queued — waiting for the server…'
    if (m.includes('loading models') || m.includes('starting')) return 'Loading models (first run is slower)…'
    if (m.includes('transcrib')) return 'Transcribing speech…'
    if (m.includes('diariz')) return 'Identifying speakers…'
    if (m.includes('acoustic') || m.includes('analyz')) return 'Analyzing voice delivery…'
    if (m.includes('finish') || m.includes('done')) return 'Finishing up…'
    return message
  }

  /** Map a backend error code to a clear, actionable message. */
  function friendlyError(err: unknown): string {
    const code = err instanceof ApiError ? err.code : ''
    switch (code) {
      case 'backend_unavailable': return 'Can’t reach the server. Make sure the backend is running and VITE_API_URL is set.'
      case 'server_busy': return 'The server is processing another clip. Wait a few seconds and try again.'
      case 'missing_token': return 'Server is missing its HuggingFace token, so speaker detection is unavailable.'
      case 'diarizer_unavailable': return 'Speaker-detection model isn’t ready on the server (license/token). '
      case 'file_too_long': return err instanceof Error ? err.message : 'That clip is too long — try 30–90 seconds.'
      case 'file_too_large': return err instanceof Error ? err.message : 'That file is too large.'
      case 'unsupported_type': return err instanceof Error ? err.message : 'Unsupported audio format.'
      case 'decode_failed': return 'Could not read that audio file. Try a different recording.'
      default: return 'Error: ' + (err instanceof Error ? err.message : String(err))
    }
  }

  /** Upload → backend (WhisperX + pyannote + librosa) → save. */
  const runTranscription = useCallback(async (audio: Blob, _noSpeechHint: string) => {
    setPhase('transcribing')
    setTranscribePct(0)
    setTranscribeProgress('Uploading audio…')

    try {
      const result = await transcribeViaBackend(
        audio,
        speakerCount === 0 ? undefined : speakerCount,
        (fraction, message) => {
          setTranscribePct(Math.round(fraction * 100))
          setTranscribeProgress(phaseLabel(message))
        },
      )

      if (result.transcript.length === 0) {
        setTranscribeProgress('No speech was detected. Try a clearer recording.')
        return
      }

      // Backend speaker ids are 1-based; the UI is 0-based.
      const finalLines: Line[] = result.transcript.map((l, i) => ({
        id: `l${i}`,
        speaker: Math.max(0, l.speaker - 1),
        text: l.text,
        time: l.start,
        end: l.end,
        confidence: l.confidence,
      }))

      // Feed the backend's per-speaker pitch/energy into acousticRef in the
      // shape saveSession expects: two points whose mean = avg and population
      // stddev = variance, so the existing mean()/stddev() reproduce them exactly.
      const ac: Record<number, { pitches: number[]; energies: number[] }> = {}
      for (const s of result.speakers) {
        const id = Math.max(0, s.id - 1)
        ac[id] = {
          pitches: [s.avg_pitch - s.pitch_variance, s.avg_pitch + s.pitch_variance],
          energies: [s.avg_energy_db - s.energy_variance, s.avg_energy_db + s.energy_variance],
        }
      }
      acousticRef.current = ac

      linesRef.current = finalLines
      setLines(finalLines)

      const duration = Math.ceil(finalLines[finalLines.length - 1].end ?? finalLines[finalLines.length - 1].time)

      // Pauses from gaps between consecutive lines.
      const pauses: number[] = []
      for (let i = 1; i < finalLines.length; i++) {
        const prevEnd = finalLines[i - 1].end ?? finalLines[i - 1].time
        const gap = finalLines[i].time - prevEnd
        if (gap >= 0.5) pauses.push(gap)
      }

      setPhase('done')
      await saveSession(finalLines, duration, pauses)
    } catch (err) {
      console.error('Transcription failed:', err)
      setTranscribeProgress(friendlyError(err))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakerCount, name, type])

  // ── FILE UPLOAD ─────────────────────────────────────────────────────────────

  const startFile = useCallback(async () => {
    if (!selectedFile || !modelReady) return
    await runTranscription(
      selectedFile,
      'No speech was detected in this file. Try a clearer recording or a different file.',
    )
  }, [selectedFile, modelReady, runTranscription])

  // ── SHARED SAVE ─────────────────────────────────────────────────────────────

  async function saveSession(finalLines: Line[], durationSec: number, overridePauses?: number[]) {
    const user = await store.getUser()

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

    for (const s of speakers) {
      const { dominance, confidence } = scoreSpeaker(s, speakers)
      s.dominanceScore = dominance
      s.confidenceScore = confidence
    }

    const report = generateReport(speakers, 0)
    const pauses = pauseStats(overridePauses ?? pausesRef.current, durationSec)
    const session = {
      id: crypto.randomUUID(),
      user_id: user.id,
      name,
      session_type: type,
      duration_seconds: durationSec,
      speaker_count: speakerIDs.length || 1,
      transcript: finalLines.map(l => ({
        id: l.id, speakerID: l.speaker, text: l.text,
        startTime: l.time, endTime: l.end ?? l.time + 2,
        confidence: l.confidence,
      })),
      speakers,
      report,
      pauses,
      created_at: new Date().toISOString(),
    }
    await store.saveSession(session)
    navigate(`/session/${session.id}`)
  }

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  function fmt(s: number) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }

  // ── DONE/SAVING SPLASH ──────────────────────────────────────────────────────

  if (phase === 'done') return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: 'var(--accent)', marginBottom: 16, display: 'flex', justifyContent: 'center' }}><WaveIcon size={46} /></div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Saving session…</h2>
      </div>
    </div>
  )

  // ── TRANSCRIBING SPLASH ─────────────────────────────────────────────────────

  if (phase === 'transcribing') return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ color: 'var(--accent)', marginBottom: 20, display: 'flex', justifyContent: 'center' }}><WaveIcon size={46} /></div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Transcribing audio</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>{transcribeProgress}</p>
        {transcribePct > 0 && (
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', marginBottom: 16 }}>{transcribePct}%</div>
        )}
        <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
          {transcribePct > 0 ? (
            <div style={{ height: '100%', width: `${transcribePct}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.4s ease' }} />
          ) : (
            <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 3, animation: 'indeterminate 1.5s ease-in-out infinite' }} />
          )}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>
          Whisper runs entirely in your browser — no audio is uploaded anywhere.
          Longer files take longer; please keep this tab open.
        </p>
      </div>
      <style>{`@keyframes indeterminate{0%{width:0%;margin-left:0}50%{width:60%;margin-left:20%}100%{width:0%;margin-left:100%}}`}</style>
    </div>
  )

  // ── LIVE RECORDING VIEW ─────────────────────────────────────────────────────

  if (phase === 'recording') return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, background: 'var(--nav-bg)',
        backdropFilter: 'blur(18px)', zIndex: 50,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--red)', animation: 'pulse 1.4s infinite' }} />
        <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{name}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{fmt(elapsed)}</span>
        <button onClick={stopLive} style={{
          padding: '9px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
          background: 'var(--red)', color: '#fff', border: 'none',
        }}>Stop</button>
      </div>

      <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 5, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(rms * 100, 100)}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.08s' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: speakerColor(activeSpeaker) }} />
          Speaker {activeSpeaker + 1} · {Math.max(speakerCount, activeSpeaker + 1)} total
        </div>
      </div>

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

  // ── SETUP VIEW ──────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <button onClick={() => navigate('/dashboard')} style={{
          background: 'none', border: 'none', color: 'var(--muted)', fontSize: 14, marginBottom: 20,
        }}>← Back</button>

        <div className="frost" style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)',
          padding: 'clamp(22px, 4vw, 34px)',
        }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 24, letterSpacing: '-0.03em' }}>New session</h1>

        {/* Mode toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: 12, padding: 4, marginBottom: 12, border: '1.5px solid var(--border)' }}>
          {(['live', 'file'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 14, fontWeight: 700,
              background: mode === m ? 'var(--accent)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--muted)', border: 'none',
              transition: 'all 0.15s',
            }}>
              {m === 'live' ? 'Live mic' : 'Upload'}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.5 }}>
          {mode === 'live'
            ? 'Transcribe a conversation happening in front of your mic.'
            : 'Transcribe an audio file you already have.'}
        </p>

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
            {[0, 1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => setSpeakerCount(n)} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 700,
                border: `1.5px solid ${speakerCount === n ? 'var(--accent)' : 'var(--border)'}`,
                background: speakerCount === n ? 'var(--accent-dim)' : 'var(--bg-input)',
                color: speakerCount === n ? 'var(--accent)' : 'var(--muted)',
              }}>{n === 0 ? 'Auto' : n}</button>
            ))}
          </div>
          {mode === 'file' && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
              {speakerCount === 0
                ? 'Auto: detects how many people are talking from their voices, and adds a new speaker when a new voice joins.'
                : `Forces exactly ${speakerCount} speaker${speakerCount > 1 ? 's' : ''} — picks the closest ${speakerCount} voice groups. Use Auto if unsure.`}
            </p>
          )}
        </div>

        <div style={{ marginBottom: 28 }}>
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
                <TypeIcon type={t.value} size={22} />{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Backend status — shown for file mode */}
        {mode === 'file' && (
          <div style={{ marginBottom: 16 }}>
            {!modelReady && !modelError && (
              <div style={{ marginBottom: 8, padding: '10px 14px', background: 'var(--accent-dim)', borderRadius: 10, border: '1px solid var(--accent)', fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                Checking server…
              </div>
            )}
            {modelError && (
              <div style={{ marginBottom: 8, padding: '10px 14px', background: 'rgba(229,85,85,0.1)', borderRadius: 10, border: '1px solid var(--red)', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
                {modelError}
              </div>
            )}
            {modelReady && (
              <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                ✓ Server ready · for best results upload a 30–90s clip
              </div>
            )}
          </div>
        )}

        {/* FILE UPLOAD SECTION */}
        {mode === 'file' && (
          <div style={{ marginBottom: 24 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 10, letterSpacing: '0.06em' }}>AUDIO FILE</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.mp4,.m4a,.wav,.ogg,.webm,.aac,.flac"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0] ?? null
                setSelectedFile(f)
                if (f && !name.startsWith('Untitled')) return
                if (f) setName(f.name.replace(/\.[^.]+$/, ''))
              }}
            />
            <button onClick={() => fileInputRef.current?.click()} style={{
              width: '100%', padding: '20px 16px', borderRadius: 12, border: `2px dashed ${selectedFile ? 'var(--accent)' : 'var(--border)'}`,
              background: selectedFile ? 'var(--accent-dim)' : 'var(--bg-input)', color: selectedFile ? 'var(--accent)' : 'var(--muted)',
              fontSize: 14, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <span style={{ display: 'flex' }}>{selectedFile ? <MusicIcon size={26} /> : <UploadIcon size={26} />}</span>
              {selectedFile ? selectedFile.name : 'Click to choose an audio file'}
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                {selectedFile
                  ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`
                  : 'MP3, M4A, WAV, OGG, AAC, FLAC…'}
              </span>
            </button>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
              Whisper runs entirely in your browser. Audio is never uploaded to any server.
            </p>
          </div>
        )}

        {/* CTA button */}
        {mode === 'live' ? (
          <button onClick={startLive} style={{
            width: '100%', padding: 15, borderRadius: 12, fontSize: 16, fontWeight: 700,
            background: 'var(--accent)', color: '#fff', border: 'none',
          }}>Start recording</button>
        ) : (
          <button
            onClick={startFile}
            disabled={!selectedFile || !modelReady}
            style={{
              width: '100%', padding: 15, borderRadius: 12, fontSize: 16, fontWeight: 700,
              background: 'var(--accent)', color: '#fff', border: 'none',
              opacity: (!selectedFile || !modelReady) ? 0.45 : 1,
            }}
          >
            {!modelReady ? 'Waiting for server…' : !selectedFile ? 'Choose a file first' : 'Transcribe file'}
          </button>
        )}
        </div>
      </div>
    </div>
  )
}
