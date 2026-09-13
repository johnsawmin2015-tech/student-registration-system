import type { ReactNode } from 'react'

import type { DataModeLabel } from '@/lib/server/contracts'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

export function DataContextBanner({
  mode,
  referenceTime,
  semester,
}: {
  mode: DataModeLabel
  referenceTime: string
  semester: string
}) {
  return (
    <div className="data-context" role="note">
      <strong>{mode}.</strong> Current term: {semester}. Reference time:{' '}
      <time dateTime={referenceTime}>
        {new Date(referenceTime).toLocaleString('en-US', { timeZone: 'UTC' })} UTC
      </time>
      .
    </div>
  )
}

export function FlashMessage({ notice, error }: { notice?: string; error?: string }) {
  if (error)
    return (
      <div className="flash error" role="alert">
        {error}
      </div>
    )
  if (notice)
    return (
      <div className="flash success" role="status">
        {notice}
      </div>
    )
  return null
}

export function StatusBadge({ value }: { value: string }) {
  return <span className={`status ${value.toLowerCase()}`}>{value.replaceAll('_', ' ')}</span>
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  )
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail?: string
}) {
  return (
    <article className="card metric">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {detail ? <span className="muted">{detail}</span> : null}
    </article>
  )
}
