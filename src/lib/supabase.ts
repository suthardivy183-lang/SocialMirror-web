import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT'))

// createClient throws on empty URL/key — only construct when credentials are present.
// Typed as `any` so query/insert calls in the data layer aren't blocked by the
// `never` table types you get without a generated Database type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = isConfigured ? createClient(url, key) : null
