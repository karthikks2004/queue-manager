import { useState } from 'react'
import { auth } from '../api'
import { Layers, User, Lock, AlertCircle } from 'lucide-react'

interface Props { onLogin: (token: string, username: string) => void }

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const fn = mode === 'login' ? auth.login : auth.register
      const { data } = await fn(username, password)
      onLogin(data.token, data.username)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/20 border border-accent/30 mb-4">
            <Layers className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">QueueFlow</h1>
          <p className="text-muted mt-1">Intelligent Queue Management</p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-2xl">
          <div className="flex gap-1 mb-6 bg-bg rounded-xl p-1">
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-accent text-white shadow' : 'text-muted hover:text-white'}`}>
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm text-muted mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input value={username} onChange={e => setUsername(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
                  placeholder="Enter username" required />
              </div>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
                  placeholder="Enter password" required />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-accent hover:bg-accentHover disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors">
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-muted text-xs mt-4">
            Default: <span className="text-white font-mono">admin</span> / <span className="text-white font-mono">admin123</span>
          </p>
        </div>
      </div>
    </div>
  )
}
