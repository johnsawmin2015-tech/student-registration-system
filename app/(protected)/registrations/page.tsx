import type { Metadata } from 'next'
import Link from 'next/link'

import { dropRegistrationAction, registerAction } from '@/app/actions'
import {
  DataContextBanner,
  EmptyState,
  FlashMessage,
  PageHeader,
  StatusBadge,
} from '@/components/ums/views'
import { can } from '@/lib/domain/permissions'
import { requireCurrentUser } from '@/lib/server/auth'
import { firstParam, recordQuery, type PageSearchParams } from '@/lib/server/page-params'
import { getRepository } from '@/lib/server/repositories'

export const metadata: Metadata = { title: 'Registrations' }

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: PageSearchParams
}) {
  const params = await searchParams
  const actor = await requireCurrentUser('records:read')
  const repository = await getRepository()
  const mayManage =
    actor.permissions.includes('registrations:manage') && can(actor.role, 'registrations:manage')
  const [rows, options] = await Promise.all([
    repository.registrations(actor, recordQuery(params)),
    mayManage ? repository.registrationOptions(actor) : null,
  ])
  return (
    <>
      <PageHeader
        eyebrow="Enrollment"
        title="Course registrations"
        description="Server-enforced eligibility, holds, prerequisites, time conflicts, credit limits, capacity, and deterministic waitlists."
        actions={
          actor.permissions.includes('exports:create') ? (
            <Link className="button secondary" href="/api/exports/registrations">
              Export CSV
            </Link>
          ) : undefined
        }
      />
      {options ? (
        <DataContextBanner
          mode={options.mode}
          referenceTime={options.referenceTime}
          semester={options.currentSemester.name}
        />
      ) : null}
      <FlashMessage notice={firstParam(params, 'notice')} error={firstParam(params, 'error')} />
      {options ? (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header">
            <h2>Register a student</h2>
            <p>
              {options.registrationEnabled
                ? 'Eligible requests receive a seat or the next waitlist position.'
                : 'Registration is disabled in institution settings.'}
            </p>
          </div>
          <form className="card-body form-grid" action={registerAction}>
            <div className="field">
              <label htmlFor="studentId">Student</label>
              <select className="select" id="studentId" name="studentId" required defaultValue="">
                <option value="" disabled>
                  Select a student
                </option>
                {options.students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="offeringId">Open offering</label>
              <select className="select" id="offeringId" name="offeringId" required defaultValue="">
                <option value="" disabled>
                  Select an offering
                </option>
                {options.offerings.map((offering) => (
                  <option key={offering.id} value={offering.id}>
                    {offering.label} ({offering.enrolled}/{offering.capacity})
                  </option>
                ))}
              </select>
            </div>
            <div className="field full">
              <button
                className="button"
                type="submit"
                disabled={
                  !options.registrationEnabled ||
                  !options.students.length ||
                  !options.offerings.length
                }
              >
                Evaluate and register
              </button>
            </div>
          </form>
        </section>
      ) : (
        <div className="callout">
          Your role can review registration records but cannot create, drop, or promote
          registrations.
        </div>
      )}
      <form className="filters" role="search">
        <div className="field">
          <label htmlFor="registration-search">Filter by course</label>
          <input
            className="input"
            id="registration-search"
            name="search"
            defaultValue={firstParam(params, 'search')}
            placeholder="Course code or title"
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
            aria-label="Course registration records table"
            tabIndex={0}
          >
            <table>
              <caption>{rows.length} registration records match the current filter.</caption>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Course</th>
                  <th scope="col">Term</th>
                  <th scope="col">Registered</th>
                  <th scope="col">Status</th>
                  <th scope="col">Grade</th>
                  {mayManage ? <th scope="col">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((registration) => (
                  <tr key={registration.id}>
                    <td>
                      <strong>{registration.studentName}</strong>
                      <br />
                      <span className="muted">{registration.universityId}</span>
                    </td>
                    <td>
                      <strong>{registration.courseCode}</strong>
                      <br />
                      <span className="muted">{registration.courseTitle}</span>
                    </td>
                    <td>{registration.semesterName}</td>
                    <td>
                      <time dateTime={registration.registeredAt}>
                        {new Date(registration.registeredAt).toLocaleDateString('en-US')}
                      </time>
                    </td>
                    <td>
                      <StatusBadge value={registration.status} />
                      {registration.waitlistPosition ? (
                        <span className="muted"> #{registration.waitlistPosition}</span>
                      ) : null}
                    </td>
                    <td>{registration.grade ?? '—'}</td>
                    {mayManage ? (
                      <td>
                        {registration.status === 'registered' ||
                        registration.status === 'waitlisted' ? (
                          <form action={dropRegistrationAction}>
                            <input type="hidden" name="registrationId" value={registration.id} />
                            <input
                              type="hidden"
                              name="expectedVersion"
                              value={registration.version}
                            />
                            <button className="button danger compact" type="submit">
                              Drop
                            </button>
                          </form>
                        ) : (
                          <span className="muted">No action</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No registrations found">Clear or change the search filter.</EmptyState>
        )}
      </section>
    </>
  )
}
