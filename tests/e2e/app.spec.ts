import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const postgresMode = process.env.DATA_MODE === 'postgres'
const passwordFor = (role: 'admin' | 'staff' | 'viewer') =>
  postgresMode
    ? (process.env[`SEED_${role.toUpperCase()}_PASSWORD`] ?? 'NorthstarDemo!2026')
    : (process.env.DEMO_PASSWORD ?? 'DemoOnly!2026')
const emailFor = (role: 'admin' | 'staff' | 'viewer') =>
  postgresMode ? `${role}@northstar-demo.invalid` : `${role}@northstar.demo`

async function signIn(page: Page, role: 'admin' | 'staff' | 'viewer') {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(emailFor(role))
  await page.getByLabel('Password').fill(passwordFor(role))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Academic operations dashboard',
  )
  await expect(page).toHaveTitle('Dashboard | Northstar UMS')
}

function registrationRow(page: Page, studentName: string, courseCode: string) {
  return page.getByRole('row').filter({ hasText: studentName }).filter({ hasText: courseCode })
}

test('unauthenticated users are redirected to an accessible sign-in page', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page).toHaveTitle(/Sign in/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Clear records')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('invalid credentials produce a visible authentication error', async ({ page }, testInfo) => {
  await page.goto('/login')
  await page
    .getByLabel('Email address')
    .fill(`missing-${testInfo.project.name.replaceAll(/[^a-z0-9]/gi, '-')}@example.invalid`)
  await page.getByLabel('Password').fill('Definitely-not-the-demo-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('.flash[role="alert"]')).toHaveText('Email or password is incorrect.')
})

