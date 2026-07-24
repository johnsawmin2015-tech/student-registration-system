'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type {
  AuditAction,
  AuditEntity,
  AuditRecord,
  Course,
  DatabaseShape,
  Department,
  Faculty,
  NotificationItem,
  Registration,
  Role,
  Semester,
  Student,
  SystemSettings,
  UserAccount,
} from '@/lib/domain/types'
import { buildSeedDatabase } from '@/lib/domain/seed'
import { loadDatabase, resetDatabase, saveDatabase } from './persistence'

const SESSION_KEY = 'meridian-ums:session:v1'
const THEME_KEY = 'meridian-ums:theme:v1'

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

interface DataStoreValue {
  db: DatabaseShape
  ready: boolean
  currentUser: UserAccount | null
  // session
  login: (userId: string) => void
  logout: () => void
  switchRole: (role: Role) => void
  // students
  createStudent: (input: Omit<Student, 'id' | 'createdISO' | 'updatedISO'>) => Student
  updateStudent: (id: string, patch: Partial<Student>) => void
  setStudentStatus: (id: string, status: Student['status']) => void
  deleteStudent: (id: string) => void
  // faculty
  createFaculty: (input: Omit<Faculty, 'id' | 'createdISO' | 'updatedISO'>) => Faculty
  updateFaculty: (id: string, patch: Partial<Faculty>) => void
  setFacultyStatus: (id: string, status: Faculty['status']) => void
  deleteFaculty: (id: string) => void
  // departments
  createDepartment: (input: Omit<Department, 'id' | 'createdISO' | 'updatedISO'>) => Department
  updateDepartment: (id: string, patch: Partial<Department>) => void
  deleteDepartment: (id: string) => void
  // courses
  createCourse: (input: Omit<Course, 'id' | 'createdISO' | 'updatedISO'>) => Course
  updateCourse: (id: string, patch: Partial<Course>) => void
  setCourseStatus: (id: string, status: Course['status']) => void
  deleteCourse: (id: string) => void
  // registrations
  registerStudent: (studentId: string, courseId: string, semesterId: string) =>
    | { ok: true; registration: Registration }
    | { ok: false; reason: string }
  dropRegistration: (id: string) => void
  updateRegistration: (id: string, patch: Partial<Registration>) => void
  // semesters
  setCurrentSemester: (id: string) => void
  updateSemester: (id: string, patch: Partial<Semester>) => void
  // notifications
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  // settings
  updateSettings: (patch: Partial<SystemSettings>) => void
  resetDemoData: () => void
  // theme
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

const DataStoreContext = createContext<DataStoreValue | null>(null)

export function DataStoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DatabaseShape>(() => buildSeedDatabase())
  const [ready, setReady] = useState(false)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  // Hydrate from browser storage on mount.
  useEffect(() => {
    const loaded = loadDatabase()
    setDb(loaded)
    try {
      const sessionId = window.localStorage.getItem(SESSION_KEY)
      if (sessionId) {
        const user = loaded.users.find((u) => u.id === sessionId) ?? null
        setCurrentUser(user)
      }
      const storedTheme = window.localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null
      const initialTheme =
        storedTheme ??
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      setTheme(initialTheme)
    } catch {
      /* ignore */
    }
    setReady(true)
  }, [])

