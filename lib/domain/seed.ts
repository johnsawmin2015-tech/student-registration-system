import type {
  AuditRecord,
  Course,
  DatabaseShape,
  Department,
  Faculty,
  LetterGrade,
  NotificationItem,
  Registration,
  Semester,
  Student,
  StudentStanding,
  SystemSettings,
  UserAccount,
} from './types'

// Deterministic pseudo-random generator so demo data is stable across reloads.
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}
const rand = makeRng(20260724)
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
const between = (min: number, max: number) =>
  Math.round((min + rand() * (max - min)) * 100) / 100
const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86400000).toISOString()

const firstNames = [
  'Amara', 'Liam', 'Sofia', 'Noah', 'Priya', 'Mateo', 'Chen', 'Isabella',
  'Omar', 'Hana', 'Ethan', 'Zara', 'Lucas', 'Aisha', 'Diego', 'Yuki',
  'Nathan', 'Fatima', 'Oliver', 'Leila', 'Ivan', 'Maya', 'Kofi', 'Elena',
  'Arjun', 'Nadia', 'Samuel', 'Grace', 'Tariq', 'Ingrid', 'Rafael', 'Mei',
]
const lastNames = [
  'Okafor', 'Nguyen', 'Rossi', 'Andersson', 'Patel', 'Garcia', 'Wang',
  'Muller', 'Haddad', 'Kim', 'Johnson', 'Ahmed', 'Silva', 'Kowalski',
  'Tanaka', 'Ferreira', 'Novak', 'Reyes', 'Abebe', 'Larsson', 'Volkov',
  'Sharma', 'Mensah', 'Petrov', 'Costa', 'Bauer', 'Cohen', 'Ito',
]
const cities = [
  ['Boston', 'USA'], ['Lagos', 'Nigeria'], ['Milan', 'Italy'],
  ['Mumbai', 'India'], ['Seoul', 'South Korea'], ['Cairo', 'Egypt'],
  ['Berlin', 'Germany'], ['Sao Paulo', 'Brazil'], ['Tokyo', 'Japan'],
  ['Toronto', 'Canada'], ['Nairobi', 'Kenya'], ['Warsaw', 'Poland'],
]

export const users: UserAccount[] = [
  {
    id: 'u-admin',
    name: 'Dr. Eleanor Voss',
    email: 'e.voss@meridian.edu',
    role: 'admin',
    title: 'Registrar',
    avatarColor: 'oklch(0.5 0.08 200)',
    lastActiveISO: iso(0),
  },
  {
    id: 'u-staff',
    name: 'Marcus Bell',
    email: 'm.bell@meridian.edu',
    role: 'staff',
    title: 'Academic Coordinator',
    avatarColor: 'oklch(0.55 0.11 155)',
    lastActiveISO: iso(0),
  },
  {
    id: 'u-viewer',
    name: 'Priya Rao',
    email: 'p.rao@meridian.edu',
    role: 'viewer',
    title: 'Auditor',
    avatarColor: 'oklch(0.7 0.13 75)',
    lastActiveISO: iso(1),
  },
]

const departmentSeeds: Array<Omit<Department, 'createdISO' | 'updatedISO' | 'chairId' | 'status'>> = [
  { id: 'd-cs', code: 'CS', name: 'Computer Science', faculty: 'Faculty of Engineering', building: 'Turing Hall', established: 1978, email: 'cs@meridian.edu', budget: 4200000, description: 'Computing, systems, algorithms, and artificial intelligence.' },
  { id: 'd-math', code: 'MATH', name: 'Mathematics', faculty: 'Faculty of Sciences', building: 'Euler Building', established: 1901, email: 'math@meridian.edu', budget: 2800000, description: 'Pure and applied mathematics and statistics.' },
  { id: 'd-phys', code: 'PHYS', name: 'Physics', faculty: 'Faculty of Sciences', building: 'Curie Laboratories', established: 1912, email: 'physics@meridian.edu', budget: 3600000, description: 'Theoretical, experimental, and applied physics.' },
  { id: 'd-bio', code: 'BIO', name: 'Biology', faculty: 'Faculty of Sciences', building: 'Darwin Center', established: 1925, email: 'biology@meridian.edu', budget: 3100000, description: 'Molecular, cellular, and organismal biology.' },
  { id: 'd-bus', code: 'BUS', name: 'Business Administration', faculty: 'School of Business', established: 1965, building: 'Keynes Hall', email: 'business@meridian.edu', budget: 3900000, description: 'Management, finance, and entrepreneurship.' },
  { id: 'd-eng', code: 'ENG', name: 'English & Literature', faculty: 'Faculty of Humanities', building: 'Austen Hall', established: 1889, email: 'english@meridian.edu', budget: 1800000, description: 'Literature, writing, and rhetoric.' },
  { id: 'd-psy', code: 'PSY', name: 'Psychology', faculty: 'Faculty of Social Sciences', building: 'James Hall', established: 1948, email: 'psych@meridian.edu', budget: 2400000, description: 'Cognitive, clinical, and behavioral psychology.' },
  { id: 'd-econ', code: 'ECON', name: 'Economics', faculty: 'Faculty of Social Sciences', building: 'Smith Hall', established: 1932, email: 'econ@meridian.edu', budget: 2600000, description: 'Micro, macro, and econometric analysis.' },
]

