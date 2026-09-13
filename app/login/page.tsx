import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/components/login-form'
import { getCurrentUser } from '@/lib/server/auth'
import { getDataMode } from '@/lib/server/config'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/dashboard')
  const demo = getDataMode() === 'demo'
  const usesDefaultPassword = !process.env.DEMO_PASSWORD
  return (
    <main className="login-shell">
      <section className="login-story" aria-labelledby="login-title">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span className="brand-copy">
            <strong>Northstar</strong>
            <span style={{ color: '#dceaff' }}>University management</span>
          </span>
        </div>
        <div>
          <p className="eyebrow" style={{ color: '#dceaff' }}>
            Academic operations
          </p>
          <h1 id="login-title">Clear records. Safer registration.</h1>
          <p>
            Manage institutional records, course capacity, eligibility, waitlists, and audit
            evidence from one permission-aware workspace.
          </p>
        </div>
        <p>Authorized users only. Session and mutation activity is security-audited.</p>
      </section>
      <section className="login-panel" aria-label="Sign in form">
        <div className="login-card">
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to Northstar</h2>
          <p className="muted">Use your institution-issued account.</p>
          <LoginForm />
          {demo ? (
            <div className="demo-credentials" role="note">
              <strong>Synthetic demo accounts</strong>
              <p>
                Use <code>admin@northstar.demo</code>, <code>staff@northstar.demo</code>, or{' '}
                <code>viewer@northstar.demo</code>.
              </p>
              <p>
                {usesDefaultPassword ? (
                  <>
                    Local default password: <code>DemoOnly!2026</code>.
                  </>
                ) : (
                  'The demo password is configured by the operator.'
                )}{' '}
                No real student data is used.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}
