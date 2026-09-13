import type { Metadata } from 'next'

import { EmptyState, PageHeader, StatusBadge } from '@/components/ums/views'
import { requireCurrentUser } from '@/lib/server/auth'
import { firstParam, recordQuery, type PageSearchParams } from '@/lib/server/page-params'
import { getRepository } from '@/lib/server/repositories'

export const metadata: Metadata = { title: 'Courses' }

export default async function CoursesPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams
  const actor = await requireCurrentUser('records:read')
  const rows = await (await getRepository()).courses(actor, recordQuery(params))
  return (
    <>
      <PageHeader
        eyebrow="Curriculum"
        title="Course offerings"
        description="Catalog identity is separated from term-specific instructor, meeting, room, and capacity details."
      />
      <form className="filters" role="search">
        <div className="field">
          <label htmlFor="course-search">Search course offerings</label>
          <input
            className="input"
            id="course-search"
            name="search"
            defaultValue={firstParam(params, 'search')}
            placeholder="Course code, title, or section"
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
            aria-label="Course offerings table"
            tabIndex={0}
          >
            <table>
              <caption>{rows.length} offerings match the current filter.</caption>
              <thead>
                <tr>
                  <th scope="col">Course</th>
                  <th scope="col">Term</th>
                  <th scope="col">Instructor</th>
                  <th scope="col">Meeting</th>
                  <th scope="col" className="numeric">
                    Credits
                  </th>
                  <th scope="col">Capacity</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((course) => (
                  <tr key={course.offeringId}>
                    <td>
                      <strong>{course.code}</strong>
                      <br />
                      <span className="muted">{course.title}</span>
                    </td>
                    <td>{course.semesterName}</td>
                    <td>{course.instructor ?? 'Not assigned'}</td>
                    <td>
                      {course.schedule}
                      <br />
                      <span className="muted">{course.room}</span>
                    </td>
                    <td className="numeric">{course.credits}</td>
                    <td>
                      {course.enrolled} / {course.capacity}
                      {course.waitlisted ? (
                        <>
                          <br />
                          <span className="muted">{course.waitlisted} waitlisted</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge value={course.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No offerings found">Clear or change the search filter.</EmptyState>
        )}
      </section>
    </>
  )
}
