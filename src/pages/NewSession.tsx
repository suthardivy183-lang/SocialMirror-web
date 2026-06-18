import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as store from '../lib/store'
import { speakerColor } from '../lib/colors'
import { generateReport, countHedges, scoreSpeaker, pauseStats, type SpeakerFeatures } from '../lib/coaching'
import { loadWhisper, transcribeFile, type Segment } from '../lib/whisper'

const SESSION_TYPES = [
  { value: 'meeting', label: 'Meeting', icon: '👥' },
  { value: 'interview', label: 'Interview', icon: '🎯' },
  { value: 'call', label: 'Call', icon: '📞' },
  { value: 'podcast', label: 'Podcast', icon: '🎙️' },
  { value: 'negotiation', label: 'Negotiation', icon: '⚖️' },
  { value: 'other', label: 'Other', icon: '💬' },
]

interface Line { id: string; speaker: number; text: string; time: number }

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

/**
 * Naively assign speakers to transcript segments by detecting long pauses.
 * Gaps > SWITCH_GAP seconds trigger a speaker change (round-robin).
 */
function assignSpeakers(segments: Segment[], totalSpeakers: number): Line[] {
  const SWITCH_GAP = 1.5 // seconds of silence triggers speaker change
  let speaker = 0
  const lines: Line[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (!seg.text) continue
    if (i > 0) {
      const gap = seg.start - segments[i - 1].end
      if (gap >= SWITCH_GAP) speaker = (speaker + 1) % Math.max(2, totalSpeakers)
    }
    lines.push({ id: `l${i}`, speaker, text: seg.text, time: seg.start })
  }
  return lines
}

