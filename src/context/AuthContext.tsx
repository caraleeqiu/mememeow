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
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // 获取当前 session
    console.log('[AuthContext] Getting session...')
    supabase.auth.getSession()
      .then(({ data: { session } }: { data: { session: Session | null } }) => {
        console.log('[AuthContext] Session:', session?.user?.id)
        setUser(session?.user ?? null)
        if (session?.user) {
          loadProfile(session.user.id)
        } else {
          setIsLoading(false)
        }
      })
      .catch((err: Error) => {
        console.error('Failed to get session:', err)
        setIsLoading(false)
      })

    // 超时保护：5秒后强制结束加载
    const timeout = setTimeout(() => {
      setIsLoading(false)
    }, 5000)

    // 监听 auth 状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          await loadProfile(session.user.id)
        } else {
          setProfile(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const loadProfile = async (userId: string) => {
    console.log('[AuthContext] loadProfile called for:', userId)

    // 使用 fetch 直接查询，避免 Supabase 客户端问题
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)

      const data = await response.json()
      console.log('[AuthContext] Profile fetch result:', data)

      if (data && data.length > 0) {
        setProfile(data[0])
        console.log('[AuthContext] Profile set with carrots:', data[0].carrots)
      } else {
        // Profile 不存在，创建一个
        console.log('[AuthContext] Profile not found, creating...')
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
        console.log('[AuthContext] Profile created:', newProfile)
        if (newProfile && newProfile.length > 0) {
          setProfile(newProfile[0])
        } else {
          setProfile({ id: userId, email: '', carrots: 0 })
        }
      }
    } catch (error) {
      console.error('[AuthContext] Error loading profile:', error)
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
      setProfile({ ...profile, carrots })
      // 同步更新到数据库
      supabase
        .from('profiles')
        .update({ carrots })
        .eq('id', profile.id)
        .then(({ error }: { error: Error | null }) => {
          if (error) console.error('Error updating carrots:', error)
        })
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
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
