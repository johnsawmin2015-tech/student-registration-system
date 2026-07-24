import type { DatabaseShape } from '@/lib/domain/types'

// All metrics are derived from the source-of-truth collections. No counter is
// ever stored separately from the entities it counts.

export function activeStudents(db: DatabaseShape) {
  return db.students.filter((s) => s.status === 'active')
}

export function activeFaculty(db: DatabaseShape) {
  return db.faculty.filter((f) => f.status === 'active')
}

export function activeCourses(db: DatabaseShape) {
  return db.courses.filter((c) => c.status === 'active')
}

export function departmentStats(db: DatabaseShape, departmentId: string) {
  const students = db.students.filter(
    (s) => s.departmentId === departmentId && s.status === 'active',
  )
  const faculty = db.faculty.filter(
    (f) => f.departmentId === departmentId && f.status === 'active',
  )
  const courses = db.courses.filter(
    (c) => c.departmentId === departmentId && c.status === 'active',
  )
  return {
    studentCount: students.length,
    facultyCount: faculty.length,
    courseCount: courses.length,
    avgGpa: students.length
      ? students.reduce((sum, s) => sum + s.gpa, 0) / students.length
      : 0,
  }
}

export function courseEnrollment(db: DatabaseShape, courseId: string) {
  return db.registrations.filter(
    (r) => r.courseId === courseId && r.status !== 'dropped',
  ).length
}

export function dashboardSummary(db: DatabaseShape) {
  const students = activeStudents(db)
  const faculty = activeFaculty(db)
  const courses = activeCourses(db)
  const currentSem = db.settings.currentSemesterId
  const currentRegs = db.registrations.filter(
    (r) => r.semesterId === currentSem && r.status !== 'dropped',
  )
  const atRisk = students.filter((s) => s.standing === 'probation' || s.standing === 'suspended')
  const avgGpa = students.length
    ? students.reduce((sum, s) => sum + s.gpa, 0) / students.length
    : 0
  const totalCapacity = courses.reduce((sum, c) => sum + c.capacity, 0)
  const totalFilled = courses.reduce((sum, c) => sum + courseEnrollment(db, c.id), 0)
  return {
    studentCount: students.length,
    facultyCount: faculty.length,
    courseCount: courses.length,
    departmentCount: db.departments.filter((d) => d.status === 'active').length,
    registrationCount: currentRegs.length,
    atRiskCount: atRisk.length,
    avgGpa,
    studentFacultyRatio: faculty.length ? students.length / faculty.length : 0,
    capacityUtilization: totalCapacity ? totalFilled / totalCapacity : 0,
    unreadNotifications: db.notifications.filter((n) => !n.read).length,
  }
}

export function enrollmentByCohort(db: DatabaseShape) {
  const map = new Map<number, number>()
  for (const s of activeStudents(db)) {
    map.set(s.cohortYear, (map.get(s.cohortYear) ?? 0) + 1)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year: String(year), students: count }))
}

export function studentsByDepartment(db: DatabaseShape) {
  return db.departments
    .filter((d) => d.status === 'active')
    .map((d) => ({
      department: d.code,
      name: d.name,
      students: db.students.filter(
        (s) => s.departmentId === d.id && s.status === 'active',
      ).length,
    }))
    .sort((a, b) => b.students - a.students)
}

export function standingBreakdown(db: DatabaseShape) {
  const students = activeStudents(db)
  const buckets = { good: 0, probation: 0, suspended: 0, other: 0 }
  for (const s of students) {
    if (s.standing === 'good') buckets.good++
    else if (s.standing === 'probation') buckets.probation++
    else if (s.standing === 'suspended') buckets.suspended++
    else buckets.other++
  }
  return buckets
}

export function capacityByCourse(db: DatabaseShape) {
  return activeCourses(db)
    .map((c) => ({
      code: c.code,
      title: c.title,
      capacity: c.capacity,
      enrolled: courseEnrollment(db, c.id),
      utilization: c.capacity ? courseEnrollment(db, c.id) / c.capacity : 0,
    }))
    .sort((a, b) => b.utilization - a.utilization)
}
