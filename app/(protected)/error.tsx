'use client'

import { useEffect } from 'react'

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Protected route failed', { digest: error.digest })
  }, [error])
  return (
    <section className="card card-body" role="alert">
      <p className="eyebrow">Request failed</p>
      <h1>We could not load this page</h1>
      <p className="muted">
        Try the request again. If the problem continues, share the request time with your system
        operator.
      </p>
      <button className="button" type="button" onClick={reset}>
        Try again
      </button>
    </section>
  )
}
