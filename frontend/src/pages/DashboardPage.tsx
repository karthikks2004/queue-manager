import { useState, useEffect, useCallback } from 'react'
import { queues as queuesApi, tokens as tokensApi, analytics as analyticsApi } from '../api'
import type { Queue, Token, Analytics } from '../api'
import { 
  Layers, LogOut, Plus, BarChart3, Users, CheckCircle, XCircle, 
  Clock, ChevronRight, RefreshCw, Trash2, Edit2, X, ArrowUpDown
} from 'lucide-react'
import QueueDetail from './QueueDetail'
import AnalyticsDashboard from './AnalyticsDashboard'

interface Props { username: string; token: string; onLogout: () => void }

export default function DashboardPage({ username, token, onLogout }: Props) {
  const [queues, setQueues] = useState<Queue[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [view, setView] = useState<'queues' | 'analytics'>('queues')
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newQueueName, setNewQueueName] = useState('')
  const [newQueueDesc, setNewQueueDesc] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

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
    // SSE
    const es = new EventSource(`/api/events?token=${token}`)
    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type !== 'connected') loadData()
    }
    return () => es.close()
  }, [token, loadData])

  const createQueue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newQueueName.trim()) return
    setCreating(true)
    try {
      const { data } = await queuesApi.create(newQueueName, newQueueDesc)
      setQueues(prev => [{ ...data, waiting_count: 0, served_count: 0, cancelled_count: 0 }, ...prev])
      setNewQueueName('')
      setNewQueueDesc('')
      setShowCreateModal(false)
      loadData()
    } catch {}
    setCreating(false)
  }

  const deleteQueue = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this queue and all its tokens?')) return
    await queuesApi.delete(id)
    setQueues(prev => prev.filter(q => q.id !== id))
    loadData()
  }

  if (selectedQueue) {
    return <QueueDetail
      queue={selectedQueue}
      onBack={() => { setSelectedQueue(null); loadData() }}
      onQueueUpdate={(q) => setSelectedQueue(q)}
    />
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="bg-surface border-b border-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
              <Layers className="w-4 h-4 text-accent" />
            </div>
            <span className="font-bold text-white text-lg">QueueFlow</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex gap-1 bg-bg rounded-xl p-1">
              {(['queues', 'analytics'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${view === v ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}>
                  {v === 'queues' ? 'Queues' : 'Analytics'}
                </button>
              ))}
            </div>
            <span className="text-muted text-sm hidden sm:block">{username}</span>
            <button onClick={onLogout} className="p-2 text-muted hover:text-white rounded-lg transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Mobile nav */}
        <div className="sm:hidden flex gap-1 bg-surface rounded-xl p-1 mb-6">
          {(['queues', 'analytics'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${view === v ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}>
              {v === 'queues' ? 'Queues' : 'Analytics'}
            </button>
          ))}
        </div>

        {view === 'analytics' ? (
          <AnalyticsDashboard onBack={() => {}} />
        ) : (
          <>
            {/* Stats row */}
            {analytics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Active Queues', value: analytics.summary.total_queues, icon: Layers, color: 'accent' },
                  { label: 'Waiting', value: analytics.summary.waiting, icon: Users, color: 'warning' },
                  { label: 'Served Today', value: analytics.summary.served, icon: CheckCircle, color: 'success' },
                  { label: 'Avg Wait', value: analytics.summary.avg_wait_seconds > 0 ? `${Math.round(analytics.summary.avg_wait_seconds / 60)}m` : '—', icon: Clock, color: 'accent' },
                ].map(stat => (
                  <div key={stat.label} className="bg-surface border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted">{stat.label}</span>
                      <stat.icon className={`w-4 h-4 text-${stat.color}`} />
                    </div>
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Queues header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Your Queues</h2>
              <div className="flex gap-2">
                <button onClick={loadData} className="p-2 text-muted hover:text-white rounded-lg transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 bg-accent hover:bg-accentHover text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                  <Plus className="w-4 h-4" /> New Queue
                </button>
              </div>
            </div>

            {/* Queue list */}
            {loading ? (
              <div className="text-center py-16 text-muted">Loading queues...</div>
            ) : queues.length === 0 ? (
              <div className="text-center py-16 bg-surface border border-border rounded-2xl">
                <Layers className="w-12 h-12 text-muted mx-auto mb-4" />
                <p className="text-white font-medium">No queues yet</p>
                <p className="text-muted text-sm mt-1">Create your first queue to get started</p>
                <button onClick={() => setShowCreateModal(true)}
                  className="mt-4 bg-accent hover:bg-accentHover text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors">
                  Create Queue
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {queues.map(queue => (
                  <div key={queue.id} onClick={() => setSelectedQueue(queue)}
                    className="bg-surface border border-border hover:border-accent/50 rounded-2xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-accent/5 group animate-slide-in">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
                        <ArrowUpDown className="w-5 h-5 text-accent" />
                      </div>
                      <button onClick={(e) => deleteQueue(queue.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted hover:text-danger rounded-lg transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <h3 className="font-semibold text-white mb-1">{queue.name}</h3>
                    {queue.description && <p className="text-muted text-xs mb-3 line-clamp-1">{queue.description}</p>}
                    <div className="flex items-center gap-3 mt-3">
                      <span className="flex items-center gap-1 text-xs">
                        <span className="w-2 h-2 rounded-full bg-warning animate-pulse-soft"></span>
                        <span className="text-warning font-medium">{queue.waiting_count}</span>
                        <span className="text-muted">waiting</span>
                      </span>
                      <span className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle className="w-3 h-3" />
                        {queue.served_count} served
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted ml-auto group-hover:text-accent transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Create Queue Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-in">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-white text-lg">Create New Queue</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-muted hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={createQueue} className="space-y-4">
              <div>
                <label className="block text-sm text-muted mb-1.5">Queue Name *</label>
                <input value={newQueueName} onChange={e => setNewQueueName(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-white placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
                  placeholder="e.g. Customer Support" required autoFocus />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1.5">Description (optional)</label>
                <input value={newQueueDesc} onChange={e => setNewQueueDesc(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-white placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
                  placeholder="Brief description" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)}
                  className="flex-1 border border-border text-muted hover:text-white rounded-xl py-2.5 text-sm transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={creating}
                  className="flex-1 bg-accent hover:bg-accentHover disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
                  {creating ? 'Creating...' : 'Create Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
