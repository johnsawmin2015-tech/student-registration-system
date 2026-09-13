import type { Metadata } from 'next'

import { EmptyState, PageHeader, StatusBadge } from '@/components/ums/views'
import { requireCurrentUser } from '@/lib/server/auth'
import { getRepository } from '@/lib/server/repositories'

export const metadata: Metadata = { title: 'Semesters' }

export default async function SemestersPage() {
  const actor = await requireCurrentUser('records:read')
  const rows = await (await getRepository()).semesters(actor)
  return (
    <>
      <PageHeader
        eyebrow="Academic calendar"
        title="Semesters"
        description="Term dates and bounded registration windows. Only one non-archived semester can be current."
      />
      <section className="card">
        {rows.length ? (
          <div
            className="table-scroll"
            role="region"
            aria-label="Academic semesters table"
            tabIndex={0}
          >
            <table>
              <caption>Configured academic semesters</caption>
              <thead>
                <tr>
                  <th scope="col">Semester</th>
                  <th scope="col">Teaching dates</th>
                  <th scope="col">Registration window</th>
                  <th scope="col">Current</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((semester) => (
                  <tr key={semester.id}>
                    <td>
                      <strong>{semester.name}</strong>
                    </td>
                    <td>
                      <time dateTime={semester.startDate}>{semester.startDate}</time> –{' '}
                      <time dateTime={semester.endDate}>{semester.endDate}</time>
                    </td>
                    <td>
                      <time dateTime={semester.registrationOpensAt}>
                        {new Date(semester.registrationOpensAt).toLocaleString('en-US')}
                      </time>
                      <br />
                      <span className="muted">
                        through {new Date(semester.registrationClosesAt).toLocaleString('en-US')}
                      </span>
                    </td>
                    <td>{semester.isCurrent ? 'Yes' : 'No'}</td>
                    <td>
                      <StatusBadge value={semester.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No semesters configured">
            An administrator must configure an academic semester.
          </EmptyState>
        )}
      </section>
    </>
  )
}
