import { useState, useEffect, useCallback } from 'react'
import { queues as queuesApi, analytics as analyticsApi } from '../api'
import type { Queue, Analytics } from '../api'
import { LogOut, Plus, Trash2, ArrowUpRight, Ticket } from 'lucide-react'
import QueueDetail from './QueueDetail'
import AnalyticsDashboard from './AnalyticsDashboard'
import { TopBar, Wordmark, Modal, ConfirmDialog, Notch, LiveDot, Footer, toast } from '../ui'
import { errorMessage, formatDuration } from '../lib'

interface Props { username: string; token: string; onLogout: () => void }

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function Dots({ waiting }: { waiting: number }) {
  if (waiting === 0) return <p className="h-3 text-xs text-muted">Nobody waiting</p>
  const shown = Math.min(waiting, 14)
  return (
    <div className="flex h-3 items-center gap-1.5" aria-label={`${waiting} waiting`}>
      {Array.from({ length: shown }).map((_, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${i === 0 ? 'bg-amber ring-4 ring-amber/20' : 'bg-amber/45'}`} />
      ))}
      {waiting > shown && <span className="ml-1 font-mono text-xs text-muted">+{waiting - shown}</span>}
    </div>
  )
}

export default function DashboardPage({ username, token, onLogout }: Props) {
  const [queues, setQueues] = useState<Queue[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [view, setView] = useState<'queues' | 'analytics'>('queues')
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toDelete, setToDelete] = useState<Queue | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [qRes, aRes] = await Promise.all([queuesApi.list(), analyticsApi.get()])
      setQueues(qRes.data)
      setAnalytics(aRes.data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
    let es: EventSource | null = null
    try {
      es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
      es.onmessage = (e) => {
        try { if (JSON.parse(e.data).type !== 'connected') loadData() } catch {}
      }
      ;['queue_created', 'queue_updated', 'queue_deleted', 'token_added', 'queue_changed', 'token_served', 'token_cancelled']
        .forEach((ev) => es!.addEventListener(ev, () => loadData()))
    } catch {}
    return () => es?.close()
  }, [token, loadData])

  const createQueue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      await queuesApi.create(name.trim(), desc.trim())
      setName(''); setDesc(''); setShowCreate(false)
      toast('Queue created')
      await loadData()
    } catch (err) {
      toast(errorMessage(err), 'err')
    }
    setCreating(false)
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await queuesApi.delete(toDelete.id)
      setQueues((prev) => prev.filter((q) => q.id !== toDelete.id))
      toast(`Deleted “${toDelete.name}”`)
      setToDelete(null)
      loadData()
    } catch (err) {
      toast(errorMessage(err), 'err')
    }
    setDeleting(false)
  }

  if (selectedQueue) {
    return (
      <QueueDetail
        queue={selectedQueue}
        token={token}
        onBack={() => { setSelectedQueue(null); loadData() }}
      />
    )
  }

  const s = analytics?.summary
  const stats = [
    { label: 'Queues', value: s ? s.totalQueues : '–', tone: 'text-ink' },
    { label: 'Waiting now', value: s ? s.waiting : '–', tone: 'text-amber' },
    { label: 'Served', value: s ? s.served : '–', tone: 'text-mint' },
    { label: 'Average wait', value: s ? (s.avgWaitSeconds > 0 ? formatDuration(s.avgWaitSeconds) : '—') : '–', tone: 'text-ink' },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        wide
        left={<Wordmark />}
        right={
          <>
            <nav className="mr-2 hidden gap-6 sm:flex" role="tablist">
              {(['queues', 'analytics'] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className="tab !pb-[1.15rem] !pt-[1.15rem]">
                  {v === 'queues' ? 'Queues' : 'Analytics'}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber text-sm font-bold text-bg">
                {(username || '?').charAt(0).toUpperCase()}
              </span>
              <span className="hidden max-w-[110px] truncate text-sm sm:block">{username}</span>
            </div>
            <button onClick={onLogout} className="icon-btn" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </>
        }
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <nav className="mb-6 flex gap-6 border-b border-line sm:hidden" role="tablist">
          {(['queues', 'analytics'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className="tab">
              {v === 'queues' ? 'Queues' : 'Analytics'}
            </button>
          ))}
        </nav>

        {view === 'analytics' ? (
          <AnalyticsDashboard />
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {greeting()}, <span className="text-amber">{username}</span>
                </h1>
                <div className="mt-2"><LiveDot label="Live — updates the moment someone joins or is served" /></div>
              </div>
              <button onClick={() => setShowCreate(true)} className="btn btn-amber">
                <Plus className="h-4 w-4" /> New queue
              </button>
            </div>

            {/* Stats */}
            <div className="panel mb-10 grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
              {stats.map((st, i) => (
                <div key={st.label} className={`px-6 py-5 ${i % 2 === 1 ? 'border-l border-line sm:border-l-0' : ''} ${i > 1 ? 'border-t border-line sm:border-t-0' : ''}`}>
                  <p className="text-sm text-muted">{st.label}</p>
                  <p className={`tabular mt-1 text-4xl font-semibold tracking-tight ${st.tone}`}>{st.value}</p>
                </div>
              ))}
            </div>

            <h2 className="mb-4 text-lg font-semibold">Your queues</h2>

            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => <div key={i} className="panel h-52 animate-pulse-soft" />)}
              </div>
            ) : queues.length === 0 ? (
              <div className="panel flex flex-col items-center px-6 py-16 text-center">
                <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber/10 text-amber">
                  <Ticket className="h-7 w-7" />
                </span>
                <p className="text-lg font-semibold">Start your first line</p>
                <p className="mt-1 max-w-sm text-sm text-muted">
                  Create a queue for a counter, a desk or a clinic, then add people as they arrive.
                </p>
                <button onClick={() => setShowCreate(true)} className="btn btn-amber mt-6">
                  <Plus className="h-4 w-4" /> Create a queue
                </button>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {queues.map((q, idx) => {
                  const total = q.waiting_count + q.served_count
                  const pct = total ? Math.round((q.served_count / total) * 100) : 0
                  return (
                    <div
                      key={q.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedQueue(q)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedQueue(q)}
                      style={{ animationDelay: `${idx * 60}ms` }}
                      className="animate-slide-in group relative cursor-pointer overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-amber/50 hover:shadow-xl hover:shadow-black/40"
                    >
                      <div className="p-5 pb-6">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-xl font-semibold leading-tight">{q.name}</h3>
                          <button
                            onClick={(e) => { e.stopPropagation(); setToDelete(q) }}
                            className="icon-btn -mr-2 -mt-1 opacity-0 transition focus:opacity-100 group-hover:opacity-100 hover:!text-coral"
                            aria-label={`Delete ${q.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="mt-1 line-clamp-1 min-h-[1.25rem] text-sm text-muted">{q.description}</p>
                      </div>

                      {/* perforation */}
                      <div className="relative h-0 border-t border-dashed border-line">
                        <Notch className="-left-2 -top-2" />
                        <Notch className="-right-2 -top-2" />
                      </div>

                      <div className="p-5 pt-6">
                        <Dots waiting={q.waiting_count} />
                        <div className="mt-5 flex items-end justify-between">
                          <div>
                            <p className="tabular text-3xl font-semibold leading-none text-amber">{q.waiting_count}</p>
                            <p className="mt-1 text-xs text-muted">waiting</p>
                          </div>
                          <div className="text-right">
                            <p className="tabular text-3xl font-semibold leading-none text-mint">{q.served_count}</p>
                            <p className="mt-1 text-xs text-muted">served</p>
                          </div>
                        </div>
                        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-bg">
                          <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-4 flex items-center gap-1 text-sm font-medium text-muted transition group-hover:text-amber">
                          Open queue <ArrowUpRight className="h-4 w-4" />
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      <Footer />

      {showCreate && (
        <Modal title="New queue" onClose={() => setShowCreate(false)}>
          <form onSubmit={createQueue} className="space-y-4">
            <div>
              <label htmlFor="qname" className="mb-1.5 block text-sm text-muted">Name</label>
              <input id="qname" className="input" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer support" required autoFocus maxLength={60} />
            </div>
            <div>
              <label htmlFor="qdesc" className="mb-1.5 block text-sm text-muted">Description <span className="text-muted/60">(optional)</span></label>
              <input id="qdesc" className="input" value={desc} onChange={(e) => setDesc(e.target.value)}
                placeholder="Where or what is this line for?" maxLength={120} />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" className="btn btn-ghost flex-1" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-amber flex-1" disabled={creating}>
                {creating ? 'Creating…' : 'Create queue'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete this queue?"
          body={`“${toDelete.name}” and everyone in it, including its history, will be removed. This cannot be undone.`}
          confirmLabel="Delete queue"
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  )
}
