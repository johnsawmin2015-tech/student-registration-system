import type { Metadata } from 'next'

import { markAllNotificationsReadAction, markNotificationReadAction } from '@/app/actions'
import { EmptyState, PageHeader, StatusBadge } from '@/components/ums/views'
import { requireCurrentUser } from '@/lib/server/auth'
import { getRepository } from '@/lib/server/repositories'

export const metadata: Metadata = { title: 'Notifications' }

export default async function NotificationsPage() {
  const actor = await requireCurrentUser('records:read')
  const rows = await (await getRepository()).notifications(actor)
  const unread = rows.filter((row) => !row.read).length
  const mayUpdate = actor.permissions.includes('notifications:write')
  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Account-scoped registration, waitlist, and operational notices."
        actions={
          unread && mayUpdate ? (
            <form action={markAllNotificationsReadAction}>
              <button className="button secondary" type="submit">
                Mark all read
              </button>
            </form>
          ) : undefined
        }
      />
      <section className="card">
        {rows.length ? (
          <div className="stack card-body">
            {rows.map((notification) => (
              <article key={notification.id} className={notification.read ? '' : 'callout'}>
                <div className="inline-actions">
                  <StatusBadge value={notification.level} />
                  {notification.read ? (
                    <span className="muted">Read</span>
                  ) : (
                    <strong>Unread</strong>
                  )}
                </div>
                <h2 style={{ marginTop: '.6rem', marginBottom: '.25rem' }}>{notification.title}</h2>
                <p>{notification.message}</p>
                <p className="muted">
                  <time dateTime={notification.createdAt}>
                    {new Date(notification.createdAt).toLocaleString('en-US')}
                  </time>
                </p>
                {notification.read || !mayUpdate ? null : (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <button className="button secondary compact" type="submit">
                      Mark as read
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No notifications">
            New account-scoped notices will appear here.
          </EmptyState>
        )}
      </section>
    </>
  )
}
