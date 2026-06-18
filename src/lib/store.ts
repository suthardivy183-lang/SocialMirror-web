// Unified data layer.
// When Supabase is configured (real URL in .env) it uses Supabase.
// Otherwise it falls back to a local, in-browser mode so the whole app
// works without any backend — useful for local testing / demos.

import { supabase, isConfigured } from './supabase'

export interface StoredUser { id: string; email: string }

const USER_KEY = 'sm_local_user'
const SESSIONS_KEY = 'sm_local_sessions'

// ---------- AUTH ----------

export async function getUser(): Promise<StoredUser> {
  if (isConfigured) {
    const { data } = await supabase.auth.getUser()
    if (data.user) return { id: data.user.id, email: data.user.email ?? '' }
  }
  // Local mode: always return a persistent guest user, creating one if needed
  const raw = localStorage.getItem(USER_KEY)
  if (raw) return JSON.parse(raw)
  const guest: StoredUser = { id: crypto.randomUUID(), email: 'guest@local' }
  localStorage.setItem(USER_KEY, JSON.stringify(guest))
  return guest
}

export async function signUp(email: string, password: string): Promise<void> {
  if (isConfigured) {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    return
  }
  localStorage.setItem(USER_KEY, JSON.stringify({ id: crypto.randomUUID(), email }))
}

export async function signIn(email: string, password: string): Promise<void> {
  if (isConfigured) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return
  }
  // Local mode: accept any credentials, create a session
  localStorage.setItem(USER_KEY, JSON.stringify({ id: crypto.randomUUID(), email }))
}

export async function signInGoogle(): Promise<void> {
  if (isConfigured) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) throw error
    return
  }
  // Local mode: simulate a Google account
  localStorage.setItem(USER_KEY, JSON.stringify({ id: crypto.randomUUID(), email: 'you@gmail.com' }))
}

export async function signOut(): Promise<void> {
  if (isConfigured) { await supabase.auth.signOut(); return }
  localStorage.removeItem(USER_KEY)
}

// ---------- SESSIONS ----------

export interface DbSession {
  id: string
  user_id: string
  name: string
  session_type: string
  duration_seconds: number
  speaker_count: number
  transcript: unknown[]
  speakers: unknown[]
  report: { headline: string; insight: string; tip: string } | null
  pauses?: { totalSilenceSec: number; talkRatio: number; avgPauseSec: number; longestPauseSec: number; pauseCount: number }
  created_at: string
}

export async function listSessions(userId: string): Promise<DbSession[]> {
  if (isConfigured) {
    const { data } = await supabase.from('sessions').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false })
    return (data ?? []) as DbSession[]
  }
  const all = readLocalSessions()
  return all.filter(s => s.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function getSession(id: string, userId: string): Promise<DbSession | null> {
  if (isConfigured) {
    const { data } = await supabase.from('sessions').select('*')
      .eq('id', id).eq('user_id', userId).single()
    return (data as DbSession) ?? null
  }
  return readLocalSessions().find(s => s.id === id && s.user_id === userId) ?? null
}

export async function saveSession(session: DbSession): Promise<void> {
  if (isConfigured) {
    const { error } = await supabase.from('sessions').insert(session)
    if (error) throw error
    return
  }
  const all = readLocalSessions()
  all.push(session)
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all))
}

export async function updateSession(id: string, patch: Partial<DbSession>): Promise<void> {
  if (isConfigured) {
    const { error } = await supabase.from('sessions').update(patch).eq('id', id)
    if (error) throw error
    return
  }
  const all = readLocalSessions().map(s => (s.id === id ? { ...s, ...patch } : s))
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all))
}

export async function deleteSession(id: string): Promise<void> {
  if (isConfigured) { await supabase.from('sessions').delete().eq('id', id); return }
  const all = readLocalSessions().filter(s => s.id !== id)
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all))
}

export async function deleteAllSessions(userId: string): Promise<void> {
  if (isConfigured) { await supabase.from('sessions').delete().eq('user_id', userId); return }
  const all = readLocalSessions().filter(s => s.user_id !== userId)
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all))
}

function readLocalSessions(): DbSession[] {
  const raw = localStorage.getItem(SESSIONS_KEY)
  return raw ? JSON.parse(raw) : []
}

/** True when running without a real backend (local demo mode). */
export const isLocalMode = !isConfigured
