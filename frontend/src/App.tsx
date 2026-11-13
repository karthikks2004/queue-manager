import { useState, useEffect } from 'react'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [username, setUsername] = useState<string>(() => localStorage.getItem('username') || '')

  const handleLogin = (tok: string, user: string) => {
    localStorage.setItem('token', tok)
    localStorage.setItem('username', user)
    setToken(tok)
    setUsername(user)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    setToken(null)
    setUsername('')
  }

  if (!token) return <LoginPage onLogin={handleLogin} />
  return <DashboardPage username={username} token={token} onLogout={handleLogout} />
}
