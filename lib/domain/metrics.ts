import type {
  CourseOfferingStatus,
  DashboardMetricsDto,
  EntityStatus,
  RegistrationStatus,
  SemesterStatus,
  StudentStanding,
} from './types'

export interface MetricStudent {
  id: string
  status: EntityStatus
  standing: StudentStanding
}

export interface MetricOffering {
  id: string
  semesterId: string
  status: CourseOfferingStatus
  capacity: number
}

export interface MetricRegistration {
  studentId: string
  offeringId: string
  semesterId: string
  status: RegistrationStatus
}

export interface MetricSemester {
  id: string
  isCurrent: boolean
  status: SemesterStatus
}

export interface SemesterMetricsInput {
  semesterId: string
  students: readonly MetricStudent[]
  offerings: readonly MetricOffering[]
  registrations: readonly MetricRegistration[]
}

export interface CurrentSemesterMetricsInput extends Omit<SemesterMetricsInput, 'semesterId'> {
  semesters: readonly MetricSemester[]
}

export interface OfferingCapacityMetrics {
  offeringId: string
  semesterId: string
  capacity: number
  occupiedSeats: number
  registeredCount: number
  completedCount: number
  waitlistedCount: number
  availableSeats: number
  utilization: number
}

const metricOfferingStatuses = new Set<CourseOfferingStatus>(['open', 'closed'])
const participatingStatuses = new Set<RegistrationStatus>(['registered', 'waitlisted', 'completed'])

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative integer.`)
  }
}

export function calculateOfferingCapacity(
  offering: MetricOffering,
  registrations: readonly MetricRegistration[],
): OfferingCapacityMetrics {
  assertNonnegativeInteger(offering.capacity, 'Offering capacity')
  const scoped = registrations.filter(
    (registration) =>
      registration.offeringId === offering.id && registration.semesterId === offering.semesterId,
  )
  const registeredCount = scoped.filter(
    (registration) => registration.status === 'registered',
  ).length
  const completedCount = scoped.filter((registration) => registration.status === 'completed').length
  const waitlistedCount = scoped.filter(
    (registration) => registration.status === 'waitlisted',
  ).length
  const occupiedSeats = registeredCount + completedCount

  return {
    offeringId: offering.id,
    semesterId: offering.semesterId,
    capacity: offering.capacity,
    occupiedSeats,
    registeredCount,
    completedCount,
    waitlistedCount,
    availableSeats: Math.max(0, offering.capacity - occupiedSeats),
    utilization: offering.capacity === 0 ? 0 : occupiedSeats / offering.capacity,
  }
}

export function calculateSemesterMetrics(input: SemesterMetricsInput): DashboardMetricsDto {
  const offerings = input.offerings.filter(
    (offering) =>
      offering.semesterId === input.semesterId && metricOfferingStatuses.has(offering.status),
  )
  for (const offering of offerings) assertNonnegativeInteger(offering.capacity, 'Offering capacity')

  const offeringIds = new Set(offerings.map((offering) => offering.id))
  const registrations = input.registrations.filter(
    (registration) =>
      registration.semesterId === input.semesterId && offeringIds.has(registration.offeringId),
  )
  const participatingStudentIds = new Set(
    registrations
      .filter((registration) => participatingStatuses.has(registration.status))
      .map((registration) => registration.studentId),
  )
  const scopedStudents = input.students.filter((student) => participatingStudentIds.has(student.id))

  const registeredCount = registrations.filter((item) => item.status === 'registered').length
  const completedCount = registrations.filter((item) => item.status === 'completed').length
  const waitlistedCount = registrations.filter((item) => item.status === 'waitlisted').length
  const droppedCount = registrations.filter((item) => item.status === 'dropped').length
  const totalCapacity = offerings.reduce((sum, offering) => sum + offering.capacity, 0)
  const occupiedSeats = registeredCount + completedCount

  return {
    semesterId: input.semesterId,
    activeStudentCount: scopedStudents.filter((student) => student.status === 'active').length,
    participatingStudentCount: participatingStudentIds.size,
    activeOfferingCount: offerings.length,
    registeredCount,
    waitlistedCount,
    completedCount,
    droppedCount,
    atRiskStudentCount: scopedStudents.filter(
      (student) =>
        student.status === 'active' &&
        (student.standing === 'probation' || student.standing === 'suspended'),
    ).length,
    totalCapacity,
    occupiedSeats,
    availableSeats: Math.max(0, totalCapacity - occupiedSeats),
    capacityUtilization: totalCapacity === 0 ? 0 : occupiedSeats / totalCapacity,
  }
}

export function resolveCurrentSemesterId(semesters: readonly MetricSemester[]): string {
  const current = semesters.filter((semester) => semester.isCurrent && semester.status === 'active')
  if (current.length !== 1) {
    throw new Error(`Expected exactly one active current semester; found ${current.length}.`)
  }
  return current[0].id
}

export function calculateCurrentSemesterMetrics(
  input: CurrentSemesterMetricsInput,
): DashboardMetricsDto {
  return calculateSemesterMetrics({
    semesterId: resolveCurrentSemesterId(input.semesters),
    students: input.students,
    offerings: input.offerings,
    registrations: input.registrations,
  })
}

export const deriveSemesterMetrics = calculateSemesterMetrics
