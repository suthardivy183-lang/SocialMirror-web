// HTTP client for the SocialMirror transcription backend.
//
// The backend is job-based: start a job, poll status, fetch the result.
// transcribeViaBackend() wraps that into a single awaitable call with progress.

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export interface BackendLine {
  speaker: number   // 1-based
  start: number
  end: number
  text: string
  confidence: number
}

export interface BackendSpeaker {
  id: number
  avg_pitch: number
  pitch_variance: number
  avg_energy_db: number
  energy_variance: number
}

export interface BackendResult {
  language: string
  model: string
  diarizer: string
  speaker_count: number
  transcript: BackendLine[]
  speakers: BackendSpeaker[]
  timeline: { speaker: number; start: number; end: number }[]
}

export interface JobStatus {
  job_id: string
  status: 'queued' | 'running' | 'done' | 'error'
  progress: number
  message: string
  error: string | null
}

/** A user-facing error carrying the backend's machine code (e.g. server_busy). */
export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json()
    return new ApiError(body.error ?? 'http_error', body.message ?? res.statusText)
  } catch {
    return new ApiError('http_error', `${res.status} ${res.statusText}`)
  }
}

export async function startTranscriptionJob(blob: Blob, numSpeakers?: number): Promise<string> {
  const form = new FormData()
  const name = blob instanceof File ? blob.name : 'recording.webm'
  form.append('file', blob, name)
  if (numSpeakers && numSpeakers > 0) form.append('num_speakers', String(numSpeakers))

  let res: Response
  try {
    res = await fetch(`${API_URL}/transcribe`, { method: 'POST', body: form })
  } catch {
    throw new ApiError('backend_unavailable', 'Cannot reach the server. Is the backend running?')
  }
  if (!res.ok) throw await parseError(res)
  const body = await res.json()
  return body.job_id as string
}

export async function getTranscriptionStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_URL}/status/${jobId}`)
  if (!res.ok) throw await parseError(res)
  return res.json()
}

export async function getTranscriptionResult(jobId: string): Promise<BackendResult> {
  const res = await fetch(`${API_URL}/result/${jobId}`)
  if (!res.ok) throw await parseError(res)
  return res.json()
}

/**
 * Upload audio, poll until done, return the result. `onProgress` reports the
 * backend's phase messages (loading models / transcribing / diarizing / …).
 */
export async function transcribeViaBackend(
  blob: Blob,
  numSpeakers: number | undefined,
  onProgress?: (fraction: number, message: string) => void,
): Promise<BackendResult> {
  onProgress?.(0.02, 'uploading')
  const jobId = await startTranscriptionJob(blob, numSpeakers)

  // Poll roughly every second until the job finishes.
  for (;;) {
    await new Promise(r => setTimeout(r, 1000))
    const s = await getTranscriptionStatus(jobId)
    onProgress?.(s.progress, s.message)
    if (s.status === 'done') break
    if (s.status === 'error') throw new ApiError(s.error ?? 'pipeline_error', s.message)
  }
  return getTranscriptionResult(jobId)
}

/** Best-effort liveness check used to show a clear "backend down" message. */
export async function backendHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`)
    return res.ok
  } catch {
    return false
  }
}
