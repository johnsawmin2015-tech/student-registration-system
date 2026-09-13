import Link from 'next/link'

export default function ForbiddenPage() {
  return (
    <section className="card card-body">
      <p className="eyebrow">Access denied</p>
      <h1>This area is restricted</h1>
      <p className="muted">
        Your signed-in role does not include the required permission. The denied operation may be
        recorded in the audit trail.
      </p>
      <Link className="button" href="/dashboard">
        Return to dashboard
      </Link>
    </section>
  )
}
