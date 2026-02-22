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
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      console.log('[AuthContext] Profile loaded:', data, 'error:', error)
      if (error) throw error
      setProfile(data)
    } catch (error) {
      console.error('[AuthContext] Error loading profile:', error)
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
