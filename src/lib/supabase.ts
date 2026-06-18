import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT'))

// createClient throws on empty URL/key — only construct when credentials are present
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: ReturnType<typeof createClient> = isConfigured
  ? createClient(url, key)
  : (null as any)
