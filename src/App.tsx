import { AuthProvider, useAuth } from './context/AuthContext'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { isSupabaseConfigured } from './lib/supabase'
import './App.css'

function AppContent() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading__cat">
          <img src="/carrot-cat.jpg" alt="萝卜猫" className="app-loading__image" />
        </div>
        <p>加载中...</p>
      </div>
    )
  }

  return user ? <Home /> : <Login />
}

function App() {
  // 检查 Supabase 配置
  if (!isSupabaseConfigured) {
    return (
      <div className="app-error">
        <h1>配置错误</h1>
        <p>缺少 Supabase 环境变量</p>
        <p>请在 Vercel 中添加：</p>
        <ul>
          <li>VITE_SUPABASE_URL</li>
          <li>VITE_SUPABASE_ANON_KEY</li>
        </ul>
      </div>
    )
  }

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
