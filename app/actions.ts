'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  loginCommandSchema,
  registerStudentCommandSchema,
  setUserRoleCommandSchema,
} from '@/lib/domain/validation'
import type { ActionState } from '@/lib/action-state'
import { authenticate, logout, requireActionUser } from '@/lib/server/auth'
import { publicError } from '@/lib/server/errors'
import { getRepository } from '@/lib/server/repositories'
import { assertSameOrigin, getRequestContext } from '@/lib/server/request-context'

const idSchema = z.string().trim().min(1).max(128)
const versionSchema = z.coerce.number().int().positive()
const settingsSchema = z.object({
  institutionName: z.string().trim().min(1).max(200),
  contactEmail: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  registrationEnabled: z.boolean(),
  maxCreditLoad: z.coerce.number().int().min(0).max(60),
  currentSemesterId: idSchema,
  timezone: z.string().trim().min(1).max(100),
  expectedVersion: versionSchema,
})

function errorState(error: unknown): ActionState {
  const visible = publicError(error)
  return { status: 'error', code: visible.code, message: visible.message }
}

export async function loginAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertSameOrigin()
    const command = loginCommandSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    })
    const context = await getRequestContext()
    await authenticate(command.email, command.password, context)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: 'error',
        code: 'INVALID_INPUT',
        message: 'Enter a valid email address and password.',
      }
    }
    return errorState(error)
  }
  redirect('/dashboard')
}

export async function logoutAction(): Promise<void> {
  await assertSameOrigin()
  await logout(await getRequestContext())
  redirect('/login')
}

export async function registerAction(formData: FormData): Promise<void> {
  const destination = '/registrations'
  try {
    await assertSameOrigin()
    const command = registerStudentCommandSchema.parse({
      studentId: formData.get('studentId'),
      offeringId: formData.get('offeringId'),
    })
    const context = await getRequestContext()
    const actor = await requireActionUser('registrations:manage', context)
    const result = await (await getRepository()).register(actor, command, context)
    if (!result.ok) {
      redirect(`${destination}?error=${encodeURIComponent(result.message)}`)
    }
    revalidatePath('/dashboard')
    revalidatePath('/registrations')
    revalidatePath('/courses')
    redirect(`${destination}?notice=${encodeURIComponent(result.message)}`)
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    const visible =
      error instanceof z.ZodError
        ? { message: 'Select a valid student and course offering.' }
        : publicError(error)
    redirect(`${destination}?error=${encodeURIComponent(visible.message)}`)
  }
}

export async function dropRegistrationAction(formData: FormData): Promise<void> {
  const destination = '/registrations'
  try {
    await assertSameOrigin()
    const command = {
      registrationId: idSchema.parse(formData.get('registrationId')),
      expectedVersion: versionSchema.parse(formData.get('expectedVersion')),
    }
    const context = await getRequestContext()
    const actor = await requireActionUser('registrations:manage', context)
    const result = await (await getRepository()).drop(actor, command, context)
    revalidatePath('/dashboard')
    revalidatePath('/registrations')
    revalidatePath('/courses')
    redirect(`${destination}?notice=${encodeURIComponent(result.message)}`)
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    const visible =
      error instanceof z.ZodError
        ? { message: 'The registration request is invalid.' }
        : publicError(error)
    redirect(`${destination}?error=${encodeURIComponent(visible.message)}`)
  }
}

export async function archiveStudentAction(formData: FormData): Promise<void> {
  const destination = '/students'
  try {
    await assertSameOrigin()
    const entityId = idSchema.parse(formData.get('studentId'))
    const expectedVersion = versionSchema.parse(formData.get('expectedVersion'))
    const archive = formData.get('archive') !== 'false'
    const context = await getRequestContext()
    const actor = await requireActionUser('students:write', context)
    await (
      await getRepository()
    ).archive(actor, { entity: 'student', entityId, expectedVersion, archive }, context)
    revalidatePath('/students')
    revalidatePath('/dashboard')
    redirect(`${destination}?notice=${archive ? 'Student%20archived.' : 'Student%20restored.'}`)
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    const visible =
      error instanceof z.ZodError
        ? { message: 'The student request is invalid.' }
        : publicError(error)
    redirect(`${destination}?error=${encodeURIComponent(visible.message)}`)
  }
}

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const destination = '/settings'
  try {
    await assertSameOrigin()
    const command = settingsSchema.parse({
      institutionName: formData.get('institutionName'),
      contactEmail: formData.get('contactEmail'),
      registrationEnabled: formData.get('registrationEnabled') === 'on',
      maxCreditLoad: formData.get('maxCreditLoad'),
      currentSemesterId: formData.get('currentSemesterId'),
      timezone: formData.get('timezone'),
      expectedVersion: formData.get('expectedVersion'),
    })
    const context = await getRequestContext()
    const actor = await requireActionUser('settings:manage', context)
    await (await getRepository()).updateSettings(actor, command, context)
    revalidatePath('/settings')
    revalidatePath('/dashboard')
    revalidatePath('/registrations')
    redirect(`${destination}?notice=Settings%20updated.`)
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    const visible =
      error instanceof z.ZodError
        ? { message: 'Review the settings fields and try again.' }
        : publicError(error)
    redirect(`${destination}?error=${encodeURIComponent(visible.message)}`)
  }
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const destination = '/settings'
  try {
    await assertSameOrigin()
    const command = setUserRoleCommandSchema.parse({
      userId: formData.get('userId'),
      role: formData.get('role'),
      expectedVersion: formData.get('expectedVersion'),
    })
    const context = await getRequestContext()
    const actor = await requireActionUser('users:manage', context)
    await (await getRepository()).setUserRole(actor, command, context)
    revalidatePath('/settings')
    redirect(`${destination}?notice=User%20role%20updated%3B%20active%20sessions%20revoked.`)
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    const visible =
      error instanceof z.ZodError
        ? { message: 'Select a valid user role and refresh before retrying.' }
        : publicError(error)
    redirect(`${destination}?error=${encodeURIComponent(visible.message)}`)
  }
}

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  await assertSameOrigin()
  const notificationId = idSchema.parse(formData.get('notificationId'))
  const context = await getRequestContext()
  const actor = await requireActionUser('notifications:write', context)
  await (await getRepository()).markNotificationRead(actor, notificationId, context)
  revalidatePath('/notifications')
}

export async function markAllNotificationsReadAction(): Promise<void> {
  await assertSameOrigin()
  const context = await getRequestContext()
  const actor = await requireActionUser('notifications:write', context)
  await (await getRepository()).markAllNotificationsRead(actor, context)
  revalidatePath('/notifications')
}
