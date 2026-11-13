import { useState, useEffect } from 'react'
import { analytics } from '../api'
import type { Analytics } from '../api'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend
} from 'recharts'
import { TrendingUp, Users, CheckCircle, XCircle, Clock, ArrowLeft, BarChart2 } from 'lucide-react'

interface Props { onBack: () => void }

function formatWait(secs: number) {
  if (!secs) return '—'
  if (secs < 60) return `${secs}s`
  return `${Math.round(secs / 60)}m`
}

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6']

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-xl p-3 shadow-xl text-xs">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

export default function AnalyticsDashboard({ onBack }: Props) {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    analytics.get().then(r => { setData(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-muted animate-pulse">Loading analytics...</div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <p className="text-muted">Failed to load analytics.</p>
    </div>
  )

  const { summary, queueStats, hourlyTrend } = data

  const statCards = [
    { label: 'Total Queues', value: summary.totalQueues, icon: BarChart2, color: 'text-accent' },
    { label: 'Total Tokens', value: summary.totalTokens, icon: Users, color: 'text-warning' },
    { label: 'Served', value: summary.served, icon: CheckCircle, color: 'text-success' },
    { label: 'Cancelled', value: summary.cancelled, icon: XCircle, color: 'text-danger' },
    { label: 'Waiting Now', value: summary.waiting, icon: Users, color: 'text-accent' },
    { label: 'Avg Wait Time', value: formatWait(summary.avgWaitSeconds), icon: Clock, color: 'text-warning' },
  ]

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-surface border-b border-border sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 text-muted hover:text-white rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-bold text-white">Analytics</h1>
              <p className="text-xs text-muted">Queue performance overview</p>
            </div>
          </div>
          <TrendingUp className="w-5 h-5 text-accent" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {statCards.map(s => (
            <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted">{s.label}</p>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Queue stats bar chart */}
        {queueStats.length > 0 && (
          <div className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-accent" /> Tokens per Queue
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={queueStats} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                <Bar dataKey="waiting" name="Waiting" radius={[4,4,0,0]} fill="#6366f1">
                  {queueStats.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
                <Bar dataKey="served" name="Served" radius={[4,4,0,0]} fill="#10b981" />
                <Bar dataKey="cancelled" name="Cancelled" radius={[4,4,0,0]} fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Hourly trend */}
        {hourlyTrend.length > 0 && (
          <div className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" /> Last 24 Hours Activity
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={hourlyTrend} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                <Line type="monotone" dataKey="tokens_added" name="Added" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
                <Line type="monotone" dataKey="served" name="Served" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Per-queue avg wait */}
        {queueStats.some((q: any) => q.avg_wait > 0) && (
          <div className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning" /> Average Wait Time per Queue
            </h2>
            <div className="space-y-3">
              {queueStats.filter((q: any) => q.avg_wait > 0).map((q: any, i: number) => {
                const pct = Math.min(100, (q.avg_wait / 3600) * 100)
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white">{q.name}</span>
                      <span className="text-warning font-mono">{formatWait(Math.round(q.avg_wait))}</span>
                    </div>
                    <div className="h-2 bg-bg rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-accent to-warning rounded-full transition-all"
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {queueStats.length === 0 && (
          <div className="text-center py-16 bg-surface border border-border rounded-2xl">
            <BarChart2 className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-white font-medium">No data yet</p>
            <p className="text-muted text-sm">Create queues and add tokens to see analytics</p>
          </div>
        )}
      </main>
    </div>
  )
}
