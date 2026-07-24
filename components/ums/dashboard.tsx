'use client'

import { Activity, BookOpen, Building2, GraduationCap, TriangleAlert, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useDataStore } from '@/lib/store/data-store'
import { capacityByCourse, dashboardSummary, enrollmentByCohort, studentsByDepartment } from '@/lib/store/metrics'
import { formatNumber, formatPercent, relativeTime } from '@/lib/format'

const chartConfig = {
  students: { label: 'Students', color: 'var(--chart-1)' },
  enrolled: { label: 'Enrolled', color: 'var(--chart-2)' },
  capacity: { label: 'Capacity', color: 'var(--chart-3)' },
}

export function Dashboard() {
  const { db } = useDataStore()
  const summary = dashboardSummary(db)
  const cohorts = enrollmentByCohort(db)
  const departments = studentsByDepartment(db)
  const capacity = capacityByCourse(db).slice(0, 6)
  const cards = [
    { label: 'Active students', value: formatNumber(summary.studentCount), detail: `${summary.atRiskCount} need review`, icon: GraduationCap },
    { label: 'Faculty members', value: formatNumber(summary.facultyCount), detail: `${summary.studentFacultyRatio.toFixed(1)}:1 student ratio`, icon: Users },
    { label: 'Active courses', value: formatNumber(summary.courseCount), detail: formatPercent(summary.capacityUtilization) + ' capacity used', icon: BookOpen },
    { label: 'Departments', value: formatNumber(summary.departmentCount), detail: `${summary.registrationCount} current registrations`, icon: Building2 },
  ]

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Institution summary">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <Card key={label} className="shadow-none">
            <CardHeader className="flex-row items-start justify-between gap-4 pb-2">
              <CardDescription>{label}</CardDescription>
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <p className="font-mono text-2xl font-semibold tracking-tight">{value}</p>
              <p className="text-xs text-muted-foreground">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Enrollment trajectory</CardTitle>
            <CardDescription>Active students by incoming cohort</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <LineChart data={cohorts} margin={{ left: -12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="year" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line dataKey="students" type="monotone" stroke="var(--color-students)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Department distribution</CardTitle>
            <CardDescription>Current active enrollment</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <BarChart data={departments} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="department" type="category" tickLine={false} axisLine={false} width={38} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="students" fill="var(--color-students)" radius={3} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div className="flex flex-col gap-1.5"><CardTitle>Course capacity watch</CardTitle><CardDescription>Highest utilization this term</CardDescription></div>
            <Badge variant="outline"><Activity aria-hidden="true" /> Live</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {capacity.map((course) => (
              <div key={course.code} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0"><span className="font-mono font-medium">{course.code}</span><span className="ml-2 truncate text-muted-foreground">{course.title}</span></div>
                  <span className="shrink-0 font-mono text-xs">{course.enrolled}/{course.capacity}</span>
                </div>
                <Progress value={Math.min(course.utilization * 100, 100)} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader><CardTitle>Operational feed</CardTitle><CardDescription>Latest system activity</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {db.audit.slice(0, 6).map((event) => (
              <div key={event.id} className="flex gap-3">
                <div className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{event.summary}</p><p className="text-xs text-muted-foreground">{event.actorName} · {relativeTime(event.createdISO)}</p></div>
              </div>
            ))}
            {summary.atRiskCount > 0 && <div className="flex items-center gap-2 border-t pt-4 text-sm text-destructive"><TriangleAlert className="size-4" />{summary.atRiskCount} students require academic review</div>}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
