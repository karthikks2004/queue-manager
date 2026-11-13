import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { X, CheckCircle2, AlertTriangle } from 'lucide-react'

/** Ticket-shaped mark with punched notches. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M7 4h18a3 3 0 0 1 3 3v5a4 4 0 0 0 0 8v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5a4 4 0 0 0 0-8V7a3 3 0 0 1 3-3Z"
        fill="#FFB224"
      />
      <path d="M11.5 11h9M11.5 16h9M11.5 21h5" stroke="#0B0E13" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo />
      <span className="text-xl font-bold tracking-tight">QueueFlow</span>
    </div>
  )
}

export function TopBar({ left, right, wide = false }: { left: ReactNode; right?: ReactNode; wide?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className={`mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6 ${wide ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <div className="flex min-w-0 items-center gap-3">{left}</div>
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      </div>
    </header>
  )
}

export function LiveDot({ label = 'Live' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
      </span>
      {label}
    </span>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="animate-slide-in panel w-full max-w-md p-6 shadow-2xl shadow-black/50">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="icon-btn -mr-2" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  title, body, confirmLabel, busy, onConfirm, onClose,
}: { title: string; body: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-6 text-sm leading-relaxed text-muted">{body}</p>
      <div className="flex gap-3">
        <button className="btn btn-ghost flex-1" onClick={onClose}>Keep it</button>
        <button className="btn btn-danger flex-1" onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

type ToastKind = 'ok' | 'err'
export function toast(message: string, kind: ToastKind = 'ok') {
  window.dispatchEvent(new CustomEvent('qf-toast', { detail: { message, kind, id: Date.now() + Math.random() } }))
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; kind: ToastKind }[]>([])
  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent).detail
      setItems((prev) => [...prev, t])
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 3200)
    }
    window.addEventListener('qf-toast', onToast)
    return () => window.removeEventListener('qf-toast', onToast)
  }, [])
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="animate-slide-in pointer-events-auto flex items-center gap-2.5 rounded-xl border border-line bg-raised px-4 py-3 text-sm shadow-xl shadow-black/40">
          {t.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-mint" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-coral" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

/** Half-circle punch-outs used on ticket-style cards. */
export function Notch({ className = '' }: { className?: string }) {
  return <span className={`absolute h-4 w-4 rounded-full border border-line bg-bg ${className}`} aria-hidden="true" />
}

export function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`border-t border-line py-6 text-center text-xs text-muted ${className}`}>
      © 2026 QueueFlow · Designed and built by Karthik K S
    </footer>
  )
}
