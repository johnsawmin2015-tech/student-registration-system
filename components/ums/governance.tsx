'use client'

import { useState } from 'react'
import { Bell, CheckCheck, Download, FileClock, Info, RotateCcw, Settings2, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDataStore } from '@/lib/store/data-store'
import { dashboardSummary, standingBreakdown, studentsByDepartment } from '@/lib/store/metrics'
import { downloadCsv, formatDateTime, formatNumber, formatPercent, relativeTime } from '@/lib/format'

type GovernanceView = 'reports' | 'notifications' | 'audit' | 'settings'

export function GovernanceWorkspace({ view }: { view: GovernanceView }) {
  const store = useDataStore()
  const { db } = store
  if (view === 'reports') return <Reports />
  if (view === 'notifications') return <Notifications />
  if (view === 'audit') return <Audit />
  return <Settings />
}

function Reports() {
  const { db } = useDataStore()
  const summary = dashboardSummary(db)
  const standing = standingBreakdown(db)
  const depts = studentsByDepartment(db)
  const exportReport = () => downloadCsv('institutional-summary.csv', depts as unknown as Record<string, unknown>[])
  return <div className="flex flex-col gap-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-lg font-semibold">Institutional reports</h2><p className="text-sm text-muted-foreground">Decision-ready enrollment and academic health indicators.</p></div><Button variant="outline" onClick={exportReport}><Download data-icon="inline-start"/>Export report</Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Enrollment',formatNumber(summary.studentCount),'Active records'],['Average GPA',summary.avgGpa.toFixed(2),'Institution-wide'],['At risk',formatNumber(summary.atRiskCount),'Review queue'],['Capacity',formatPercent(summary.capacityUtilization),'Course utilization']].map(([a,b,c])=><Card key={a} className="shadow-none"><CardHeader className="pb-2"><CardDescription>{a}</CardDescription></CardHeader><CardContent><p className="font-mono text-2xl font-semibold">{b}</p><p className="text-xs text-muted-foreground">{c}</p></CardContent></Card>)}</div><div className="grid gap-4 lg:grid-cols-2"><Card className="shadow-none"><CardHeader><CardTitle>Academic standing</CardTitle><CardDescription>Current active population</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{Object.entries(standing).map(([name,count])=><div key={name} className="flex items-center justify-between border-b pb-3 last:border-0"><span className="capitalize">{name}</span><span className="font-mono font-semibold">{count}</span></div>)}</CardContent></Card><Card className="shadow-none"><CardHeader><CardTitle>Enrollment by department</CardTitle><CardDescription>Ranked by active student count</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{depts.map((d,i)=><div key={d.department} className="flex items-center gap-3"><span className="w-5 font-mono text-xs text-muted-foreground">{String(i+1).padStart(2,'0')}</span><div className="flex-1"><p className="text-sm font-medium">{d.name}</p><p className="font-mono text-xs text-muted-foreground">{d.department}</p></div><span className="font-mono font-semibold">{d.students}</span></div>)}</CardContent></Card></div></div>
}

function Notifications() {
  const { db, markAllNotificationsRead, markNotificationRead } = useDataStore()
  return <Card className="shadow-none"><CardHeader className="flex-row items-start justify-between gap-4 border-b"><div><CardTitle>Notification center</CardTitle><CardDescription>Operational alerts and academic events</CardDescription></div><Button variant="outline" size="sm" onClick={markAllNotificationsRead}><CheckCheck data-icon="inline-start"/>Mark all read</Button></CardHeader><CardContent className="divide-y p-0">{db.notifications.map((n)=><button key={n.id} onClick={()=>markNotificationRead(n.id)} className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"><div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">{n.level==='critical'||n.level==='warning'?<TriangleAlert className="size-4"/>:<Info className="size-4"/>}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="font-medium">{n.title}</p>{!n.read&&<span className="size-1.5 rounded-full bg-primary"/>}</div><p className="mt-1 text-sm text-muted-foreground">{n.message}</p><p className="mt-2 font-mono text-xs text-muted-foreground">{relativeTime(n.createdISO)}</p></div></button>)}</CardContent></Card>
}

function Audit() {
  const { db } = useDataStore()
  const exportAudit=()=>downloadCsv('audit-log.csv',db.audit as unknown as Record<string,unknown>[])
  return <Card className="shadow-none"><CardHeader className="flex-row items-start justify-between gap-4 border-b"><div><CardTitle>Audit log</CardTitle><CardDescription>Immutable prototype activity record</CardDescription></div><Button variant="outline" size="sm" onClick={exportAudit}><Download data-icon="inline-start"/>Export</Button></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Timestamp</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Details</TableHead></TableRow></TableHeader><TableBody>{db.audit.map((a)=><TableRow key={a.id}><TableCell className="whitespace-nowrap font-mono text-xs">{formatDateTime(a.createdISO)}</TableCell><TableCell>{a.actorName}</TableCell><TableCell><Badge variant="outline">{a.action}</Badge></TableCell><TableCell className="capitalize">{a.entity}</TableCell><TableCell>{a.summary}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
}

function Settings() {
  const { db, updateSettings, resetDemoData } = useDataStore()
  const [name,setName]=useState(db.settings.institutionName)
  const [email,setEmail]=useState(db.settings.contactEmail)
  return <div className="grid gap-4 xl:grid-cols-[1fr_340px]"><Card className="shadow-none"><CardHeader><CardTitle>Institution settings</CardTitle><CardDescription>Global academic and communication configuration</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><label className="flex flex-col gap-2 text-sm font-medium">Institution name<Input value={name} onChange={(e)=>setName(e.target.value)}/></label><label className="flex flex-col gap-2 text-sm font-medium">Administrative email<Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)}/></label><div className="flex items-center justify-between gap-4 rounded-lg border p-4"><div><p className="font-medium">Course registration</p><p className="text-sm text-muted-foreground">Allow staff to create term registrations.</p></div><Switch checked={db.settings.registrationEnabled} onCheckedChange={(v)=>updateSettings({registrationEnabled:v})}/></div><div className="flex items-center justify-between gap-4 rounded-lg border p-4"><div><p className="font-medium">Critical alerts</p><p className="text-sm text-muted-foreground">Surface high-priority academic warnings.</p></div><Switch checked={db.settings.criticalAlerts} onCheckedChange={(v)=>updateSettings({criticalAlerts:v})}/></div><Button className="self-start" onClick={()=>updateSettings({institutionName:name,contactEmail:email})}><Settings2 data-icon="inline-start"/>Save configuration</Button></CardContent></Card><div className="flex flex-col gap-4"><Card className="shadow-none"><CardHeader><CardTitle>Prototype boundary</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 text-sm text-muted-foreground"><p>This build stores data in your browser and simulates role sessions. It is not a production authentication or compliance boundary.</p><div className="flex items-center gap-2 text-foreground"><ShieldCheck className="size-4"/>RBAC UI policies active</div><div className="flex items-center gap-2 text-foreground"><FileClock className="size-4"/>Audit events enabled</div></CardContent></Card><Card className="border-destructive/40 shadow-none"><CardHeader><CardTitle>Reset workspace</CardTitle><CardDescription>Restore the original fixture dataset.</CardDescription></CardHeader><CardContent><Button variant="destructive" onClick={resetDemoData}><RotateCcw data-icon="inline-start"/>Reset demo data</Button></CardContent></Card></div></div>
}
