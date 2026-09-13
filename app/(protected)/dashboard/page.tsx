import type { Metadata } from 'next'
import Link from 'next/link'

import {
  DataContextBanner,
  EmptyState,
  MetricCard,
  PageHeader,
  StatusBadge,
} from '@/components/ums/views'
import { requireCurrentUser } from '@/lib/server/auth'
import { getRepository } from '@/lib/server/repositories'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const actor = await requireCurrentUser('records:read')
  const data = await (await getRepository()).dashboard(actor)
  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Academic operations dashboard"
        description="A bounded summary of current records, course capacity, registration activity, and academic risk."
        actions={
          <Link className="button" href="/registrations">
            Manage registrations
          </Link>
        }
      />
      <DataContextBanner
        mode={data.mode}
        referenceTime={data.referenceTime}
        semester={data.currentSemester.name}
      />
      <section className="summary-grid" aria-label="Institution summary">
        <MetricCard label="Active students" value={data.summary.studentCount} />
        <MetricCard label="Faculty" value={data.summary.facultyCount} />
        <MetricCard
          label="Current offerings"
          value={data.summary.offeringCount}
          detail="Open or closed in the current term"
        />
        <MetricCard
          label="Registered seats"
          value={data.summary.registrationCount}
          detail="Current term"
        />
        <MetricCard label="Departments" value={data.summary.departmentCount} />
        <MetricCard
          label="Students at risk"
          value={data.summary.atRiskCount}
          detail="Probation or suspended current-term participants"
        />
        <MetricCard label="Capacity utilization" value={`${data.summary.capacityUtilization}%`} />
        <MetricCard label="Unread notices" value={data.summary.unreadNotifications} />
      </section>
      <div className="two-column">
        <section className="card">
          <div className="card-header">
            <h2>Current course capacity</h2>
            <p>Registered seats only; waitlists do not consume capacity.</p>
          </div>
          {data.capacity.length ? (
            <div
              className="table-scroll"
              role="region"
              aria-label="Current course capacity table"
              tabIndex={0}
            >
              <table>
                <caption>Capacity by current-semester offering</caption>
                <thead>
                  <tr>
                    <th scope="col">Course</th>
                    <th scope="col">Title</th>
                    <th scope="col" className="numeric">
                      Enrolled
                    </th>
                    <th scope="col" className="numeric">
                      Capacity
                    </th>
                    <th scope="col" className="numeric">
                      Use
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.capacity.map((item) => (
                    <tr key={item.offeringId}>
                      <td>
                        <strong>{item.code}</strong>
                      </td>
                      <td>{item.title}</td>
                      <td className="numeric">{item.enrolled}</td>
                      <td className="numeric">{item.capacity}</td>
                      <td className="numeric">{item.utilization}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No current offerings">
              Open course offerings will appear here.
            </EmptyState>
          )}
        </section>
        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h2>Students by department</h2>
            </div>
            {data.departments.length ? (
              <div className="card-body">
                <dl className="definition-list">
                  {data.departments.map((item) => (
                    <div key={item.code}>
                      <dt>{item.code}</dt>
                      <dd>{item.students} students</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <EmptyState title="No department data">Department totals are unavailable.</EmptyState>
            )}
          </section>
          <section className="card">
            <div className="card-header">
              <h2>Recent authorized audit view</h2>
              <p>Shown only when your role can read audit events.</p>
            </div>
            {data.recentAudit.length ? (
              <div className="card-body stack">
                {data.recentAudit.map((item) => (
                  <div key={item.id}>
                    <StatusBadge value={item.outcome} /> <strong>{item.action}</strong>
                    <br />
                    <span className="muted">{item.summary}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No visible audit events">
                No audit rows are available to this role.
              </EmptyState>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
