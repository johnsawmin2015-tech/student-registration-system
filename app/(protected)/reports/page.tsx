import type { Metadata } from 'next'

import {
  DataContextBanner,
  EmptyState,
  MetricCard,
  PageHeader,
  StatusBadge,
} from '@/components/ums/views'
import { requireCurrentUser } from '@/lib/server/auth'
import { getRepository } from '@/lib/server/repositories'

export const metadata: Metadata = { title: 'Reports' }

export default async function ReportsPage() {
  const actor = await requireCurrentUser('reports:read')
  const data = await (await getRepository()).reports(actor)
  return (
    <>
      <PageHeader
        eyebrow="Analysis"
        title="Academic reports"
        description="Derived summaries from the same filtered institutional records used by operational screens."
      />
      <DataContextBanner
        mode={data.mode}
        referenceTime={data.referenceTime}
        semester={data.currentSemester.name}
      />
      <section className="summary-grid">
        <MetricCard
          label="Average GPA"
          value={data.summary.averageGpa.toFixed(2)}
          detail="Current-term participants"
        />
        <MetricCard
          label="Students at risk"
          value={data.summary.atRiskCount}
          detail="Current-term participants"
        />
        <MetricCard label="Capacity utilization" value={`${data.summary.capacityUtilization}%`} />
        <MetricCard label="Registered seats" value={data.summary.registrationCount} />
      </section>
      <div className="two-column">
        <section className="card">
          <div className="card-header">
            <h2>Standing distribution</h2>
          </div>
          {data.standings.length ? (
            <div
              className="table-scroll"
              role="region"
              aria-label="Standing distribution table"
              tabIndex={0}
            >
              <table>
                <caption>Current-term participant count by academic standing</caption>
                <thead>
                  <tr>
                    <th scope="col">Standing</th>
                    <th scope="col" className="numeric">
                      Students
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.standings.map((item) => (
                    <tr key={item.standing}>
                      <td>
                        <StatusBadge value={item.standing} />
                      </td>
                      <td className="numeric">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No standing data">
              No active student records are available.
            </EmptyState>
          )}
        </section>
        <section className="card">
          <div className="card-header">
            <h2>Department enrollment</h2>
          </div>
          {data.departments.length ? (
            <div
              className="table-scroll"
              role="region"
              aria-label="Department enrollment table"
              tabIndex={0}
            >
              <table>
                <caption>Current-term participants by department</caption>
                <thead>
                  <tr>
                    <th scope="col">Department</th>
                    <th scope="col" className="numeric">
                      Students
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.departments.map((item) => (
                    <tr key={item.code}>
                      <td>
                        <strong>{item.code}</strong>
                        <br />
                        <span className="muted">{item.name}</span>
                      </td>
                      <td className="numeric">{item.students}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No department data">No department totals are available.</EmptyState>
          )}
        </section>
      </div>
    </>
  )
}
