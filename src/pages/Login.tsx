import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import './Login.css'

export function Login() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const { login, register } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      if (isLogin) {
        await login(email, password)
      } else {
        await register(email, password)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login">
      <div className="login__cat">
        <div className="login__cat-avatar">
          <span className="login__cat-face">(=^･ω･^=)</span>
          <div className="login__cat-carrot">🥕</div>
        </div>
      </div>

      <h1 className="login__title">MeMeMeow</h1>
      <p className="login__subtitle">和萝卜猫一起学英语</p>

      <form onSubmit={handleSubmit} className="login__form">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱"
          className="login__input"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码（至少6位）"
          className="login__input"
          minLength={6}
          required
        />

        {error && <p className="login__error">{error}</p>}

        <button type="submit" className="login__btn" disabled={isLoading}>
          {isLoading ? '加载中...' : isLogin ? '登录' : '注册'}
        </button>
      </form>

      <button
        type="button"
        className="login__toggle"
        onClick={() => {
          setIsLogin(!isLogin)
          setError('')
        }}
      >
        {isLogin ? '没有账号？注册一个' : '已有账号？去登录'}
      </button>
    </div>
  )
}
