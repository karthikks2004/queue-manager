import { useEffect, useRef, useState } from 'react'
import { X, Maximize2, Volume2, VolumeX, Crown } from 'lucide-react'
import type { Token } from './api'

interface Props {
  queueName: string
  nowServing: Token | null
  upNext: Token[]
  waitingCount: number
  onClose: () => void
}

/** Two-tone chime, generated in the browser (no audio file needed). */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.28)
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.28 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.28 + 0.9)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.28)
      osc.stop(now + i * 0.28 + 1)
    })
    setTimeout(() => ctx.close(), 1600)
  } catch { /* audio not available */ }
}

export default function DisplayBoard({ queueName, nowServing, upNext, waitingCount, onClose }: Props) {
  const [sound, setSound] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const prevId = useRef<number | null | undefined>(undefined)
  const [flash, setFlash] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // New token called: flash the board and ring the bell (if sound is on).
  const id = nowServing?.id ?? null
  useEffect(() => {
    if (prevId.current !== undefined && prevId.current !== id && id !== null) {
      setFlash((n) => n + 1)
      if (sound) chime()
    }
    prevId.current = id
  }, [id, sound])

  const goFull = () => {
    try { document.documentElement.requestFullscreen?.() } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#05070a] text-ink" role="dialog" aria-modal="true" aria-label={`Display board for ${queueName}`}>
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(255,178,36,0.07) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

      <header className="relative flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <div className="min-w-0">
          <p className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{queueName}</p>
          <p className="text-sm text-muted">{waitingCount} waiting</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="led mr-3 hidden text-2xl tabular sm:block">
            {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button className="icon-btn" onClick={() => setSound((s) => !s)} aria-label={sound ? 'Mute bell' : 'Turn bell on'} title={sound ? 'Bell on' : 'Bell off'}>
            {sound ? <Volume2 className="h-5 w-5 text-amber" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button className="icon-btn" onClick={goFull} aria-label="Full screen" title="Full screen"><Maximize2 className="h-5 w-5" /></button>
          <button className="icon-btn" onClick={onClose} aria-label="Close display board" title="Close (Esc)"><X className="h-5 w-5" /></button>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col gap-8 px-6 pb-8 sm:px-10 lg:flex-row lg:gap-12">
        {/* Now serving */}
        <section className="flex flex-1 flex-col" aria-live="polite">
          <p className="mb-3 text-lg text-muted sm:text-xl">Now serving</p>
          <div key={flash} className={`rounded-3xl border border-amber/30 bg-black px-6 py-8 sm:px-10 sm:py-12 ${flash ? 'animate-tick' : ''}`}>
            {nowServing ? (
              <>
                <p className="led break-all text-[clamp(3.5rem,13vw,11rem)] font-bold leading-none">{nowServing.token_number}</p>
                <p className="mt-6 truncate text-2xl font-medium sm:text-4xl">{nowServing.person_name}</p>
              </>
            ) : (
              <p className="led text-[clamp(3rem,11vw,9rem)] font-bold leading-none opacity-30">– – –</p>
            )}
          </div>
        </section>

        {/* Up next */}
        <aside className="lg:w-[34%]">
          <p className="mb-3 text-lg text-muted sm:text-xl">Up next</p>
          {upNext.length === 0 ? (
            <p className="rounded-2xl border border-line px-5 py-8 text-lg text-muted">No one is waiting.</p>
          ) : (
            <ol className="space-y-3">
              {upNext.map((t, i) => (
                <li key={t.id} className={`flex items-center gap-4 rounded-2xl border px-5 py-4 ${i === 0 ? 'border-amber/50 bg-amber/5' : 'border-line bg-surface/40'}`}>
                  <span className={`tabular w-8 font-mono text-xl ${i === 0 ? 'text-amber' : 'text-muted'}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-2xl font-semibold sm:text-3xl">{t.token_number}</span>
                    <span className="block truncate text-sm text-muted">{t.person_name}</span>
                  </span>
                  {t.priority === 1 && <Crown className="h-5 w-5 shrink-0 text-amber" aria-label="VIP" />}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </main>
    </div>
  )
}
