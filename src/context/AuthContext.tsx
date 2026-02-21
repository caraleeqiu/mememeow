import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { auth } from '../api/client'
import { User } from '../types'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  updateCarrots: (carrots: number) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('mememeow_token')
    if (token) {
      auth.me()
        .then((data) => {
          setUser({ ...data, token })
        })
        .catch(() => {
          localStorage.removeItem('mememeow_token')
        })
        .finally(() => {
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const data = await auth.login(email, password)
    localStorage.setItem('mememeow_token', data.token)
    setUser(data)
  }

  const register = async (email: string, password: string) => {
    const data = await auth.register(email, password)
    localStorage.setItem('mememeow_token', data.token)
    setUser(data)
  }

  const logout = () => {
    localStorage.removeItem('mememeow_token')
    setUser(null)
  }

  const updateCarrots = (carrots: number) => {
    if (user) {
      setUser({ ...user, carrots })
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateCarrots }}>
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
