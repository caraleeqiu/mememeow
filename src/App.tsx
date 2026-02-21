import { AuthProvider, useAuth } from './context/AuthContext'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import './App.css'

function AppContent() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading__cat">
          <span className="app-loading__face">(=^･ω･^=)</span>
          <div className="app-loading__carrot">🥕</div>
        </div>
        <p>加载中...</p>
      </div>
    )
  }

  return user ? <Home /> : <Login />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
