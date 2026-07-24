'use client'

import { useMemo, useState } from 'react'
import { Archive, BookOpen, ChevronRight, Download, GraduationCap, Search, UserRound, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDataStore } from '@/lib/store/data-store'
import { courseEnrollment, departmentStats } from '@/lib/store/metrics'
import { downloadCsv, formatCurrency, formatDate } from '@/lib/format'

type RecordsView = 'students' | 'faculty' | 'departments' | 'courses' | 'registrations'

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={status === 'active' || status === 'registered' || status === 'good' ? 'default' : status === 'archived' || status === 'dropped' ? 'outline' : 'secondary'}>{status}</Badge>
}

export function RecordsWorkspace({ view }: { view: RecordsView }) {
  const store = useDataStore()
  const { db } = store
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('all')
  const q = query.toLowerCase().trim()
  const departmentName = (id: string) => db.departments.find((d) => d.id === id)?.name ?? 'Unassigned'
  const facultyName = (id: string | null) => { const f = db.faculty.find((x) => x.id === id); return f ? `${f.firstName} ${f.lastName}` : 'Unassigned' }
  const studentName = (id: string) => { const s = db.students.find((x) => x.id === id); return s ? `${s.firstName} ${s.lastName}` : 'Unknown' }
  const courseName = (id: string) => db.courses.find((c) => c.id === id)?.code ?? 'Unknown'

  const rows = useMemo(() => {
    if (view === 'students') return db.students.filter((s) => (department === 'all' || s.departmentId === department) && (!q || `${s.firstName} ${s.lastName} ${s.universityId} ${s.email}`.toLowerCase().includes(q)))
    if (view === 'faculty') return db.faculty.filter((f) => (department === 'all' || f.departmentId === department) && (!q || `${f.firstName} ${f.lastName} ${f.employeeId} ${f.specialization}`.toLowerCase().includes(q)))
    if (view === 'departments') return db.departments.filter((d) => !q || `${d.code} ${d.name} ${d.faculty}`.toLowerCase().includes(q))
    if (view === 'courses') return db.courses.filter((c) => (department === 'all' || c.departmentId === department) && (!q || `${c.code} ${c.title} ${c.room}`.toLowerCase().includes(q)))
    return db.registrations.filter((r) => !q || `${studentName(r.studentId)} ${courseName(r.courseId)}`.toLowerCase().includes(q))
  }, [view, db, department, q])

  const titles = {
    students: ['Student registry', 'Academic records, standing, and progression'], faculty: ['Faculty directory', 'Appointments, workload, and departmental roles'], departments: ['Academic departments', 'Institutional structure, leadership, and budgets'], courses: ['Course catalog', 'Curriculum, instruction, and capacity planning'], registrations: ['Course registrations', 'Term enrollment, waitlists, and outcomes'],
  } as const
  const [title, description] = titles[view]
  const exportRows = () => downloadCsv(`${view}-${new Date().toISOString().slice(0,10)}.csv`, rows as unknown as Record<string, unknown>[])

  return (
    <Card className="shadow-none">
      <CardHeader className="border-b">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="flex flex-col gap-1.5"><CardTitle className="text-lg">{title}</CardTitle><CardDescription>{description}</CardDescription></div>
          <Button variant="outline" size="sm" onClick={exportRows}><Download data-icon="inline-start" />Export CSV</Button>
        </div>
        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${view}...`} className="pl-9" aria-label={`Search ${view}`} /></div>
          {view !== 'departments' && view !== 'registrations' && <Select value={department} onValueChange={(v) => setDepartment(v ?? 'all')}><SelectTrigger className="w-full md:w-56"><SelectValue placeholder="All departments" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All departments</SelectItem>{db.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.code} · {d.name}</SelectItem>)}</SelectGroup></SelectContent></Select>}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>{view === 'students' ? <TableRow><TableHead>Student</TableHead><TableHead>Program</TableHead><TableHead>GPA</TableHead><TableHead>Progress</TableHead><TableHead>Standing</TableHead><TableHead className="text-right">Action</TableHead></TableRow> : view === 'faculty' ? <TableRow><TableHead>Faculty member</TableHead><TableHead>Department</TableHead><TableHead>Rank</TableHead><TableHead>Office</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow> : view === 'departments' ? <TableRow><TableHead>Department</TableHead><TableHead>Chair</TableHead><TableHead>Students</TableHead><TableHead>Faculty</TableHead><TableHead>Budget</TableHead><TableHead>Status</TableHead></TableRow> : view === 'courses' ? <TableRow><TableHead>Course</TableHead><TableHead>Instructor</TableHead><TableHead>Schedule</TableHead><TableHead>Enrollment</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow> : <TableRow><TableHead>Student</TableHead><TableHead>Course</TableHead><TableHead>Semester</TableHead><TableHead>Registered</TableHead><TableHead>Grade</TableHead><TableHead>Status</TableHead></TableRow>}</TableHeader>
            <TableBody>
              {view === 'students' && (rows as typeof db.students).map((s) => <TableRow key={s.id}><TableCell><div className="flex items-center gap-3"><div className="flex size-8 items-center justify-center rounded-md bg-secondary"><GraduationCap className="size-4" /></div><div><p className="font-medium">{s.firstName} {s.lastName}</p><p className="font-mono text-xs text-muted-foreground">{s.universityId}</p></div></div></TableCell><TableCell><p>{s.program}</p><p className="text-xs text-muted-foreground">{departmentName(s.departmentId)}</p></TableCell><TableCell className="font-mono">{s.gpa.toFixed(2)}</TableCell><TableCell><div className="flex w-28 flex-col gap-1"><Progress value={(s.creditsearned/s.creditsRequired)*100}/><span className="font-mono text-[11px] text-muted-foreground">{s.creditsearned}/{s.creditsRequired} cr.</span></div></TableCell><TableCell><StatusBadge status={s.standing}/></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={`Archive ${s.firstName}`} onClick={() => store.setStudentStatus(s.id, s.status === 'archived' ? 'active' : 'archived')}>{s.status === 'archived' ? <ChevronRight/> : <Archive/>}</Button></TableCell></TableRow>)}
              {view === 'faculty' && (rows as typeof db.faculty).map((f) => <TableRow key={f.id}><TableCell><div className="flex items-center gap-3"><div className="flex size-8 items-center justify-center rounded-md bg-secondary"><UserRound className="size-4"/></div><div><p className="font-medium">{f.firstName} {f.lastName}</p><p className="font-mono text-xs text-muted-foreground">{f.employeeId}</p></div></div></TableCell><TableCell>{departmentName(f.departmentId)}</TableCell><TableCell className="capitalize">{f.rank}</TableCell><TableCell className="font-mono text-xs">{f.office}</TableCell><TableCell><StatusBadge status={f.status}/></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={`Archive ${f.firstName}`} onClick={() => store.setFacultyStatus(f.id, f.status === 'archived' ? 'active' : 'archived')}><Archive/></Button></TableCell></TableRow>)}
              {view === 'departments' && (rows as typeof db.departments).map((d) => { const stats = departmentStats(db,d.id); return <TableRow key={d.id}><TableCell><div className="flex items-center gap-3"><div className="flex size-8 items-center justify-center rounded-md bg-secondary"><Users className="size-4"/></div><div><p className="font-medium">{d.name}</p><p className="font-mono text-xs text-muted-foreground">{d.code} · {d.building}</p></div></div></TableCell><TableCell>{facultyName(d.chairId)}</TableCell><TableCell className="font-mono">{stats.studentCount}</TableCell><TableCell className="font-mono">{stats.facultyCount}</TableCell><TableCell className="font-mono">{formatCurrency(d.budget)}</TableCell><TableCell><StatusBadge status={d.status}/></TableCell></TableRow> })}
              {view === 'courses' && (rows as typeof db.courses).map((c) => { const enrolled=courseEnrollment(db,c.id); return <TableRow key={c.id}><TableCell><div><p className="font-medium">{c.title}</p><p className="font-mono text-xs text-muted-foreground">{c.code} · {c.credits} credits</p></div></TableCell><TableCell>{facultyName(c.instructorId)}</TableCell><TableCell><p>{c.schedule}</p><p className="font-mono text-xs text-muted-foreground">{c.room}</p></TableCell><TableCell><div className="flex w-24 flex-col gap-1"><Progress value={(enrolled/c.capacity)*100}/><span className="font-mono text-[11px] text-muted-foreground">{enrolled}/{c.capacity}</span></div></TableCell><TableCell><StatusBadge status={c.status}/></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={`Archive ${c.code}`} onClick={() => store.setCourseStatus(c.id, c.status === 'archived' ? 'active' : 'archived')}><Archive/></Button></TableCell></TableRow> })}
              {view === 'registrations' && (rows as typeof db.registrations).map((r) => <TableRow key={r.id}><TableCell>{studentName(r.studentId)}</TableCell><TableCell className="font-mono">{courseName(r.courseId)}</TableCell><TableCell>{db.semesters.find((s) => s.id===r.semesterId)?.name}</TableCell><TableCell>{formatDate(r.registeredISO)}</TableCell><TableCell className="font-mono">{r.grade}</TableCell><TableCell><StatusBadge status={r.status}/></TableCell></TableRow>)}
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No records match your filters.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground"><span>{rows.length} records</span><span>Prototype data · browser persisted</span></div>
      </CardContent>
    </Card>
  )
}
