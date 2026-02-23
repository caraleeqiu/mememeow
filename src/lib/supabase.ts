import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

// 创建一个空的 Supabase 客户端代理，避免运行时错误
function createEmptyClient(): SupabaseClient {
  const handler = {
    get: () => {
      throw new Error('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
    }
  }
  return new Proxy({} as SupabaseClient, handler)
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
      },
    })
  : createEmptyClient()
