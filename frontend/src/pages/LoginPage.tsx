import { useState } from 'react'
import { auth } from '../api'
import { errorMessage } from '../lib'
import { Wordmark, Logo, Footer } from '../ui'
import { AlertCircle, Eye, EyeOff, ArrowRight, Zap } from 'lucide-react'

interface Props { onLogin: (token: string, username: string) => void }

function TicketStack() {
  const rows = [
    { n: 'B-107', who: 'Meera J.', r: '-6deg', x: 'translate-x-8 -translate-y-2', dim: true, d: '0.25s' },
    { n: 'B-106', who: 'Vikram P.', r: '3deg', x: '-translate-x-2 translate-y-8', dim: true, d: '0.12s' },
  ]
  return (
    <div className="relative h-[380px] w-full max-w-[520px]" aria-hidden="true">
      {rows.map((t) => (
        <div
          key={t.n}
          style={{ ['--r' as any]: t.r, animationDelay: t.d }}
          className={`animate-rise absolute left-0 top-6 w-[86%] rounded-2xl border border-line bg-raised p-5 opacity-80 ${t.x}`}
        >
          <p className="text-xs text-muted">Waiting</p>
          <p className="font-mono text-2xl font-medium text-muted">{t.n}</p>
          <p className="text-sm text-muted">{t.who}</p>
        </div>
      ))}
      <div
        style={{ ['--r' as any]: '-2deg', animationDelay: '0.4s' }}
        className="animate-rise absolute left-4 top-28 w-[94%] overflow-hidden rounded-2xl border border-amber/40 bg-[#07090c] p-8 shadow-2xl shadow-black/60"
      >
        <span className="absolute -left-2 top-[58%] h-4 w-4 rounded-full border border-amber/40 bg-surface" />
        <span className="absolute -right-2 top-[58%] h-4 w-4 rounded-full border border-amber/40 bg-surface" />
        <p className="text-xs text-muted">Now serving</p>
        <p className="led text-7xl font-bold leading-tight">A-104</p>
        <div className="mt-7 flex items-center justify-between border-t border-dashed border-line pt-4">
          <span className="text-sm">Rahul Kumar</span>
          <span className="text-xs text-mint">Counter 2</span>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const switchMode = (m: 'login' | 'register') => {
    setMode(m)
    setError('')
  }

  const signIn = async (u: string, p: string) => {
    const { data } = await auth.login(u, p)
    if (!data?.token) throw new Error('No session returned')
    onLogin(data.token, data.username)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const u = username.trim()

    if (mode === 'register') {
      if (u.length < 3) return setError('Username needs at least 3 characters.')
      if (!/^[A-Za-z0-9._-]+$/.test(u)) return setError('Username can use letters, numbers, dot, dash and underscore only.')
      if (password.length < 6) return setError('Password needs at least 6 characters.')
      if (password !== confirm) return setError('The two passwords do not match.')
    }

    setLoading(true)
    try {
      if (mode === 'register') await auth.register(u, password)
      // After creating the account, sign in straight away so the user lands on their dashboard.
      await signIn(u, password)
    } catch (err: any) {
      setError(errorMessage(err))
      setLoading(false)
    }
  }

  const tryDemo = async () => {
    setError('')
    setLoading(true)
    try {
      await signIn('admin', 'admin123')
    } catch (err: any) {
      setError(errorMessage(err))
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand side */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface p-12 lg:flex">
        <div className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-amber/10 blur-3xl" />
        <Wordmark />
        <div className="relative">
          <TicketStack />
        </div>
        <div className="relative">
          <h1 className="text-6xl font-bold leading-[1.02] tracking-tight">Next, please.</h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">
            Run every counter, desk and clinic from one live board. Add people, reorder the line, serve with one click.
          </p>
        </div>
      </aside>

      {/* Form side */}
      <main className="flex min-h-screen flex-col lg:min-h-0">
        <div className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo />
            <span className="text-xl font-bold tracking-tight">QueueFlow</span>
          </div>

          <h2 className="text-3xl font-semibold tracking-tight">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {mode === 'login' ? 'Sign in to manage your queues.' : 'It takes a few seconds. You will be signed in right after.'}
          </p>

          <div className="mt-7 flex gap-6 border-b border-line" role="tablist">
            <button role="tab" aria-selected={mode === 'login'} className="tab" onClick={() => switchMode('login')}>Sign in</button>
            <button role="tab" aria-selected={mode === 'register'} className="tab" onClick={() => switchMode('register')}>Register</button>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm text-muted">Username</label>
              <input
                id="username" className="input" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === 'login' ? 'Your username' : 'Pick a username'} maxLength={30}
                autoComplete="username" autoCapitalize="none" spellCheck={false} required
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm text-muted">Password</label>
              <div className="relative">
                <input
                  id="password" className="input pr-11" type={show ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'login' ? 'Your password' : 'At least 6 characters'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={72} required
                />
                <button
                  type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-ink"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="animate-slide-in">
                <label htmlFor="confirm" className="mb-1.5 block text-sm text-muted">Confirm password</label>
                <input
                  id="confirm" className="input" type={show ? 'text' : 'password'}
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Type it once more" autoComplete="new-password" required
                />
              </div>
            )}

            {error && (
              <div role="alert" className="animate-slide-in flex items-start gap-2 rounded-lg border border-coral/30 bg-coral/10 px-3 py-2.5 text-sm text-coral">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn btn-amber w-full py-3">
              {loading
                ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
                : (<>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight className="h-4 w-4" /></>)}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <button type="button" onClick={tryDemo} disabled={loading} className="btn btn-ghost mt-4 w-full">
            <Zap className="h-4 w-4 text-amber" /> Try the demo account
          </button>
        </div>
        </div>
        <Footer />
      </main>
    </div>
  )
}
