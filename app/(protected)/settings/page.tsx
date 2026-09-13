import type { Metadata } from 'next'

import { setUserRoleAction, updateSettingsAction } from '@/app/actions'
import { EmptyState, FlashMessage, PageHeader, StatusBadge } from '@/components/ums/views'
import { can } from '@/lib/domain/permissions'
import { requireCurrentUser } from '@/lib/server/auth'
import { firstParam, type PageSearchParams } from '@/lib/server/page-params'
import { getRepository } from '@/lib/server/repositories'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams
  const actor = await requireCurrentUser('records:read')
  const repository = await getRepository()
  const mayManageUsers =
    actor.permissions.includes('users:manage') && can(actor.role, 'users:manage')
  const [settings, semesterRows, userRows] = await Promise.all([
    repository.settings(actor),
    repository.semesters(actor),
    mayManageUsers ? repository.userAdministration(actor) : Promise.resolve([]),
  ])
  const mayManage =
    actor.permissions.includes('settings:manage') && can(actor.role, 'settings:manage')
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Institution settings"
        description="Allowlisted non-secret settings that control current-term registration behavior."
      />
      <FlashMessage notice={firstParam(params, 'notice')} error={firstParam(params, 'error')} />
      <section className="card">
        <div className="card-header">
          <h2>Academic operations</h2>
          <p>
            {mayManage
              ? 'Changes use optimistic concurrency and generate an audit event.'
              : 'Your role has read-only access to these settings.'}
          </p>
        </div>
        <form className="card-body form-grid" action={updateSettingsAction}>
          <input type="hidden" name="expectedVersion" value={settings.version} />
          <div className="field">
            <label htmlFor="institutionName">Institution name</label>
            <input
              className="input"
              id="institutionName"
              name="institutionName"
              defaultValue={settings.institutionName}
              required
              maxLength={200}
              disabled={!mayManage}
            />
          </div>
          <div className="field">
            <label htmlFor="contactEmail">Registrar contact</label>
            <input
              className="input"
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={settings.contactEmail}
              required
              maxLength={254}
              disabled={!mayManage}
            />
          </div>
          <div className="field">
            <label htmlFor="currentSemesterId">Current semester</label>
            <select
              className="select"
              id="currentSemesterId"
              name="currentSemesterId"
              defaultValue={settings.currentSemesterId}
              disabled={!mayManage}
            >
              {semesterRows
                .filter((semester) => semester.status !== 'archived')
                .map((semester) => (
                  <option key={semester.id} value={semester.id}>
                    {semester.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="maxCreditLoad">Maximum credit load</label>
            <input
              className="input"
              id="maxCreditLoad"
              name="maxCreditLoad"
              type="number"
              min={0}
              max={60}
              step={1}
              defaultValue={settings.maxCreditLoad}
              required
              disabled={!mayManage}
            />
          </div>
          <div className="field">
            <label htmlFor="timezone">Institution timezone</label>
            <input
              className="input"
              id="timezone"
              name="timezone"
              defaultValue={settings.timezone}
              required
              maxLength={100}
              disabled={!mayManage}
            />
          </div>
          <div className="checkbox-field">
            <input
              id="registrationEnabled"
              name="registrationEnabled"
              type="checkbox"
              defaultChecked={settings.registrationEnabled}
              disabled={!mayManage}
            />
            <label htmlFor="registrationEnabled">Registration enabled</label>
          </div>
          {mayManage ? (
            <div className="field full">
              <button className="button" type="submit">
                Save settings
              </button>
            </div>
          ) : null}
        </form>
      </section>
      {mayManageUsers ? (
        <section className="card" style={{ marginTop: '1rem' }}>
          <div className="card-header">
            <h2>User role administration</h2>
            <p>
              Administrators may assign one active institutional role. Changes use optimistic
              concurrency, revoke the target account&apos;s active sessions, and write an audit
              event.
            </p>
          </div>
          {userRows.length ? (
            <div
              className="table-scroll"
              role="region"
              aria-label="User role administration table"
              tabIndex={0}
            >
              <table>
                <caption>Institutional application accounts and active roles</caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Title</th>
                    <th scope="col">Status</th>
                    <th scope="col">Role assignment</th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((user) => {
                    const isCurrentUser = user.id === actor.id
                    const canChange = !isCurrentUser && user.status === 'active'
                    return (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.name}</strong>
                          <br />
                          <span className="muted">{user.email}</span>
                        </td>
                        <td>{user.title}</td>
                        <td>
                          <StatusBadge value={user.status} />
                        </td>
                        <td>
                          {canChange ? (
                            <form className="inline-actions" action={setUserRoleAction}>
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="expectedVersion" value={user.version} />
                              <select
                                className="select compact-control"
                                name="role"
                                defaultValue={user.role}
                                aria-label={`Role for ${user.name}`}
                              >
                                <option value="administrator">Administrator</option>
                                <option value="staff">Staff</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <button className="button secondary compact" type="submit">
                                Save role
                              </button>
                            </form>
                          ) : (
                            <span className="muted">
                              {isCurrentUser ? `${user.role} (current account)` : user.role}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No manageable accounts">
              Provisioned application accounts will appear here.
            </EmptyState>
          )}
        </section>
      ) : null}
    </>
  )
}