test('administrator can reach every protected workspace route', async ({ page }) => {
  await signIn(page, 'admin')
  const dashboardA11y = await new AxeBuilder({ page }).analyze()
  expect(dashboardA11y.violations).toEqual([])
  const routes = [
    ['/students', 'Students'],
    ['/faculty', 'Faculty'],
    ['/departments', 'Departments'],
    ['/courses', 'Course offerings'],
    ['/registrations', 'Course registrations'],
    ['/semesters', 'Semesters'],
    ['/reports', 'Academic reports'],
    ['/notifications', 'Notifications'],
    ['/audit', 'Audit events'],
    ['/settings', 'Institution settings'],
  ] as const
  for (const [route, heading] of routes) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
  }
  await page.getByRole('button', { name: 'Toggle color theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('staff cannot open administrator audit records', async ({ page }) => {
  await signIn(page, 'staff')
  await expect(page.getByText('seed', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Loaded deterministic synthetic demonstration records.')).toHaveCount(
    0,
  )
  await expect(page.getByText('No visible audit events')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Audit' })).toHaveCount(0)
  await page.goto('/audit')
  await expect(page).toHaveURL(/\/forbidden$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This area is restricted')
})

test('viewer receives read-only controls', async ({ page }) => {
  await signIn(page, 'viewer')
  await page.goto('/registrations')
  await expect(page.getByText(/can review registration records/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Evaluate and register' })).toHaveCount(0)
  await page.goto('/students')
  await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0)
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Save settings' })).toHaveCount(0)
})

test('student search returns a filtered result and an explicit empty state', async ({ page }) => {
  await signIn(page, 'viewer')
  await page.goto('/students')
  await page.getByLabel('Filter by academic program').fill('BSc Software Engineering')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(/\/students\?search=BSc(?:\+|%20)Software(?:\+|%20)Engineering$/)
  await expect(page.getByText('1 student records match the current filter.')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Synthetic Student 003' })).toBeVisible()
  await expect(page.getByText('Synthetic Student 007')).toHaveCount(0)

  await page.getByLabel('Filter by academic program').fill('program-that-does-not-exist')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(/\/students\?search=program-that-does-not-exist$/)
  await expect(page.getByText('No students found')).toBeVisible()
  await expect(page.getByText('Clear or change the search filter.')).toBeVisible()
})

test('staff can download a filtered student CSV export', async ({ page }) => {
  await signIn(page, 'staff')
  await page.goto('/students?search=BSc%20Software%20Engineering')
  const exportLink = page.getByRole('link', { name: 'Export filtered CSV' })
  await expect(exportLink).toHaveAttribute(
    'href',
    '/api/exports/students?search=BSc%20Software%20Engineering',
  )

  const exportResult = await page.evaluate(
    async (href) => {
      const response = await fetch(href)
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentDisposition: response.headers.get('content-disposition'),
        body: await response.text(),
      }
    },
    (await exportLink.getAttribute('href')) ?? '/api/exports/students',
  )
  expect(exportResult.status).toBe(200)
  expect(exportResult.contentType).toContain('text/csv')
  expect(exportResult.contentDisposition).toBe('attachment; filename="northstar-students.csv"')
  expect(exportResult.body).toContain('University ID,Student name,Program,Department')
  expect(exportResult.body).toContain('NDU-2025-0003,Synthetic Student 003')
  expect(exportResult.body).not.toContain('NDU-2025-0007,Synthetic Student 007')
})

test('viewer is denied CSV export even when calling the endpoint directly', async ({ page }) => {
  await signIn(page, 'viewer')
  await page.goto('/students')
  await expect(page.getByRole('link', { name: 'Export filtered CSV' })).toHaveCount(0)

  const exportResult = await page.evaluate(async () => {
    const response = await fetch('/api/exports/students')
    return {
      status: response.status,
      cacheControl: response.headers.get('cache-control'),
      body: await response.json(),
    }
  })
  expect(exportResult.status).toBe(403)
  expect(exportResult.cacheControl).toBe('no-store')
  expect(exportResult.body).toEqual({
    error: 'You do not have permission to export records.',
  })
})

test('administrator can update institution settings and restore the original value', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Global demo settings are mutated once only.')
  await signIn(page, 'admin')
  await page.goto('/settings')
  const institutionName = page.getByLabel('Institution name')
  const originalName = await institutionName.inputValue()
  const temporaryName = `${originalName} E2E`

  try {
    await institutionName.fill(temporaryName)
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByRole('status')).toHaveText('Settings updated.')
    await expect(institutionName).toHaveValue(temporaryName)
  } finally {
    if (page.url().includes('/settings')) {
      await institutionName.fill(originalName)
      await page.getByRole('button', { name: 'Save settings' }).click()
      await expect(page.getByRole('status')).toHaveText('Settings updated.')
      await expect(institutionName).toHaveValue(originalName)
    }
  }
})

test('authorized registration and drop workflow persists through the server adapter', async ({
  page,
}, testInfo) => {
  await signIn(page, 'staff')
  await page.goto('/registrations')
  const mobileProject = testInfo.project.name === 'mobile-chromium'
  const studentId = mobileProject ? 'stu-006' : 'stu-007'
  const studentName = mobileProject ? 'Synthetic Student 006' : 'Synthetic Student 007'
  const offeringId = mobileProject ? 'off-bi101' : 'off-cs205'
  const courseCode = mobileProject ? 'BIO-101' : 'CS-205'
  await page.getByLabel('Student').selectOption(studentId)
  await page.getByLabel('Open offering').selectOption(offeringId)
  await page.getByRole('button', { name: 'Evaluate and register' }).click()
  await expect(page.getByRole('status')).toContainText('registered successfully')
  const row = page.getByRole('row').filter({ hasText: studentName }).filter({ hasText: courseCode })
  await expect(row).toContainText('registered')
  await row.getByRole('button', { name: 'Drop' }).click()
  await expect(page.getByRole('status')).toContainText('Registration dropped')
  await expect(
    page.getByRole('row').filter({ hasText: studentName }).filter({ hasText: courseCode }),
  ).toContainText('dropped')
})

test('an eligible student joins a full offering waitlist and can be removed cleanly', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The shared demo queue is mutated once only.')
  await signIn(page, 'staff')
  await page.goto('/registrations')
  const row = registrationRow(page, 'Synthetic Student 007', 'CS-201')

  // Recover cleanly if a prior interrupted local run left this synthetic record active.
  if ((await row.getByRole('button', { name: 'Drop' }).count()) > 0) {
    await row.getByRole('button', { name: 'Drop' }).click()
    await expect(page.getByRole('status')).toContainText('Registration dropped')
  }

  try {
    await page.getByLabel('Student').selectOption('stu-007')
    await page.getByLabel('Open offering').selectOption('off-cs201')
    await page.getByRole('button', { name: 'Evaluate and register' }).click()
    await expect(page.getByRole('status')).toHaveText('Student added to waitlist at position 2.')
    await expect(row).toContainText('waitlisted')
    await expect(row).toContainText('#2')
  } finally {
    if ((await row.getByRole('button', { name: 'Drop' }).count()) > 0) {
      await row.getByRole('button', { name: 'Drop' }).click()
      await expect(page.getByRole('status')).toContainText('Registration dropped')
      await expect(row).toContainText('dropped')
    }
  }
})

test('keyboard-only users can sign in, use the skip link, and open mobile navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')

  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Email address')).toBeFocused()
  await page.keyboard.type(emailFor('viewer'))
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Password')).toBeFocused()
  await page.keyboard.type(passwordFor('viewer'))
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()

  const menuButton = page.locator('summary[aria-label="Open navigation menu"]')
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const focused = await menuButton.evaluate((element) => element === document.activeElement)
    if (focused) break
    await page.keyboard.press('Shift+Tab')
  }
  await expect(menuButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('details.mobile-nav')).toHaveAttribute('open', '')
  await page.keyboard.press('Tab')
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' })
  await expect(mobileNavigation.getByRole('link', { name: 'Dashboard' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(mobileNavigation.getByRole('link', { name: 'Students' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/students$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Students')
})

test('the shell remains usable at 320 CSS pixels and logout revokes access', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await signIn(page, 'admin')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
})
