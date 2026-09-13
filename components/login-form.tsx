'use client'

import { useActionState } from 'react'

import { loginAction } from '@/app/actions'
import type { ActionState } from '@/lib/action-state'

const initialActionState: ActionState = { status: 'idle', message: '' }

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialActionState)
  return (
    <form action={action} noValidate>
      {state.status === 'error' ? (
        <div className="flash error" role="alert">
          {state.message}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
        />
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