export const departments: Department[] = departmentSeeds.map((d, i) => ({
  ...d,
  chairId: null, // resolved after faculty generation
  status: 'active',
  createdISO: iso(3000 + i * 40),
  updatedISO: iso(between(2, 120)),
}))

const specializations: Record<string, string[]> = {
  'd-cs': ['Machine Learning', 'Distributed Systems', 'Computer Graphics', 'Security', 'Databases'],
  'd-math': ['Topology', 'Number Theory', 'Applied Statistics', 'Numerical Analysis'],
  'd-phys': ['Quantum Mechanics', 'Astrophysics', 'Condensed Matter', 'Optics'],
  'd-bio': ['Genetics', 'Ecology', 'Neurobiology', 'Microbiology'],
  'd-bus': ['Corporate Finance', 'Marketing', 'Operations', 'Strategy'],
  'd-eng': ['Victorian Literature', 'Creative Writing', 'Linguistics', 'Rhetoric'],
  'd-psy': ['Clinical', 'Cognitive', 'Developmental', 'Social'],
  'd-econ': ['Macroeconomics', 'Game Theory', 'Development', 'Labor'],
}
const ranks: Faculty['rank'][] = ['professor', 'associate', 'assistant', 'lecturer', 'adjunct']

export const faculty: Faculty[] = []
let facCounter = 400
for (const dept of departments) {
  const count = 5 + Math.floor(rand() * 4)
  for (let i = 0; i < count; i++) {
    facCounter++
    const fn = pick(firstNames)
    const ln = pick(lastNames)
    faculty.push({
      id: `f-${facCounter}`,
      employeeId: `FAC-${String(facCounter).padStart(5, '0')}`,
      firstName: fn,
      lastName: ln,
      email: `${fn[0].toLowerCase()}.${ln.toLowerCase()}@meridian.edu`,
      phone: `+1 (617) 555-${String(1000 + Math.floor(rand() * 8999)).padStart(4, '0')}`,
      departmentId: dept.id,
      rank: i === 0 ? 'professor' : pick(ranks),
      employment: rand() > 0.8 ? 'part-time' : rand() > 0.92 ? 'visiting' : 'full-time',
      office: `${dept.building.split(' ')[0]} ${100 + Math.floor(rand() * 320)}`,
      specialization: pick(specializations[dept.id]),
      hireYear: 1998 + Math.floor(rand() * 27),
      isChair: false,
      status: rand() > 0.95 ? 'inactive' : 'active',
      createdISO: iso(between(200, 2000)),
      updatedISO: iso(between(1, 90)),
      notes: '',
    })
  }
}
// Assign a chair per department from its professors.
for (const dept of departments) {
  const candidate = faculty.find(
    (f) => f.departmentId === dept.id && f.rank === 'professor' && f.status === 'active',
  )
  if (candidate) {
    candidate.isChair = true
    dept.chairId = candidate.id
  }
}

const programsByDept: Record<string, string[]> = {
  'd-cs': ['BSc Computer Science', 'MSc Artificial Intelligence', 'BSc Software Engineering'],
  'd-math': ['BSc Mathematics', 'MSc Applied Statistics'],
  'd-phys': ['BSc Physics', 'MSc Astrophysics'],
  'd-bio': ['BSc Biology', 'MSc Molecular Biology'],
  'd-bus': ['BBA Business', 'MBA', 'BSc Finance'],
  'd-eng': ['BA English', 'MA Literature'],
  'd-psy': ['BA Psychology', 'MSc Clinical Psychology'],
  'd-econ': ['BSc Economics', 'MSc Economic Policy'],
}
const standings: StudentStanding[] = ['good', 'good', 'good', 'good', 'probation', 'suspended']

