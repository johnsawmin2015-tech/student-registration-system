import { NextResponse } from 'next/server'

import { can } from '@/lib/domain/permissions'
import { CSV_CONTENT_TYPE, generateCsv } from '@/lib/domain/csv'
import { getCurrentUser } from '@/lib/server/auth'
import { getRepository } from '@/lib/server/repositories'
import { getRequestContext } from '@/lib/server/request-context'

export const dynamic = 'force-dynamic'

function denied(status: 401 | 403, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(
  request: Request,
  context: { params: Promise<{ resource: string }> },
): Promise<Response> {
  const actor = await getCurrentUser()
  if (!actor) return denied(401, 'Sign in to export records.')
  if (!actor.permissions.includes('exports:create') || !can(actor.role, 'exports:create')) {
    return denied(403, 'You do not have permission to export records.')
  }

  const { resource } = await context.params
  const url = new URL(request.url)
  const query = {
    search: url.searchParams.get('search')?.slice(0, 120) || undefined,
    departmentId: url.searchParams.get('departmentId')?.slice(0, 128) || undefined,
    semesterId: url.searchParams.get('semesterId')?.slice(0, 128) || undefined,
    includeArchived: url.searchParams.get('includeArchived') === 'true',
  }
  const repository = await getRepository()
  let csv: string

  if (resource === 'students') {
    const rows = await repository.students(actor, query)
    csv = generateCsv(rows, [
      { key: 'universityId', header: 'University ID' },
      { key: 'name', header: 'Student name' },
      { key: 'program', header: 'Program' },
      { key: 'departmentCode', header: 'Department' },
      { key: 'gpa', header: 'GPA' },
      { key: 'creditsEarned', header: 'Credits earned' },
      { key: 'standing', header: 'Standing' },
      { key: 'status', header: 'Status' },
    ])
  } else if (resource === 'faculty') {
    const rows = await repository.faculty(actor, query)
    csv = generateCsv(rows, [
      { key: 'employeeId', header: 'Employee ID' },
      { key: 'name', header: 'Faculty name' },
      { key: 'departmentCode', header: 'Department' },
      { key: 'rank', header: 'Rank' },
      { key: 'office', header: 'Office' },
      { key: 'status', header: 'Status' },
    ])
  } else if (resource === 'registrations') {
    const rows = await repository.registrations(actor, query)
    csv = generateCsv(rows, [
      { key: 'universityId', header: 'University ID' },
      { key: 'studentName', header: 'Student name' },
      { key: 'courseCode', header: 'Course' },
      { key: 'courseTitle', header: 'Course title' },
      { key: 'semesterName', header: 'Semester' },
      { key: 'status', header: 'Status' },
      { key: 'waitlistPosition', header: 'Waitlist position' },
      { key: 'registeredAt', header: 'Registered at' },
      { key: 'grade', header: 'Grade' },
    ])
  } else if (resource === 'audit') {
    if (!actor.permissions.includes('audit:read') || !can(actor.role, 'audit:read')) {
      return denied(403, 'You do not have permission to export audit events.')
    }
    const rows = await repository.audit(actor)
    csv = generateCsv(rows, [
      { key: 'createdAt', header: 'Occurred at' },
      { key: 'actorName', header: 'Actor' },
      { key: 'actorRole', header: 'Actor role' },
      { key: 'action', header: 'Action' },
      { key: 'entityType', header: 'Entity type' },
      { key: 'entityId', header: 'Entity ID' },
      { key: 'outcome', header: 'Outcome' },
      { key: 'summary', header: 'Summary' },
      { key: 'requestId', header: 'Request ID' },
    ])
  } else {
    return NextResponse.json(
      { error: 'Unknown export resource.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const requestContext = await getRequestContext()
  await repository.writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'export.create',
    entityType: 'export',
    entityId: resource,
    requestId: requestContext.requestId,
    outcome: 'success',
    summary: `Authorized filtered ${resource} export generated.`,
    sourceIpHash: requestContext.sourceIpHash,
    userAgentHash: requestContext.userAgentHash,
  })
  return new Response(csv, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': CSV_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="northstar-${resource}.csv"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
