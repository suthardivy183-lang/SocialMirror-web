import { supabase } from './supabase'
import { Session } from '@/types'

export async function saveSesssion(session: Session, userId: string) {
  const { error } = await supabase.from('sessions').upsert({
    id: session.id,
    user_id: userId,
    name: session.name,
    session_type: session.sessionType,
    duration_seconds: session.durationSeconds,
    speaker_count: session.speakerCount,
    transcript: session.transcript,
    speakers: session.speakers,
    report: session.report,
    created_at: session.createdAt,
  })
  if (error) throw error
}

export async function fetchSessions(userId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    sessionType: row.session_type,
    createdAt: row.created_at,
    durationSeconds: row.duration_seconds,
    speakerCount: row.speaker_count,
    transcript: row.transcript ?? [],
    speakers: row.speakers ?? [],
    report: row.report ?? null,
  }))
}

export async function fetchSession(id: string, userId: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  if (error || !data) return null
  return {
    id: data.id,
    name: data.name,
    sessionType: data.session_type,
    createdAt: data.created_at,
    durationSeconds: data.duration_seconds,
    speakerCount: data.speaker_count,
    transcript: data.transcript ?? [],
    speakers: data.speakers ?? [],
    report: data.report ?? null,
  }
}

export async function deleteSession(id: string, userId: string) {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}
