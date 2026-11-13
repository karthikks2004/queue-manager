import { useState, useEffect } from 'react'
import { analytics } from '../api'
import type { Analytics } from '../api'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { formatDuration, parseDate } from '../lib'

const C = { amber: '#FFB224', mint: '#38D9A0', coral: '#FF6B5B', sky: '#6CB6FF', grid: '#252C38', tick: '#8A93A3' }

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-xl shadow-black/40">
      {label && <p className="mb-1 text-muted">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          {p.name}: <span className="font-mono font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} /> {i.label}
        </span>
      ))}
    </div>
  )
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    analytics.get().then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="panel h-72 animate-pulse-soft" />
  if (!data) return <div className="panel px-6 py-14 text-center text-sm text-muted">Could not load analytics. Try refreshing the page.</div>

  const { summary: s, queueStats, hourlyTrend } = data
  const lengthTrend = (data.lengthTrend || []).map((p) => ({
    hour: parseDate(p.at).toLocaleTimeString([], { hour: 'numeric' }),
    length: p.length,
  }))
  const peak = lengthTrend.reduce((m, p) => Math.max(m, p.length), 0)
  const nowLen = lengthTrend.length ? lengthTrend[lengthTrend.length - 1].length : 0
  const finished = s.served + s.cancelled
  const serveRate = finished ? Math.round((s.served / finished) * 100) : 0

  const tiles = [
    { label: 'Queues', value: s.totalQueues, tone: 'text-ink' },
    { label: 'Tokens issued', value: s.totalTokens, tone: 'text-ink' },
    { label: 'Waiting now', value: s.waiting, tone: 'text-amber' },
    { label: 'Served', value: s.served, tone: 'text-mint' },
    { label: 'Cancelled', value: s.cancelled, tone: 'text-coral' },
    { label: 'Average wait', value: formatDuration(s.avgWaitSeconds), tone: 'text-ink' },
  ]

  const mix = [
    { name: 'Waiting', value: s.waiting, fill: C.amber },
    { name: 'Served', value: s.served, fill: C.mint },
    { name: 'Cancelled', value: s.cancelled, fill: C.coral },
  ].filter((m) => m.value > 0)

  // Server sends UTC hour buckets; show the last 24 local hours, empty hours as zero.
  const byHour = new Map<number, { tokens_added: number; served: number }>()
  hourlyTrend.forEach((h) => {
    const d = parseDate(h.hour)
    d.setMinutes(0, 0, 0)
    byHour.set(d.getTime(), h)
  })
  const trend = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.now() - (23 - i) * 3600_000)
    d.setMinutes(0, 0, 0)
    const h = byHour.get(d.getTime())
    return { hour: d.toLocaleTimeString([], { hour: 'numeric' }), tokens_added: h?.tokens_added ?? 0, served: h?.served ?? 0 }
  })
  const hasActivity = hourlyTrend.length > 0

  const withWait = queueStats.filter((q: any) => q.avg_wait > 0)
  const maxWait = Math.max(1, ...withWait.map((q: any) => q.avg_wait))

  if (s.totalQueues === 0) {
    return (
      <div className="panel px-6 py-16 text-center">
        <p className="text-lg font-semibold">No numbers yet</p>
        <p className="mt-1 text-sm text-muted">Create a queue and add a few people to see analytics here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Analytics</h1>
        <p className="mt-1 text-sm text-muted">How your queues are performing.</p>
      </div>

      <div className="panel grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t, i) => (
          <div key={t.label} className={`px-5 py-5 ${i > 0 ? 'lg:border-l lg:border-line' : ''} ${i % 2 === 1 ? 'border-l border-line lg:border-l' : ''} ${i > 1 ? 'border-t border-line lg:border-t-0' : ''}`}>
            <p className="text-sm text-muted">{t.label}</p>
            <p className={`tabular mt-1 text-3xl font-semibold tracking-tight ${t.tone}`}>{t.value}</p>
          </div>
        ))}
      </div>

      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Queue length, last 24 hours</h2>
            <p className="text-sm text-muted">People waiting across all your queues at the end of each hour.</p>
          </div>
          <div className="flex gap-6 text-sm">
            <div><p className="text-muted">Now</p><p className="tabular text-2xl font-semibold text-amber">{nowLen}</p></div>
            <div><p className="text-muted">Peak</p><p className="tabular text-2xl font-semibold">{peak}</p></div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={lengthTrend} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="lenFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.amber} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C.amber} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="hour" tick={{ fill: C.tick, fontSize: 12 }} axisLine={false} tickLine={false} interval={3} />
            <YAxis tick={{ fill: C.tick, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTip />} />
            <Area type="stepAfter" dataKey="length" name="Waiting" stroke={C.amber} strokeWidth={2.5} fill="url(#lenFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">People per queue</h2>
            <Legend items={[{ label: 'Waiting', color: C.amber }, { label: 'Served', color: C.mint }, { label: 'Cancelled', color: C.coral }]} />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={queueStats} margin={{ top: 4, right: 4, left: -22, bottom: 0 }} barGap={3}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: C.tick, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.tick, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="waiting" name="Waiting" fill={C.amber} radius={[5, 5, 0, 0]} />
              <Bar dataKey="served" name="Served" fill={C.mint} radius={[5, 5, 0, 0]} />
              <Bar dataKey="cancelled" name="Cancelled" fill={C.coral} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel flex flex-col p-5">
          <h2 className="font-semibold">Outcome mix</h2>
          {mix.length ? (
            <>
              <div className="relative mx-auto mt-2 h-[190px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mix} dataKey="value" nameKey="name" innerRadius={62} outerRadius={84} paddingAngle={3} stroke="none">
                      {mix.map((m) => <Cell key={m.name} fill={m.fill} />)}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="tabular text-3xl font-semibold text-mint">{serveRate}%</span>
                  <span className="text-xs text-muted">served rate</span>
                </div>
              </div>
              <div className="mt-auto pt-2"><Legend items={mix.map((m) => ({ label: `${m.name} ${m.value}`, color: m.fill }))} /></div>
            </>
          ) : <p className="mt-6 text-sm text-muted">No tokens yet.</p>}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Last 24 hours</h2>
            <Legend items={[{ label: 'Added', color: C.sky }, { label: 'Served', color: C.mint }]} />
          </div>
          {hasActivity ? (
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="hour" tick={{ fill: C.tick, fontSize: 12 }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fill: C.tick, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTip />} />
                <Line type="monotone" dataKey="tokens_added" name="Added" stroke={C.sky} strokeWidth={2.5} dot={{ r: 3, fill: C.sky, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="served" name="Served" stroke={C.mint} strokeWidth={2.5} dot={{ r: 3, fill: C.mint, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="py-16 text-center text-sm text-muted">No activity in the last 24 hours.</p>}
        </section>

        <section className="panel p-5">
          <h2 className="mb-4 font-semibold">Average wait by queue</h2>
          {withWait.length ? (
            <ul className="space-y-4">
              {withWait.map((q: any) => (
                <li key={q.id}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span>{q.name}</span>
                    <span className="font-mono text-amber">{formatDuration(Math.round(q.avg_wait))}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-bg">
                    <div className="h-full rounded-full bg-amber transition-all" style={{ width: `${Math.max(6, (q.avg_wait / maxWait) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="py-16 text-center text-sm text-muted">Serve a few people to see wait times.</p>}
        </section>
      </div>
    </div>
  )
}
