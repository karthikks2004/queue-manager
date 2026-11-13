import { useState, useEffect, useCallback } from 'react'
import { tokens as tokensApi } from '../api'
import type { Queue, Token } from '../api'
import {
  ArrowLeft, Plus, ChevronUp, ChevronDown, CheckCircle, XCircle,
  Crown, Phone, Clock, User, Hash, X, History, Users, AlertCircle
} from 'lucide-react'

interface Props {
  queue: Queue
  onBack: () => void
  onQueueUpdate: (q: Queue) => void
}

function formatWait(secs: number) {
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m`
  return `${Math.round(secs / 3600)}h ${Math.round((secs % 3600) / 60)}m`
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`
  return `${Math.round(diff / 3600000)}h ago`
}

export default function QueueDetail({ queue, onBack }: Props) {
  const [waiting, setWaiting] = useState<Token[]>([])
  const [history, setHistory] = useState<Token[]>([])
  const [tab, setTab] = useState<'queue' | 'history'>('queue')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ person_name: '', phone: '', priority: false, notes: '' })
  const [adding, setAdding] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [wRes, hRes] = await Promise.all([
        tokensApi.list(queue.id),
        tokensApi.history(queue.id)
      ])
      setWaiting(wRes.data)
      setHistory(hRes.data)
    } catch {}
    setLoading(false)
  }, [queue.id])

  useEffect(() => { load() }, [load])

  const addToken = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.person_name.trim()) return
    setAdding(true)
    try {
      await tokensApi.add(queue.id, { ...form, priority: form.priority ? 1 : 0 })
      setForm({ person_name: '', phone: '', priority: false, notes: '' })
      setShowAdd(false)
      load()
    } catch {}
    setAdding(false)
  }

  const action = async (fn: () => Promise<any>, tokenId: number) => {
    setActionLoading(tokenId)
    try { await fn(); await load() } catch {}
    setActionLoading(null)
  }

  const topToken = waiting[0]

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="bg-surface border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 text-muted hover:text-white rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-bold text-white">{queue.name}</h1>
              {queue.description && <p className="text-xs text-muted">{queue.description}</p>}
            </div>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accentHover text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
            <Plus className="w-4 h-4" /> Add Token
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Waiting', value: waiting.length, color: 'warning' },
            { label: 'Served', value: queue.served_count, color: 'success' },
            { label: 'Cancelled', value: queue.cancelled_count, color: 'danger' },
          ].map(s => (
            <div key={s.label} className="bg-surface border border-border rounded-xl p-3 text-center">
              <p className={`text-2xl font-bold text-${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Next up card */}
        {topToken && (
          <div className="bg-gradient-to-r from-accent/20 to-accent/5 border border-accent/30 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-accent font-medium mb-1">🎯 Next to Serve</p>
                <p className="text-xl font-bold text-white">{topToken.person_name}</p>
                <p className="text-sm text-muted font-mono">{topToken.token_number}</p>
                <p className="text-xs text-muted mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Waiting {timeAgo(topToken.created_at)}
                </p>
              </div>
              <button
                onClick={() => action(() => tokensApi.serve(topToken.id), topToken.id)}
                disabled={actionLoading === topToken.id}
                className="flex items-center gap-2 bg-success hover:bg-success/80 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
                <CheckCircle className="w-4 h-4" />
                {actionLoading === topToken.id ? 'Serving...' : 'Serve Now'}
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-surface rounded-xl p-1 mb-4 w-fit">
          <button onClick={() => setTab('queue')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'queue' ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}>
            <Users className="w-3.5 h-3.5" /> Queue {waiting.length > 0 && `(${waiting.length})`}
          </button>
          <button onClick={() => setTab('history')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'history' ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}>
            <History className="w-3.5 h-3.5" /> History
          </button>
        </div>

        {tab === 'queue' ? (
          loading ? (
            <div className="text-center py-12 text-muted">Loading...</div>
          ) : waiting.length === 0 ? (
            <div className="text-center py-16 bg-surface border border-border rounded-2xl">
              <Users className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-white font-medium">Queue is empty</p>
              <p className="text-muted text-sm">Add a person to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {waiting.map((token, idx) => (
                <div key={token.id}
                  className={`bg-surface border rounded-xl p-4 transition-all animate-slide-in ${idx === 0 ? 'border-accent/40 shadow shadow-accent/10' : 'border-border hover:border-border/80'}`}>
                  <div className="flex items-center gap-3">
                    {/* Position badge */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${idx === 0 ? 'bg-accent text-white' : 'bg-bg text-muted'}`}>
                      {token.position}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-white truncate">{token.person_name}</span>
                        {token.priority === 1 && (
                          <span className="flex items-center gap-1 text-xs bg-warning/20 text-warning border border-warning/30 px-1.5 py-0.5 rounded-lg">
                            <Crown className="w-3 h-3" /> VIP
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span className="font-mono">{token.token_number}</span>
                        {token.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{token.phone}</span>}
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(token.created_at)}</span>
                      </div>
                      {token.notes && <p className="text-xs text-muted/70 mt-1 italic truncate">{token.notes}</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => action(() => tokensApi.moveUp(token.id), token.id)}
                        disabled={idx === 0 || !!actionLoading}
                        className="p-1.5 text-muted hover:text-white disabled:opacity-30 rounded-lg transition-colors" title="Move up">
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button onClick={() => action(() => tokensApi.moveDown(token.id), token.id)}
                        disabled={idx === waiting.length - 1 || !!actionLoading}
                        className="p-1.5 text-muted hover:text-white disabled:opacity-30 rounded-lg transition-colors" title="Move down">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      {idx === 0 && (
                        <button onClick={() => action(() => tokensApi.serve(token.id), token.id)}
                          disabled={!!actionLoading}
                          className="p-1.5 text-success hover:text-success/80 disabled:opacity-30 rounded-lg transition-colors" title="Serve">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => action(() => tokensApi.cancel(token.id), token.id)}
                        disabled={!!actionLoading}
                        className="p-1.5 text-muted hover:text-danger disabled:opacity-30 rounded-lg transition-colors" title="Cancel">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* History tab */
          <div className="space-y-2">
            {history.length === 0 ? (
              <div className="text-center py-12 text-muted">No history yet</div>
            ) : history.map(token => (
              <div key={token.id} className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3 opacity-80">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${token.status === 'served' ? 'bg-success/20' : 'bg-danger/20'}`}>
                  {token.status === 'served' ? <CheckCircle className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-danger" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm">{token.person_name}</p>
                  <p className="text-xs text-muted font-mono">{token.token_number}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-medium ${token.status === 'served' ? 'text-success' : 'text-danger'}`}>
                    {token.status}
                  </p>
                  {token.wait_time_seconds && (
                    <p className="text-xs text-muted">{formatWait(token.wait_time_seconds)} wait</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Token Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-in">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-white text-lg">Add to Queue</h3>
              <button onClick={() => setShowAdd(false)} className="text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={addToken} className="space-y-4">
              <div>
                <label className="block text-sm text-muted mb-1.5">Name *</label>
                <input value={form.person_name} onChange={e => setForm(f => ({ ...f, person_name: e.target.value }))}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-white placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
                  placeholder="Person's name" required autoFocus />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1.5">Phone (optional)</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-white placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
                  placeholder="+91 ..." />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1.5">Notes (optional)</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-white placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
                  placeholder="Special requirements..." />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.checked }))}
                  className="w-4 h-4 accent-warning rounded" />
                <span className="text-sm text-white flex items-center gap-1.5"><Crown className="w-4 h-4 text-warning" /> VIP / Priority</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-border text-muted hover:text-white rounded-xl py-2.5 text-sm transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={adding}
                  className="flex-1 bg-accent hover:bg-accentHover disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
                  {adding ? 'Adding...' : 'Add to Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
