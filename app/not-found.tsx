import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="login-panel">
      <section className="login-card">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="muted">The requested Northstar page does not exist.</p>
        <Link className="button" href="/">
          Return home
        </Link>
      </section>
    </main>
  )
}
