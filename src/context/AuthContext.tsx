import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Profile {
  id: string
  email: string
  carrots: number
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  accessToken: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  updateCarrots: (carrots: number) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    // 最大等待 10 秒，防止永久卡住
    const maxTimeout = setTimeout(() => {
      if (mounted) {
        setIsLoading(false)
      }
    }, 10000)

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!mounted) return

        if (session?.user) {
          setUser(session.user)
          setAccessToken(session.access_token)
          await loadProfile(session.user.id)
        } else {
          setUser(null)
          setProfile(null)
          setAccessToken(null)
          setIsLoading(false)
        }
      } catch {
        if (mounted) {
          setIsLoading(false)
        }
      } finally {
        clearTimeout(maxTimeout)
      }
    }

    init()

    // 监听 auth 状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return

        setUser(session?.user ?? null)
        setAccessToken(session?.access_token ?? null)
        if (session?.user) {
          await loadProfile(session.user.id)
        } else {
          setProfile(null)
          setIsLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const loadProfile = async (userId: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      // 获取用户的 access token 用于 RLS
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token || supabaseKey

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${accessToken}`,
          },
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)

      const data = await response.json()

      if (data && data.length > 0) {
        setProfile(data[0])
      } else {
        // Profile 不存在，创建一个
        const createResponse = await fetch(
          `${supabaseUrl}/rest/v1/profiles`,
          {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({ id: userId, carrots: 0 }),
          }
        )
        const newProfile = await createResponse.json()
        if (newProfile && newProfile.length > 0) {
          setProfile(newProfile[0])
        } else {
          setProfile({ id: userId, email: '', carrots: 0 })
        }
      }
    } catch {
      setProfile({ id: userId, email: '', carrots: 0 })
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const register = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) throw error
  }

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) throw error
  }

  const logout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setProfile(null)
  }

  const updateCarrots = (carrots: number) => {
    if (profile) {
      console.log('[updateCarrots] Updating UI:', profile.carrots, '->', carrots)
      setProfile({ ...profile, carrots })
      // 注意: 数据库更新由 reading.record() 处理，这里只更新 UI
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        accessToken,
        isLoading,
        login,
        register,
        loginWithGoogle,
        logout,
        updateCarrots,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
