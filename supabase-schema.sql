-- Run this in Supabase → SQL Editor to create the sessions table.

create table if not exists sessions (
  id            uuid primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null default 'Untitled session',
  session_type  text not null default 'other',
  duration_seconds integer not null default 0,
  speaker_count integer not null default 0,
  transcript    jsonb not null default '[]',
  speakers      jsonb not null default '[]',
  report        jsonb,
  created_at    timestamptz not null default now()
);

-- Row Level Security: users can only see their own sessions
alter table sessions enable row level security;

create policy "Users see own sessions"
  on sessions for select using (auth.uid() = user_id);

create policy "Users insert own sessions"
  on sessions for insert with check (auth.uid() = user_id);

create policy "Users update own sessions"
  on sessions for update using (auth.uid() = user_id);

create policy "Users delete own sessions"
  on sessions for delete using (auth.uid() = user_id);