export const students: Student[] = []
let stuCounter = 0
for (let i = 0; i < 180; i++) {
  stuCounter++
  const dept = pick(departments)
  const fn = pick(firstNames)
  const ln = pick(lastNames)
  const program = pick(programsByDept[dept.id])
  const level: Student['degreeLevel'] = program.startsWith('M')
    ? 'graduate'
    : program.includes('PhD')
      ? 'doctoral'
      : 'undergraduate'
  const cohortYear = 2021 + Math.floor(rand() * 5)
  const [city, country] = pick(cities)
  const deptFaculty = faculty.filter((f) => f.departmentId === dept.id && f.status === 'active')
  const gpa = between(2.0, 4.0)
  const required = level === 'graduate' ? 36 : 120
  const standing: StudentStanding =
    gpa < 2.0 ? 'suspended' : gpa < 2.5 ? pick(standings) : 'good'
  students.push({
    id: `s-${stuCounter}`,
    universityId: `MU-${cohortYear}-${String(1000 + stuCounter).padStart(5, '0')}`,
    firstName: fn,
    lastName: ln,
    email: `${fn[0].toLowerCase()}${ln.toLowerCase()}${cohortYear % 100}@student.meridian.edu`,
    phone: `+1 (617) 555-${String(2000 + Math.floor(rand() * 7999)).padStart(4, '0')}`,
    dateOfBirth: new Date(
      (2003 - (cohortYear - 2021)) - Math.floor(rand() * 4),
      Math.floor(rand() * 12),
      1 + Math.floor(rand() * 27),
    ).toISOString().slice(0, 10),
    gender: pick(['female', 'male', 'nonbinary', 'undisclosed'] as const),
    departmentId: dept.id,
    program,
    degreeLevel: level,
    cohortYear,
    advisorId: deptFaculty.length ? pick(deptFaculty).id : null,
    gpa,
    creditsearned: Math.min(required, Math.floor(between(0, required))),
    creditsRequired: required,
    standing,
    enrollment:
      standing === 'suspended'
        ? 'leave'
        : rand() > 0.96
          ? 'graduated'
          : 'enrolled',
    status: rand() > 0.94 ? 'archived' : 'active',
    city,
    country,
    createdISO: iso(between(30, 1400)),
    updatedISO: iso(between(1, 60)),
    notes: '',
  })
}

const courseTitles: Record<string, string[]> = {
  'd-cs': ['Intro to Programming', 'Data Structures', 'Algorithms', 'Operating Systems', 'Machine Learning', 'Databases', 'Computer Networks', 'Compilers', 'Distributed Systems'],
  'd-math': ['Calculus I', 'Linear Algebra', 'Real Analysis', 'Probability', 'Discrete Math', 'Differential Equations'],
  'd-phys': ['Classical Mechanics', 'Electromagnetism', 'Quantum Physics', 'Thermodynamics', 'Astrophysics'],
  'd-bio': ['Cell Biology', 'Genetics', 'Ecology', 'Microbiology', 'Neuroscience'],
  'd-bus': ['Principles of Management', 'Corporate Finance', 'Marketing', 'Operations', 'Business Strategy'],
  'd-eng': ['Shakespeare', 'Modern Poetry', 'Creative Writing', 'Literary Theory'],
  'd-psy': ['Intro Psychology', 'Cognitive Psychology', 'Abnormal Psychology', 'Research Methods'],
  'd-econ': ['Microeconomics', 'Macroeconomics', 'Econometrics', 'Game Theory'],
}
const seasons: Course['termSeason'][] = ['Fall', 'Spring', 'Summer']

export const courses: Course[] = []
let courseCounter = 0
for (const dept of departments) {
  const titles = courseTitles[dept.id]
  const deptFaculty = faculty.filter((f) => f.departmentId === dept.id && f.status === 'active')
  titles.forEach((title, idx) => {
    courseCounter++
    const levelNum = ((idx % 5) + 1) * 100
    courses.push({
      id: `c-${courseCounter}`,
      code: `${dept.code}-${levelNum + idx}`,
      title,
      departmentId: dept.id,
      instructorId: deptFaculty.length ? pick(deptFaculty).id : null,
      credits: pick([3, 3, 3, 4]),
      level: String(levelNum) as Course['level'],
      capacity: pick([30, 40, 60, 90, 120]),
      schedule: `${pick(['Mon/Wed', 'Tue/Thu', 'Mon/Wed/Fri', 'Fri'])} ${pick(['09:00-10:30', '10:00-11:30', '13:00-14:30', '15:00-16:30'])}`,
      room: `${dept.building.split(' ')[0]} ${100 + Math.floor(rand() * 200)}`,
      termSeason: pick(seasons),
      prerequisiteIds: [],
      status: rand() > 0.95 ? 'archived' : 'active',
      createdISO: iso(between(100, 1200)),
      updatedISO: iso(between(1, 80)),
      description: `${title} — a ${levelNum}-level course offered by ${dept.name}.`,
    })
  })
}
// Wire up a couple of prerequisites within departments.
for (const dept of departments) {
  const deptCourses = courses.filter((c) => c.departmentId === dept.id)
  for (let i = 1; i < deptCourses.length; i++) {
    if (rand() > 0.5) deptCourses[i].prerequisiteIds = [deptCourses[i - 1].id]
  }
}

