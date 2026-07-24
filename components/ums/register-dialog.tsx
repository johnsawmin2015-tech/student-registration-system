'use client'

import { useState } from 'react'
import { PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDataStore } from '@/lib/store/data-store'
import { courseEnrollment } from '@/lib/store/metrics'

export function RegisterDialog({ disabled }: { disabled?: boolean }) {
  const { db, registerStudent } = useDataStore()
  const [open, setOpen] = useState(false)
  const [studentId, setStudentId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const semesterId = db.settings.currentSemesterId
  const students = db.students.filter((s) => s.status === 'active')
  const courses = db.courses.filter((c) => c.status === 'active')

  const submit = () => {
    setError(null)
    if (!studentId || !courseId) { setError('Select both a student and a course.'); return }
    const result = registerStudent(studentId, courseId, semesterId)
    if (!result.ok) { setError(result.reason); return }
    setStudentId(''); setCourseId(''); setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={disabled} />}><PlusCircle data-icon="inline-start" />New registration</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Register student for a course</DialogTitle><DialogDescription>Enrollment is validated against capacity and duplicate checks. Full courses are waitlisted automatically.</DialogDescription></DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <label className="flex flex-col gap-2 text-sm font-medium">Student
            <Select value={studentId} onValueChange={(v) => setStudentId(v ?? '')}><SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger><SelectContent><SelectGroup>{students.map((s) => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} · {s.universityId}</SelectItem>)}</SelectGroup></SelectContent></Select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">Course
            <Select value={courseId} onValueChange={(v) => setCourseId(v ?? '')}><SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger><SelectContent><SelectGroup>{courses.map((c) => { const enrolled = courseEnrollment(db, c.id); return <SelectItem key={c.id} value={c.id}>{c.code} · {c.title} ({enrolled}/{c.capacity})</SelectItem> })}</SelectGroup></SelectContent></Select>
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit}>Confirm registration</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
