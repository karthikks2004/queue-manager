// SQLite stores UTC timestamps without a timezone marker ("2026-11-13 12:30:00").
// Parse them as UTC so wait times and "x ago" labels are not skewed by the viewer's timezone.
export function parseDate(s: string): Date {
  if (!s) return new Date()
  const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(s)
  return new Date(hasZone ? s : s.replace(' ', 'T') + 'Z')
}

export function timeAgo(s: string): string {
  const diff = Math.max(0, Date.now() - parseDate(s).getTime())
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export function formatDuration(secs?: number | null): string {
  if (!secs || secs < 0) return '—'
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m`
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

export function errorMessage(err: any, fallback = 'Something went wrong. Please try again.'): string {
  if (err?.response?.data?.error) return err.response.data.error
  if (err?.code === 'ERR_NETWORK' || !err?.response) return 'Cannot reach the server. Check your connection and try again.'
  return fallback
}
