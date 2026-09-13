import type { Metadata } from 'next'

import { EmptyState, PageHeader, StatusBadge } from '@/components/ums/views'
import { requireCurrentUser } from '@/lib/server/auth'
import { firstParam, recordQuery, type PageSearchParams } from '@/lib/server/page-params'
import { getRepository } from '@/lib/server/repositories'

export const metadata: Metadata = { title: 'Departments' }

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: PageSearchParams
}) {
  const params = await searchParams
  const actor = await requireCurrentUser('records:read')
  const rows = await (await getRepository()).departments(actor, recordQuery(params))
  return (
    <>
      <PageHeader
        eyebrow="Structure"
        title="Departments"
        description="Academic departments, accountable chairs, and current record counts."
      />
      <form className="filters" role="search">
        <div className="field">
          <label htmlFor="department-search">Search departments</label>
          <input
            className="input"
            id="department-search"
            name="search"
            defaultValue={firstParam(params, 'search')}
            placeholder="Code or name"
          />
        </div>
        <button className="button secondary" type="submit">
          Search
        </button>
      </form>
      <section className="card">
        {rows.length ? (
          <div className="table-scroll" role="region" aria-label="Departments table" tabIndex={0}>
            <table>
              <caption>{rows.length} departments match the current filter.</caption>
              <thead>
                <tr>
                  <th scope="col">Department</th>
                  <th scope="col">Chair</th>
                  <th scope="col" className="numeric">
                    Students
                  </th>
                  <th scope="col" className="numeric">
                    Faculty
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((department) => (
                  <tr key={department.id}>
                    <td>
                      <strong>{department.code}</strong>
                      <br />
                      <span className="muted">{department.name}</span>
                    </td>
                    <td>{department.chair ?? 'Not assigned'}</td>
                    <td className="numeric">{department.studentCount}</td>
                    <td className="numeric">{department.facultyCount}</td>
                    <td>
                      <StatusBadge value={department.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No departments found">Clear or change the search filter.</EmptyState>
        )}
      </section>
    </>
  )
}