export default function NewSession() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'live' | 'device' | 'file'>('live')
  const [phase, setPhase] = useState<'setup' | 'recording' | 'capturing' | 'transcribing' | 'done'>('setup')
  const [name, setName] = useState('Untitled session')
  const [type, setType] = useState('meeting')
  const [elapsed, setElapsed] = useState(0)
  const [rms, setRms] = useState(0)
  const [lines, setLines] = useState<Line[]>([])
  const [activeSpeaker, setActiveSpeaker] = useState(0)
  const [speakerCount, setSpeakerCount] = useState(2)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [modelProgress, setModelProgress] = useState(0)
  const [modelReady, setModelReady] = useState(false)
  const [modelError, setModelError] = useState('')
  const [deviceError, setDeviceError] = useState('')
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  // Pre-load Whisper model when user switches to a Whisper-based mode
  useEffect(() => {
    if ((mode !== 'file' && mode !== 'device') || modelReady) return
    setModelError('')
    loadWhisper((pct) => setModelProgress(pct))
      .then(() => setModelReady(true))
      .catch((err) => {
        console.error('Model load failed:', err)
        setModelError('Failed to download the Whisper model. Check your connection and reload.')
      })
  }, [mode, modelReady])

  // ── LIVE RECORDING ──────────────────────────────────────────────────────────

  async function startLive() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
    setPhase('recording')
    startRef.current = Date.now()
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500)

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
      rec.start()
    }
  }

  async function stopLive() {
    recognitionRef.current?.stop()
    ctxRef.current?.close()
    if (timerRef.current) clearInterval(timerRef.current)
    if (pollRef.current) clearInterval(pollRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    setPhase('done')
    await saveSession(linesRef.current, elapsed)
  }

  // ── WHISPER TRANSCRIPTION (file upload + device capture share this) ──────────

  /** Run Whisper on an audio Blob, assign speakers, and save the session. */
  const runTranscription = useCallback(async (audio: Blob, noSpeechHint: string) => {
    setPhase('transcribing')
    setTranscribePct(0)
    setTranscribeProgress('Reading and boosting audio…')

    try {
      const segments = await transcribeFile(audio, ({ fraction, secondsDone, secondsTotal }) => {
        setTranscribePct(Math.round(fraction * 100))
        const mins = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
        setTranscribeProgress(`Transcribing with Whisper… ${mins(secondsDone)} / ${mins(secondsTotal)}`)
      })

      if (segments.length === 0) {
        setTranscribeProgress(noSpeechHint)
        return
      }

      setTranscribePct(100)
      setTranscribeProgress('Assigning speakers…')
      const finalLines = assignSpeakers(segments, speakerCount)
      linesRef.current = finalLines
      setLines(finalLines)

      const duration = Math.ceil(segments[segments.length - 1].end)

      // Compute pauses from gaps between segments
      const pauses: number[] = []
      for (let i = 1; i < segments.length; i++) {
        const gap = segments[i].start - segments[i - 1].end
        if (gap >= 0.5) pauses.push(gap)
      }

      setPhase('done')
      await saveSession(finalLines, duration, pauses)
    } catch (err) {
      console.error('Transcription failed:', err)
      setTranscribeProgress('Error: ' + (err instanceof Error ? err.message : String(err)))
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

  // ── DEVICE / TAB AUDIO CAPTURE ───────────────────────────────────────────────
  // Captures the audio playing on the device (e.g. a podcast in a browser tab)
  // via getDisplayMedia, records it, then transcribes with Whisper on stop.

  async function startDevice() {
    if (!modelReady) return
    setDeviceError('')

    let stream: MediaStream
    try {
      // Video is requested because Chrome only offers the "share audio" option
      // alongside a screen/tab share; we ignore the video track.
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    } catch {
      setDeviceError('Capture was cancelled. Click "Capture device audio" and pick the tab/screen that\'s playing.')
      return
    }

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      stream.getTracks().forEach(t => t.stop())
      setDeviceError('No audio was shared. In the picker, choose a tab (or Entire Screen) and turn ON the "Share tab audio"/"Share system audio" toggle.')
      return
    }

    streamRef.current = stream
    const audioStream = new MediaStream(audioTracks)

    // Level meter
    const ctx = new AudioContext()
    ctxRef.current = ctx
    const src = ctx.createMediaStreamSource(audioStream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    src.connect(analyser)
    const buf = new Uint8Array(analyser.frequencyBinCount)
    pollRef.current = setInterval(() => {
      analyser.getByteFrequencyData(buf)
      setRms(Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length) / 128)
    }, 100)

    // Record
    const rec = new MediaRecorder(audioStream)
    mediaRecorderRef.current = rec
    recChunksRef.current = []
    rec.ondataavailable = (e) => { if (e.data.size > 0) recChunksRef.current.push(e.data) }
    rec.onstop = async () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      ctx.close().catch(() => {})
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(recChunksRef.current, { type: rec.mimeType || 'audio/webm' })
      await runTranscription(
        blob,
        'No audio was captured. Make sure something was actually playing and that you enabled "Share audio" in the picker.',
      )
    }

    // If the user ends the share via the browser bar, stop recording too.
    audioTracks[0].addEventListener('ended', () => {
      if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    })

    rec.start()
    setPhase('capturing')
    startRef.current = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500)
  }

  function stopDevice() {
    mediaRecorderRef.current?.stop()
  }

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
        startTime: l.time, endTime: l.time + 2,
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
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Saving session…</h2>
      </div>
    </div>
  )

  // ── TRANSCRIBING SPLASH ─────────────────────────────────────────────────────

  if (phase === 'transcribing') return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>🎙️</div>
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

  // ── DEVICE-AUDIO CAPTURE VIEW ────────────────────────────────────────────────

  if (phase === 'capturing') return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420, width: '100%' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔊</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Capturing device audio</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
          Recording the audio playing on your device. Let the podcast play, then stop to transcribe.
        </p>
        <div style={{ fontFamily: 'monospace', fontSize: 40, fontWeight: 800, color: 'var(--accent)', marginBottom: 20 }}>{fmt(elapsed)}</div>
        <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden', marginBottom: 28 }}>
          <div style={{ height: '100%', width: `${Math.min(rms * 100, 100)}%`, background: rms > 0.02 ? 'var(--accent)' : 'var(--border-strong)', borderRadius: 3, transition: 'width 0.1s' }} />
        </div>
        {rms <= 0.02 && (
          <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 20, fontWeight: 600 }}>
            No sound detected — make sure audio is playing and you enabled “Share audio”.
          </p>
        )}
        <button onClick={stopDevice} style={{
          width: '100%', padding: 15, borderRadius: 12, fontSize: 16, fontWeight: 700,
          background: 'var(--red)', color: '#fff', border: 'none',
        }}>⏹ Stop & transcribe</button>
      </div>
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
          Speaker {activeSpeaker + 1} · {speakerCount} total
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
      <div style={{ width: '100%', maxWidth: 460 }}>
        <button onClick={() => navigate('/dashboard')} style={{
          background: 'none', border: 'none', color: 'var(--muted)', fontSize: 14, marginBottom: 32,
        }}>← Back</button>

        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 24, letterSpacing: '-0.03em' }}>New session</h1>

        {/* Mode toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: 12, padding: 4, marginBottom: 12, border: '1.5px solid var(--border)' }}>
          {(['live', 'device', 'file'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: mode === m ? 'var(--accent)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--muted)', border: 'none',
              transition: 'all 0.15s',
            }}>
              {m === 'live' ? '🎙️ Live mic' : m === 'device' ? '🔊 Device audio' : '📁 Upload'}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.5 }}>
          {mode === 'live'
            ? 'Transcribe a conversation happening in front of your mic.'
            : mode === 'device'
            ? 'Transcribe a podcast/video playing on this device — capture its audio directly (no mic).'
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
            {[1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => setSpeakerCount(n)} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 700,
                border: `1.5px solid ${speakerCount === n ? 'var(--accent)' : 'var(--border)'}`,
                background: speakerCount === n ? 'var(--accent-dim)' : 'var(--bg-input)',
                color: speakerCount === n ? 'var(--accent)' : 'var(--muted)',
              }}>{n}</button>
            ))}
          </div>
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
                <span style={{ fontSize: 22 }}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Whisper model status — shown for both file + device modes */}
        {(mode === 'file' || mode === 'device') && (
          <div style={{ marginBottom: 16 }}>
            {!modelReady && !modelError && (
              <div style={{ marginBottom: 8, padding: '10px 14px', background: 'var(--accent-dim)', borderRadius: 10, border: '1px solid var(--accent)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>
                  Loading Whisper AI model… {modelProgress > 0 ? `${Math.round(modelProgress)}%` : ''}
                </div>
                <div style={{ height: 4, background: 'rgba(127,119,221,0.2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${modelProgress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>~240 MB download (high-accuracy model), cached after first load</p>
              </div>
            )}
            {modelError && (
              <div style={{ marginBottom: 8, padding: '10px 14px', background: 'rgba(229,85,85,0.1)', borderRadius: 10, border: '1px solid var(--red)', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
                {modelError}
              </div>
            )}
            {modelReady && (
              <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ Whisper model ready</div>
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
              <span style={{ fontSize: 28 }}>{selectedFile ? '🎵' : '📂'}</span>
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

        {/* DEVICE AUDIO SECTION */}
        {mode === 'device' && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ padding: '14px 16px', background: 'var(--bg-input)', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)' }}>How it works:</strong>
              <br />1. Start the podcast/video playing (a browser tab works best).
              <br />2. Click <strong>Capture device audio</strong> below.
              <br />3. In the picker, choose the <strong>tab</strong> (or Entire Screen) and turn ON <strong>“Share tab audio”</strong>.
              <br />4. Let it play, then press <strong>Stop &amp; transcribe</strong>.
            </div>
            {deviceError && (
              <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(229,85,85,0.1)', borderRadius: 10, border: '1px solid var(--red)', fontSize: 13, color: 'var(--red)', fontWeight: 600, lineHeight: 1.5 }}>
                {deviceError}
              </div>
            )}
          </div>
        )}

        {/* CTA button */}
        {mode === 'live' && (
          <button onClick={startLive} style={{
            width: '100%', padding: 15, borderRadius: 12, fontSize: 16, fontWeight: 700,
            background: 'var(--accent)', color: '#fff', border: 'none',
          }}>🎙️ Start recording</button>
        )}
        {mode === 'device' && (
          <button
            onClick={startDevice}
            disabled={!modelReady}
            style={{
              width: '100%', padding: 15, borderRadius: 12, fontSize: 16, fontWeight: 700,
              background: 'var(--accent)', color: '#fff', border: 'none',
              opacity: !modelReady ? 0.45 : 1,
            }}
          >
            {!modelReady ? 'Waiting for model…' : '🔊 Capture device audio'}
          </button>
        )}
        {mode === 'file' && (
          <button
            onClick={startFile}
            disabled={!selectedFile || !modelReady}
            style={{
              width: '100%', padding: 15, borderRadius: 12, fontSize: 16, fontWeight: 700,
              background: 'var(--accent)', color: '#fff', border: 'none',
              opacity: (!selectedFile || !modelReady) ? 0.45 : 1,
            }}
          >
            {!modelReady ? 'Waiting for model…' : !selectedFile ? 'Choose a file first' : '🚀 Transcribe file'}
          </button>
        )}
      </div>
    </div>
  )
}
