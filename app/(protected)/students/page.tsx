import type { Metadata } from 'next'
import Link from 'next/link'

import { archiveStudentAction } from '@/app/actions'
import { EmptyState, FlashMessage, PageHeader, StatusBadge } from '@/components/ums/views'
import { can } from '@/lib/domain/permissions'
import { requireCurrentUser } from '@/lib/server/auth'
import { firstParam, recordQuery, type PageSearchParams } from '@/lib/server/page-params'
import { getRepository } from '@/lib/server/repositories'

export const metadata: Metadata = { title: 'Students' }

export default async function StudentsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams
  const actor = await requireCurrentUser('records:read')
  const rows = await (await getRepository()).students(actor, recordQuery(params))
  const mayWrite = actor.permissions.includes('students:write') && can(actor.role, 'students:write')
  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Students"
        description="Privacy-minimized academic profiles with standing, progress, and archive controls."
        actions={
          actor.permissions.includes('exports:create') ? (
            <Link
              className="button secondary"
              href={`/api/exports/students${firstParam(params, 'search') ? `?search=${encodeURIComponent(firstParam(params, 'search') ?? '')}` : ''}`}
            >
              Export filtered CSV
            </Link>
          ) : undefined
        }
      />
      <FlashMessage notice={firstParam(params, 'notice')} error={firstParam(params, 'error')} />
      <form className="filters" role="search">
        <div className="field">
          <label htmlFor="student-search">Filter by academic program</label>
          <input
            className="input"
            id="student-search"
            name="search"
            defaultValue={firstParam(params, 'search')}
            placeholder="Program name"
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
            aria-label="Student records table"
            tabIndex={0}
          >
            <table>
              <caption>{rows.length} student records match the current filter.</caption>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Program</th>
                  <th scope="col">Department</th>
                  <th scope="col" className="numeric">
                    GPA
                  </th>
                  <th scope="col">Progress</th>
                  <th scope="col">Standing</th>
                  <th scope="col">Status</th>
                  {mayWrite ? <th scope="col">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <strong>{student.name}</strong>
                      <br />
                      <span className="muted">{student.universityId}</span>
                    </td>
                    <td>{student.program}</td>
                    <td>{student.departmentCode}</td>
                    <td className="numeric">{student.gpa.toFixed(2)}</td>
                    <td>
                      {student.creditsEarned} / {student.creditsRequired} credits
                    </td>
                    <td>
                      <StatusBadge value={student.standing} />
                    </td>
                    <td>
                      <StatusBadge value={student.status} />
                    </td>
                    {mayWrite ? (
                      <td>
                        <form action={archiveStudentAction}>
                          <input type="hidden" name="studentId" value={student.id} />
                          <input type="hidden" name="expectedVersion" value={student.version} />
                          <input
                            type="hidden"
                            name="archive"
                            value={student.status === 'archived' ? 'false' : 'true'}
                          />
                          <button
                            className={`button compact ${student.status === 'archived' ? 'secondary' : 'danger'}`}
                            type="submit"
                          >
                            {student.status === 'archived' ? 'Restore' : 'Archive'}
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No students found">Clear or change the search filter.</EmptyState>
        )}
      </section>
    </>
  )
}
