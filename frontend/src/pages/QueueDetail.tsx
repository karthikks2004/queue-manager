import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react'
import { tokens as tokensApi } from '../api'
import type { Queue, Token } from '../api'
import {
  ArrowLeft, Plus, Tv, ChevronUp, ChevronDown, Check, X, Crown, Phone, Clock, Users, History, Megaphone,
} from 'lucide-react'
import { TopBar, Modal, Notch, LiveDot, Footer, toast } from '../ui'
import DisplayBoard from '../DisplayBoard'
import { timeAgo, formatDuration, errorMessage, parseDate } from '../lib'

interface Props { queue: Queue; token: string; onBack: () => void }

export default function QueueDetail({ queue, token, onBack }: Props) {
  const [waiting, setWaiting] = useState<Token[]>([])
  const [history, setHistory] = useState<Token[]>([])
  const [tab, setTab] = useState<'queue' | 'history'>('queue')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showBoard, setShowBoard] = useState(false)
  const [form, setForm] = useState({ person_name: '', phone: '', priority: false, notes: '' })
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const rowRefs = useRef(new Map<number, HTMLLIElement>())
  const lastTops = useRef(new Map<number, number>())

  // FLIP: when the order changes, slide each row from its old spot to the new one.
  useLayoutEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const next = new Map<number, number>()
    rowRefs.current.forEach((el, id) => {
      const top = el.getBoundingClientRect().top
      next.set(id, top)
      const prev = lastTops.current.get(id)
      if (!reduce && prev !== undefined && Math.abs(prev - top) > 1) {
        el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
      }
    })
    lastTops.current = next
  }, [waiting])

  const load = useCallback(async () => {
    try {
      const [w, h] = await Promise.all([tokensApi.list(queue.id), tokensApi.history(queue.id)])
      setWaiting(w.data)
      setHistory(h.data)
    } catch {}
    setLoading(false)
  }, [queue.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const prev = document.title
    document.title = `${queue.name} · QueueFlow`
    return () => { document.title = prev }
  }, [queue.name])

  // Live updates: refresh when anything changes on the server.
  useEffect(() => {
    let es: EventSource | null = null
    try {
      es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
      const refresh = () => load()
      ;['token_added', 'queue_changed', 'token_served', 'token_cancelled'].forEach((ev) => es!.addEventListener(ev, refresh))
    } catch {}
    return () => es?.close()
  }, [token, load])

  const addToken = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.person_name.trim()) return
    setAdding(true)
    try {
      await tokensApi.add(queue.id, { ...form, person_name: form.person_name.trim(), priority: form.priority ? 1 : 0 })
      toast(`${form.person_name.trim()} added to the queue`)
      setForm({ person_name: '', phone: '', priority: false, notes: '' })
      setShowAdd(false)
      await load()
    } catch (err) {
      toast(errorMessage(err), 'err')
    }
    setAdding(false)
  }

  const run = async (fn: () => Promise<any>, id: number, okMsg?: string) => {
    setBusy(id)
    try {
      await fn()
      if (okMsg) toast(okMsg)
      await load()
    } catch (err) {
      toast(errorMessage(err), 'err')
    }
    setBusy(null)
  }

  const top = waiting[0]
  const lastServed = history.find((t) => t.status === 'served') ?? null

  // Typical gap between served people, from the latest served tokens (hidden until there is real data).
  const serveTimes = history
    .filter((t) => t.status === 'served' && t.served_at)
    .map((t) => parseDate(t.served_at as string).getTime())
    .sort((a, b) => a - b)
    .slice(-10)
  const gaps = serveTimes.slice(1).map((t, i) => t - serveTimes[i]).filter((g) => g > 30_000 && g < 3 * 3600_000)
  const gapMs = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
  const eta = (pos: number) => (gapMs ? `about ${formatDuration(Math.round((gapMs * (pos - 1)) / 1000))} to go` : '')
  const served = history.filter((t) => t.status === 'served').length
  const cancelled = history.filter((t) => t.status === 'cancelled').length

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        left={
          <>
            <button onClick={onBack} className="icon-btn -ml-2" aria-label="Back to queues"><ArrowLeft className="h-5 w-5" /></button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight">{queue.name}</h1>
              {queue.description && <p className="truncate text-xs text-muted">{queue.description}</p>}
            </div>
          </>
        }
        right={
          <>
            <button onClick={() => setShowBoard(true)} className="btn btn-ghost" title="Open the display board">
              <Tv className="h-4 w-4" /> <span className="hidden sm:inline">Display board</span>
            </button>
            <button onClick={() => setShowAdd(true)} className="btn btn-amber">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add person</span><span className="sm:hidden">Add</span>
            </button>
          </>
        }
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        {/* Now-serving board */}
        <section className="panel relative overflow-hidden p-5 sm:p-7" aria-label="Next in line">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-2 text-sm text-muted"><Megaphone className="h-4 w-4 text-amber" /> Next at the counter</p>
              <div className="rounded-xl border border-line bg-[#07090c] px-5 py-4">
                {top ? (
                  <p key={top.id} className="led animate-tick break-all text-4xl font-bold leading-none sm:text-6xl">{top.token_number}</p>
                ) : (
                  <p className="led text-4xl font-bold leading-none opacity-40 sm:text-6xl">– – –</p>
                )}
              </div>
              <div className="mt-3 min-h-[2.5rem]">
                {top ? (
                  <>
                    <p className="truncate text-xl font-semibold">{top.person_name}
                      {top.priority === 1 && <Crown className="ml-2 inline h-4 w-4 -translate-y-px text-amber" aria-label="VIP" />}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-muted"><Clock className="h-3.5 w-3.5" /> Waiting {timeAgo(top.created_at).replace(' ago', '')}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted">The line is clear. Add someone to get started.</p>
                )}
              </div>
            </div>
            <button
              onClick={() => top && run(() => tokensApi.serve(top.id), top.id, `${top.person_name} served`)}
              disabled={!top || busy === top?.id}
              className="btn btn-mint w-full shrink-0 px-8 py-4 text-base sm:w-auto"
            >
              <Check className="h-5 w-5" /> {top && busy === top.id ? 'Serving…' : 'Serve next'}
            </button>
          </div>

          <dl className="relative mt-6 flex gap-8 border-t border-dashed border-line pt-4 text-sm">
            {[
              { k: 'Waiting', v: waiting.length, c: 'text-amber' },
              { k: 'Served', v: served, c: 'text-mint' },
              { k: 'Cancelled', v: cancelled, c: 'text-coral' },
            ].map((x) => (
              <div key={x.k} className="flex items-baseline gap-2">
                <dd className={`tabular text-2xl font-semibold ${x.c}`}>{x.v}</dd>
                <dt className="text-muted">{x.k}</dt>
              </div>
            ))}
            <div className="ml-auto hidden self-center sm:block"><LiveDot /></div>
          </dl>
        </section>

        {/* Tabs */}
        <div className="mb-5 mt-8 flex gap-6 border-b border-line" role="tablist">
          <button role="tab" aria-selected={tab === 'queue'} className="tab" onClick={() => setTab('queue')}>
            <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> In line ({waiting.length})</span>
          </button>
          <button role="tab" aria-selected={tab === 'history'} className="tab" onClick={() => setTab('history')}>
            <span className="inline-flex items-center gap-2"><History className="h-4 w-4" /> History</span>
          </button>
        </div>

        {tab === 'queue' ? (
          loading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="panel h-20 animate-pulse-soft" />)}</div>
          ) : waiting.length === 0 ? (
            <div className="panel px-6 py-14 text-center">
              <p className="text-lg font-semibold">Nobody is waiting</p>
              <p className="mt-1 text-sm text-muted">Use “Add person” to put the first one in line.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {waiting.map((t, idx) => {
                const first = idx === 0
                return (
                  <li
                    key={t.id}
                    ref={(el) => { if (el) rowRefs.current.set(t.id, el); else rowRefs.current.delete(t.id) }}
                    style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                    className={`animate-slide-in relative flex items-stretch overflow-hidden rounded-xl border bg-surface transition ${first ? 'border-amber/50' : 'border-line hover:border-muted/40'}`}
                  >
                    <div className={`flex w-16 shrink-0 items-center justify-center font-mono text-2xl font-bold sm:w-20 ${first ? 'text-amber' : 'text-muted'}`}>
                      {t.position}
                    </div>
                    <div className="relative w-0 self-stretch border-l border-dashed border-line">
                      <Notch className="-left-2 -top-2" />
                      <Notch className="-bottom-2 -left-2" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2">
                          <span className="truncate font-semibold">{t.person_name}</span>
                          {t.priority === 1 && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber/15 px-1.5 py-0.5 text-xs font-medium text-amber">
                              <Crown className="h-3 w-3" /> VIP
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                          <span className="font-mono">{t.token_number}</span>
                          {t.phone && <a href={`tel:${t.phone.replace(/[^0-9+]/g, '')}`} className="inline-flex items-center gap-1 hover:text-ink"><Phone className="h-3 w-3" />{t.phone}</a>}
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(t.created_at)}</span>
                          {idx > 0 && eta(t.position) && <span className="text-sky">{eta(t.position)}</span>}
                        </p>
                        {t.notes && <p className="mt-1 truncate text-xs italic text-muted/80">“{t.notes}”</p>}
                      </div>
                      <div className="flex shrink-0 items-center">
                        <button className="icon-btn" title="Move up" aria-label="Move up" disabled={first || busy !== null}
                          onClick={() => run(() => tokensApi.moveUp(t.id), t.id)}><ChevronUp className="h-4 w-4" /></button>
                        <button className="icon-btn" title="Move down" aria-label="Move down" disabled={idx === waiting.length - 1 || busy !== null}
                          onClick={() => run(() => tokensApi.moveDown(t.id), t.id)}><ChevronDown className="h-4 w-4" /></button>
                        <button className="icon-btn hover:!text-coral" title="Cancel token" aria-label="Cancel token" disabled={busy !== null}
                          onClick={() => run(() => tokensApi.cancel(t.id), t.id, `${t.person_name} removed from the line`)}><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        ) : history.length === 0 ? (
          <div className="panel px-6 py-14 text-center text-sm text-muted">Nothing here yet. Served and cancelled tokens will show up here.</div>
        ) : (
          <ul className="space-y-2">
            {history.map((t) => (
              <li key={t.id} className="flex items-center gap-4 rounded-xl border border-line bg-surface/60 px-4 py-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${t.status === 'served' ? 'bg-mint/15 text-mint' : 'bg-coral/15 text-coral'}`}>
                  {t.status === 'served' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.person_name}</p>
                  <p className="font-mono text-xs text-muted">{t.token_number}</p>
                </div>
                <div className="text-right text-xs">
                  <p className={t.status === 'served' ? 'text-mint' : 'text-coral'}>{t.status === 'served' ? 'Served' : 'Cancelled'}</p>
                  {t.status === 'served' && <p className="text-muted">{formatDuration(t.wait_time_seconds)} wait</p>}
                  {t.served_at && <p className="text-muted/70">{timeAgo(t.served_at)}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />

      {showBoard && (
        <DisplayBoard queueName={queue.name} nowServing={lastServed} upNext={waiting.slice(0, 5)} waitingCount={waiting.length} onClose={() => setShowBoard(false)} />
      )}

      {showAdd && (
        <Modal title="Add to queue" onClose={() => setShowAdd(false)}>
          <form onSubmit={addToken} className="space-y-4">
            <div>
              <label htmlFor="pname" className="mb-1.5 block text-sm text-muted">Name</label>
              <input id="pname" className="input" value={form.person_name} autoFocus required maxLength={80}
                onChange={(e) => setForm((f) => ({ ...f, person_name: e.target.value }))} placeholder="Who is joining?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pphone" className="mb-1.5 block text-sm text-muted">Phone <span className="text-muted/60">(optional)</span></label>
                <input id="pphone" className="input" value={form.phone} inputMode="tel"
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91 …" />
              </div>
              <div>
                <label htmlFor="pnotes" className="mb-1.5 block text-sm text-muted">Note <span className="text-muted/60">(optional)</span></label>
                <input id="pnotes" className="input" value={form.notes} maxLength={120}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Anything to know" />
              </div>
            </div>
            <button
              type="button" role="switch" aria-checked={form.priority}
              onClick={() => setForm((f) => ({ ...f, priority: !f.priority }))}
              className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-3 text-left transition ${form.priority ? 'border-amber/50 bg-amber/10' : 'border-line'}`}
            >
              <span className="flex items-center gap-2 text-sm"><Crown className={`h-4 w-4 ${form.priority ? 'text-amber' : 'text-muted'}`} /> Mark as VIP</span>
              <span className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${form.priority ? 'bg-amber' : 'bg-line'}`}>
                <span className={`h-4 w-4 rounded-full bg-bg transition ${form.priority ? 'translate-x-4' : ''}`} />
              </span>
            </button>
            <div className="flex gap-3 pt-1">
              <button type="button" className="btn btn-ghost flex-1" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-amber flex-1" disabled={adding}>{adding ? 'Adding…' : 'Add to queue'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
