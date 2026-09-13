import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState, PageHeader, StatusBadge } from '@/components/ums/views'
import { requireCurrentUser } from '@/lib/server/auth'
import { firstParam, recordQuery, type PageSearchParams } from '@/lib/server/page-params'
import { getRepository } from '@/lib/server/repositories'

export const metadata: Metadata = { title: 'Faculty' }

export default async function FacultyPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams
  const actor = await requireCurrentUser('records:read')
  const rows = await (await getRepository()).faculty(actor, recordQuery(params))
  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Faculty"
        description="Faculty appointments, department assignments, office locations, and lifecycle status."
        actions={
          actor.permissions.includes('exports:create') ? (
            <Link className="button secondary" href="/api/exports/faculty">
              Export CSV
            </Link>
          ) : undefined
        }
      />
      <form className="filters" role="search">
        <div className="field">
          <label htmlFor="faculty-search">Filter by department or rank</label>
          <input
            className="input"
            id="faculty-search"
            name="search"
            defaultValue={firstParam(params, 'search')}
            placeholder="Department code or rank"
          />
        </div>
        <button className="button secondary" type="submit">
          Search
        </button>
      </form>
      <section className="card">
        {rows.length ? (
          <div
            className="table-scroll"
            role="region"
            aria-label="Faculty records table"
            tabIndex={0}
          >
            <table>
              <caption>{rows.length} faculty records match the current filter.</caption>
              <thead>
                <tr>
                  <th scope="col">Faculty member</th>
                  <th scope="col">Department</th>
                  <th scope="col">Rank</th>
                  <th scope="col">Office</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>{member.name}</strong>
                      <br />
                      <span className="muted">{member.employeeId}</span>
                    </td>
                    <td>{member.departmentCode}</td>
                    <td>{member.rank}</td>
                    <td>{member.office}</td>
                    <td>
                      <StatusBadge value={member.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No faculty found">Clear or change the search filter.</EmptyState>
        )}
      </section>
    </>
  )
}