export const semesters: Semester[] = [
  { id: 'sem-f25', name: 'Fall 2025', season: 'Fall', year: 2025, startDate: '2025-09-02', endDate: '2025-12-19', registrationOpen: false, isCurrent: false },
  { id: 'sem-s26', name: 'Spring 2026', season: 'Spring', year: 2026, startDate: '2026-01-20', endDate: '2026-05-15', registrationOpen: true, isCurrent: true },
  { id: 'sem-su26', name: 'Summer 2026', season: 'Summer', year: 2026, startDate: '2026-06-01', endDate: '2026-08-14', registrationOpen: true, isCurrent: false },
]

const grades: LetterGrade[] = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'IP', 'IP', 'IP']

export const registrations: Registration[] = []
let regCounter = 0
for (const student of students) {
  if (student.status === 'archived') continue
  const deptCourses = courses.filter(
    (c) => c.departmentId === student.departmentId && c.status === 'active',
  )
  const enrolledCount = 3 + Math.floor(rand() * 3)
  const chosen = new Set<string>()
  for (let i = 0; i < enrolledCount && deptCourses.length; i++) {
    const course = pick(deptCourses)
    const key = `${course.id}-sem-s26`
    if (chosen.has(key)) continue
    chosen.add(key)
    regCounter++
    const completed = rand() > 0.7
    registrations.push({
      id: `r-${regCounter}`,
      studentId: student.id,
      courseId: course.id,
      semesterId: 'sem-s26',
      status: completed ? 'completed' : rand() > 0.9 ? 'waitlisted' : 'registered',
      grade: completed ? pick(grades.filter((g) => g !== 'IP')) : 'IP',
      registeredISO: iso(between(1, 120)),
      updatedISO: iso(between(0, 30)),
    })
  }
}

export const notifications: NotificationItem[] = [
  { id: 'n-1', level: 'warning', title: 'Course near capacity', message: 'CS-301 Algorithms is at 92% capacity for Spring 2026.', createdISO: iso(0), read: false, entity: 'course', entityId: 'c-3', href: '/courses/c-3' },
  { id: 'n-2', level: 'critical', title: 'Students on academic probation', message: '14 students dropped below the 2.5 GPA threshold this term.', createdISO: iso(1), read: false, entity: 'student' },
  { id: 'n-3', level: 'info', title: 'Registration window open', message: 'Spring 2026 registration is now open for all departments.', createdISO: iso(2), read: false, entity: 'semester', entityId: 'sem-s26' },
  { id: 'n-4', level: 'success', title: 'Faculty onboarding complete', message: '3 new faculty members were added to the Physics department.', createdISO: iso(3), read: true, entity: 'faculty' },
  { id: 'n-5', level: 'info', title: 'Weekly report ready', message: 'The enrollment summary report for this week is available.', createdISO: iso(4), read: true, entity: 'system', href: '/reports' },
]

export const audit: AuditRecord[] = [
  { id: 'a-1', actorId: 'u-admin', actorName: 'Dr. Eleanor Voss', action: 'settings', entity: 'system', entityId: 'system', entityLabel: 'Registration window', summary: 'Opened Spring 2026 registration', createdISO: iso(2) },
  { id: 'a-2', actorId: 'u-staff', actorName: 'Marcus Bell', action: 'create', entity: 'faculty', entityId: faculty[0]?.id ?? 'f-401', entityLabel: `${faculty[0]?.firstName} ${faculty[0]?.lastName}`, summary: 'Added new faculty member', createdISO: iso(3) },
  { id: 'a-3', actorId: 'u-admin', actorName: 'Dr. Eleanor Voss', action: 'export', entity: 'student', entityId: 'bulk', entityLabel: 'Student roster', summary: 'Exported 180 student records to CSV', createdISO: iso(5) },
]

export const defaultSettings: SystemSettings = {
  institutionName: 'Meridian University',
  academicYear: '2025 – 2026',
  currentSemesterId: 'sem-s26',
  registrationEnabled: true,
  gradingScale: '4.0',
  timezone: 'America/New_York',
  contactEmail: 'registrar@meridian.edu',
  tableDensity: 'comfortable',
  theme: 'system',
  emailNotifications: true,
  criticalAlerts: true,
}

export function buildSeedDatabase(): DatabaseShape {
  return {
    users,
    students,
    faculty,
    departments,
    courses,
    semesters,
    registrations,
    notifications,
    audit,
    settings: defaultSettings,
  }
}
