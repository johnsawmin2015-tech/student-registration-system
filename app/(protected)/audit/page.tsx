import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState, PageHeader, StatusBadge } from '@/components/ums/views'
import { requireCurrentUser } from '@/lib/server/auth'
import { getRepository } from '@/lib/server/repositories'

export const metadata: Metadata = { title: 'Audit' }

export default async function AuditPage() {
  const actor = await requireCurrentUser('audit:read')
  const rows = await (await getRepository()).audit(actor)
  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Audit events"
        description="Append-only security and domain event evidence with privacy-minimized source metadata."
        actions={
          actor.permissions.includes('exports:create') ? (
            <Link className="button secondary" href="/api/exports/audit">
              Export CSV
            </Link>
          ) : undefined
        }
      />
      <div className="callout" role="note">
        Audit rows can be appended but are not editable through the application. Database privileges
        must also deny update and delete in production.
      </div>
      <section className="card">
        {rows.length ? (
          <div className="table-scroll" role="region" aria-label="Audit events table" tabIndex={0}>
            <table>
              <caption>Most recent {rows.length} authorized audit events</caption>
              <thead>
                <tr>
                  <th scope="col">Occurred</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Entity</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Request</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <time dateTime={event.createdAt}>
                        {new Date(event.createdAt).toLocaleString('en-US')}
                      </time>
                    </td>
                    <td>
                      {event.actorName}
                      <br />
                      <span className="muted">{event.actorRole}</span>
                    </td>
                    <td>
                      <strong>{event.action}</strong>
                    </td>
                    <td>
                      {event.entityType}
                      <br />
                      <span className="muted">{event.entityId}</span>
                    </td>
                    <td>
                      <StatusBadge value={event.outcome} />
                    </td>
                    <td>{event.summary}</td>
                    <td>
                      <code>{event.requestId.slice(0, 8)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No audit events">
            Authorized events will appear after system activity.
          </EmptyState>
        )}
      </section>
    </>
  )
}