  // Apply theme class to <html>.
  useEffect(() => {
    if (!ready) return
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.classList.toggle('light', theme === 'light')
    try {
      window.localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme, ready])

  const commit = useCallback((updater: (prev: DatabaseShape) => DatabaseShape) => {
    setDb((prev) => {
      const next = updater(prev)
      saveDatabase(next)
      return next
    })
  }, [])

  const emitAudit = useCallback(
    (
      draft: DatabaseShape,
      action: AuditAction,
      entity: AuditEntity,
      entityId: string,
      entityLabel: string,
      summary: string,
    ): DatabaseShape => {
      const record: AuditRecord = {
        id: uid('a'),
        actorId: currentUser?.id ?? 'system',
        actorName: currentUser?.name ?? 'System',
        action,
        entity,
        entityId,
        entityLabel,
        summary,
        createdISO: new Date().toISOString(),
      }
      return { ...draft, audit: [record, ...draft.audit] }
    },
    [currentUser],
  )

  const pushNotification = useCallback(
    (draft: DatabaseShape, n: Omit<NotificationItem, 'id' | 'createdISO' | 'read'>): DatabaseShape => {
      const item: NotificationItem = {
        ...n,
        id: uid('n'),
        createdISO: new Date().toISOString(),
        read: false,
      }
      return { ...draft, notifications: [item, ...draft.notifications] }
    },
    [],
  )

  // ---- session ----
  const login = useCallback((userId: string) => {
    setDb((prev) => {
      const user = prev.users.find((u) => u.id === userId) ?? null
      setCurrentUser(user)
      try {
        window.localStorage.setItem(SESSION_KEY, userId)
      } catch {
        /* ignore */
      }
      if (!user) return prev
      const next = { ...prev }
      next.audit = [
        {
          id: uid('a'),
          actorId: user.id,
          actorName: user.name,
          action: 'login',
          entity: 'session',
          entityId: user.id,
          entityLabel: user.name,
          summary: `Signed in as ${user.role}`,
          createdISO: new Date().toISOString(),
        },
        ...prev.audit,
      ]
      saveDatabase(next)
      return next
    })
  }, [])

  const logout = useCallback(() => {
    setCurrentUser(null)
    try {
      window.localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const switchRole = useCallback((role: Role) => {
    setDb((prev) => {
      const user = prev.users.find((u) => u.role === role) ?? null
      setCurrentUser(user)
      if (user) {
        try {
          window.localStorage.setItem(SESSION_KEY, user.id)
        } catch {
          /* ignore */
        }
      }
      return prev
    })
  }, [])

  const now = () => new Date().toISOString()

  // ---- students ----
  const createStudent: DataStoreValue['createStudent'] = useCallback(
    (input) => {
      const student: Student = { ...input, id: uid('s'), createdISO: now(), updatedISO: now() }
      commit((prev) =>
        emitAudit(
          { ...prev, students: [student, ...prev.students] },
          'create',
          'student',
          student.id,
          `${student.firstName} ${student.lastName}`,
          `Created student ${student.universityId}`,
        ),
      )
      return student
    },
    [commit, emitAudit],
  )

  const updateStudent: DataStoreValue['updateStudent'] = useCallback(
    (id, patch) => {
      commit((prev) => {
        const target = prev.students.find((s) => s.id === id)
        const students = prev.students.map((s) =>
          s.id === id ? { ...s, ...patch, updatedISO: now() } : s,
        )
        return emitAudit(
          { ...prev, students },
          'update',
          'student',
          id,
          target ? `${target.firstName} ${target.lastName}` : id,
          'Updated student record',
        )
      })
    },
    [commit, emitAudit],
  )

  const setStudentStatus: DataStoreValue['setStudentStatus'] = useCallback(
    (id, status) => {
      commit((prev) => {
        const target = prev.students.find((s) => s.id === id)
        const students = prev.students.map((s) =>
          s.id === id ? { ...s, status, updatedISO: now() } : s,
        )
        return emitAudit(
          { ...prev, students },
          status === 'archived' ? 'archive' : 'restore',
          'student',
          id,
          target ? `${target.firstName} ${target.lastName}` : id,
          status === 'archived' ? 'Archived student' : 'Restored student',
        )
      })
    },
    [commit, emitAudit],
  )

  const deleteStudent: DataStoreValue['deleteStudent'] = useCallback(
    (id) => {
      commit((prev) => {
        const target = prev.students.find((s) => s.id === id)
        return emitAudit(
          {
            ...prev,
            students: prev.students.filter((s) => s.id !== id),
            registrations: prev.registrations.filter((r) => r.studentId !== id),
          },
          'delete',
          'student',
          id,
          target ? `${target.firstName} ${target.lastName}` : id,
          'Deleted student and related registrations',
        )
      })
    },
    [commit, emitAudit],
  )

  // ---- faculty ----
  const createFaculty: DataStoreValue['createFaculty'] = useCallback(
    (input) => {
      const f: Faculty = { ...input, id: uid('f'), createdISO: now(), updatedISO: now() }
      commit((prev) =>
        emitAudit(
          { ...prev, faculty: [f, ...prev.faculty] },
          'create',
          'faculty',
          f.id,
          `${f.firstName} ${f.lastName}`,
          `Added faculty ${f.employeeId}`,
        ),
      )
      return f
    },
    [commit, emitAudit],
  )

  const updateFaculty: DataStoreValue['updateFaculty'] = useCallback(
    (id, patch) => {
      commit((prev) => {
        const target = prev.faculty.find((f) => f.id === id)
        let faculty = prev.faculty.map((f) =>
          f.id === id ? { ...f, ...patch, updatedISO: now() } : f,
        )
        let departments = prev.departments
        // Keep department chair in sync if isChair toggled.
        if (patch.isChair && target) {
          faculty = faculty.map((f) =>
            f.departmentId === target.departmentId && f.id !== id
              ? { ...f, isChair: false }
              : f,
          )
          departments = departments.map((d) =>
            d.id === target.departmentId ? { ...d, chairId: id } : d,
          )
        }
        return emitAudit(
          { ...prev, faculty, departments },
          'update',
          'faculty',
          id,
          target ? `${target.firstName} ${target.lastName}` : id,
          'Updated faculty record',
        )
      })
    },
    [commit, emitAudit],
  )

  const setFacultyStatus: DataStoreValue['setFacultyStatus'] = useCallback(
    (id, status) => {
      commit((prev) => {
        const target = prev.faculty.find((f) => f.id === id)
        const faculty = prev.faculty.map((f) =>
          f.id === id ? { ...f, status, updatedISO: now() } : f,
        )
        return emitAudit(
          { ...prev, faculty },
          status === 'archived' ? 'archive' : 'restore',
          'faculty',
          id,
          target ? `${target.firstName} ${target.lastName}` : id,
          status === 'archived' ? 'Archived faculty' : 'Restored faculty',
        )
      })
    },
    [commit, emitAudit],
  )

  const deleteFaculty: DataStoreValue['deleteFaculty'] = useCallback(
    (id) => {
      commit((prev) => {
        const target = prev.faculty.find((f) => f.id === id)
        return emitAudit(
          {
            ...prev,
            faculty: prev.faculty.filter((f) => f.id !== id),
            courses: prev.courses.map((c) =>
              c.instructorId === id ? { ...c, instructorId: null } : c,
            ),
          },
          'delete',
          'faculty',
          id,
          target ? `${target.firstName} ${target.lastName}` : id,
          'Deleted faculty member',
        )
      })
    },
    [commit, emitAudit],
  )

  // ---- departments ----
  const createDepartment: DataStoreValue['createDepartment'] = useCallback(
    (input) => {
      const d: Department = { ...input, id: uid('d'), createdISO: now(), updatedISO: now() }
      commit((prev) =>
        emitAudit(
          { ...prev, departments: [d, ...prev.departments] },
          'create',
          'department',
          d.id,
          d.name,
          `Created department ${d.code}`,
        ),
      )
      return d
    },
    [commit, emitAudit],
  )

  const updateDepartment: DataStoreValue['updateDepartment'] = useCallback(
    (id, patch) => {
      commit((prev) => {
        const target = prev.departments.find((d) => d.id === id)
        const departments = prev.departments.map((d) =>
          d.id === id ? { ...d, ...patch, updatedISO: now() } : d,
        )
        return emitAudit(
          { ...prev, departments },
          'update',
          'department',
          id,
          target?.name ?? id,
          'Updated department',
        )
      })
    },
    [commit, emitAudit],
  )

  const deleteDepartment: DataStoreValue['deleteDepartment'] = useCallback(
    (id) => {
      commit((prev) => {
        const target = prev.departments.find((d) => d.id === id)
        return emitAudit(
          { ...prev, departments: prev.departments.filter((d) => d.id !== id) },
          'delete',
          'department',
          id,
          target?.name ?? id,
          'Deleted department',
        )
      })
    },
    [commit, emitAudit],
  )

  // ---- courses ----
  const createCourse: DataStoreValue['createCourse'] = useCallback(
    (input) => {
      const c: Course = { ...input, id: uid('c'), createdISO: now(), updatedISO: now() }
      commit((prev) =>
        emitAudit(
          { ...prev, courses: [c, ...prev.courses] },
          'create',
          'course',
          c.id,
          `${c.code} ${c.title}`,
          `Created course ${c.code}`,
        ),
      )
      return c
    },
    [commit, emitAudit],
  )

  const updateCourse: DataStoreValue['updateCourse'] = useCallback(
    (id, patch) => {
      commit((prev) => {
        const target = prev.courses.find((c) => c.id === id)
        const courses = prev.courses.map((c) =>
          c.id === id ? { ...c, ...patch, updatedISO: now() } : c,
        )
        return emitAudit(
          { ...prev, courses },
          'update',
          'course',
          id,
          target ? `${target.code} ${target.title}` : id,
          'Updated course',
        )
      })
    },
    [commit, emitAudit],
  )

  const setCourseStatus: DataStoreValue['setCourseStatus'] = useCallback(
    (id, status) => {
      commit((prev) => {
        const target = prev.courses.find((c) => c.id === id)
        const courses = prev.courses.map((c) =>
          c.id === id ? { ...c, status, updatedISO: now() } : c,
        )
        return emitAudit(
          { ...prev, courses },
          status === 'archived' ? 'archive' : 'restore',
          'course',
          id,
          target ? `${target.code} ${target.title}` : id,
          status === 'archived' ? 'Archived course' : 'Restored course',
        )
      })
    },
    [commit, emitAudit],
  )

  const deleteCourse: DataStoreValue['deleteCourse'] = useCallback(
    (id) => {
      commit((prev) => {
        const target = prev.courses.find((c) => c.id === id)
        return emitAudit(
          {
            ...prev,
            courses: prev.courses.filter((c) => c.id !== id),
            registrations: prev.registrations.filter((r) => r.courseId !== id),
          },
          'delete',
          'course',
          id,
          target ? `${target.code} ${target.title}` : id,
          'Deleted course and related registrations',
        )
      })
    },
    [commit, emitAudit],
  )

  // ---- registrations ----
  const registerStudent: DataStoreValue['registerStudent'] = useCallback(
    (studentId, courseId, semesterId) => {
      const course = db.courses.find((c) => c.id === courseId)
      if (!course) return { ok: false, reason: 'Course not found.' }
      const duplicate = db.registrations.find(
        (r) =>
          r.studentId === studentId &&
          r.courseId === courseId &&
          r.semesterId === semesterId &&
          r.status !== 'dropped',
      )
      if (duplicate) {
        return { ok: false, reason: 'Student is already registered for this course this term.' }
      }
      const enrolled = db.registrations.filter(
        (r) => r.courseId === courseId && r.semesterId === semesterId && r.status !== 'dropped',
      ).length
      const atCapacity = enrolled >= course.capacity
      const registration: Registration = {
        id: uid('r'),
        studentId,
        courseId,
        semesterId,
        status: atCapacity ? 'waitlisted' : 'registered',
        grade: 'IP',
        registeredISO: now(),
        updatedISO: now(),
      }
      const student = db.students.find((s) => s.id === studentId)
      commit((prev) =>
        emitAudit(
          { ...prev, registrations: [registration, ...prev.registrations] },
          'register',
          'registration',
          registration.id,
          `${student ? student.firstName + ' ' + student.lastName : studentId} → ${course.code}`,
          atCapacity
            ? `Waitlisted (course at capacity)`
            : `Registered for ${course.code}`,
        ),
      )
      return { ok: true, registration }
    },
    [db, commit, emitAudit],
  )

  const dropRegistration: DataStoreValue['dropRegistration'] = useCallback(
    (id) => {
      commit((prev) => {
        const target = prev.registrations.find((r) => r.id === id)
        const registrations = prev.registrations.map((r) =>
          r.id === id ? { ...r, status: 'dropped' as const, updatedISO: now() } : r,
        )
        return emitAudit(
          { ...prev, registrations },
          'drop',
          'registration',
          id,
          target?.id ?? id,
          'Dropped registration',
        )
      })
    },
    [commit, emitAudit],
  )

  const updateRegistration: DataStoreValue['updateRegistration'] = useCallback(
    (id, patch) => {
      commit((prev) => ({
        ...prev,
        registrations: prev.registrations.map((r) =>
          r.id === id ? { ...r, ...patch, updatedISO: now() } : r,
        ),
      }))
    },
    [commit],
  )

  // ---- semesters ----
  const setCurrentSemester: DataStoreValue['setCurrentSemester'] = useCallback(
    (id) => {
      commit((prev) => ({
        ...prev,
        semesters: prev.semesters.map((s) => ({ ...s, isCurrent: s.id === id })),
        settings: { ...prev.settings, currentSemesterId: id },
      }))
    },
    [commit],
  )

  const updateSemester: DataStoreValue['updateSemester'] = useCallback(
    (id, patch) => {
      commit((prev) => ({
        ...prev,
        semesters: prev.semesters.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }))
    },
    [commit],
  )

  // ---- notifications ----
  const markNotificationRead: DataStoreValue['markNotificationRead'] = useCallback(
    (id) => {
      commit((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        ),
      }))
    },
    [commit],
  )

  const markAllNotificationsRead: DataStoreValue['markAllNotificationsRead'] = useCallback(() => {
    commit((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }))
  }, [commit])

  // ---- settings ----
  const updateSettings: DataStoreValue['updateSettings'] = useCallback(
    (patch) => {
      commit((prev) =>
        emitAudit(
          { ...prev, settings: { ...prev.settings, ...patch } },
          'settings',
          'system',
          'settings',
          'System settings',
          'Updated system settings',
        ),
      )
    },
    [commit, emitAudit],
  )

  const resetDemoData: DataStoreValue['resetDemoData'] = useCallback(() => {
    const seed = resetDatabase()
    setDb(seed)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo<DataStoreValue>(
    () => ({
      db,
      ready,
      currentUser,
      login,
      logout,
      switchRole,
      createStudent,
      updateStudent,
      setStudentStatus,
      deleteStudent,
      createFaculty,
      updateFaculty,
      setFacultyStatus,
      deleteFaculty,
      createDepartment,
      updateDepartment,
      deleteDepartment,
      createCourse,
      updateCourse,
      setCourseStatus,
      deleteCourse,
      registerStudent,
      dropRegistration,
      updateRegistration,
      setCurrentSemester,
      updateSemester,
      markNotificationRead,
      markAllNotificationsRead,
      updateSettings,
      resetDemoData,
      theme,
      toggleTheme,
    }),
    [
      db, ready, currentUser, login, logout, switchRole,
      createStudent, updateStudent, setStudentStatus, deleteStudent,
      createFaculty, updateFaculty, setFacultyStatus, deleteFaculty,
      createDepartment, updateDepartment, deleteDepartment,
      createCourse, updateCourse, setCourseStatus, deleteCourse,
      registerStudent, dropRegistration, updateRegistration,
      setCurrentSemester, updateSemester,
      markNotificationRead, markAllNotificationsRead,
      updateSettings, resetDemoData, theme, toggleTheme,
    ],
  )

  return <DataStoreContext.Provider value={value}>{children}</DataStoreContext.Provider>
}

export function useDataStore() {
  const ctx = useContext(DataStoreContext)
  if (!ctx) throw new Error('useDataStore must be used within DataStoreProvider')
  return ctx
}
