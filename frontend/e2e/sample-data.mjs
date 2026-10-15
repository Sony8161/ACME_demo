// End-to-end test of loading the sample company into an EMPTY database, and of the Download CSV button.
//
//   ./bin/demo-local.sh reset                  # empties the database: first admin only (admin1 / ChangeMe123!)
//   cd frontend && BASE_URL=http://localhost:3010 node e2e/sample-data.mjs
//   ./bin/demo-local.sh ready                  # put the sample company and the logins back afterwards
//
// It changes the admin password once (to NEW_PASSWORD below), loads the sample data from the empty dashboard, saves the logins
// as a CSV and reads it, checks the dashboard now shows twelve projects, then asks for the sample data again from the admin's
// More menu and expects to be told it is already loaded. axe-core scans each new dialog; serious or critical problems fail.
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const URL = process.env.BASE_URL ?? 'http://localhost:3000'
const NEW_PASSWORD = 'Demo1234!'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })).newPage()
const log = []
const ok = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!cond) process.exitCode = 1 }

const AXE = require.resolve('axe-core/axe.min.js')
async function scan(name) {
  await page.addScriptTag({ path: AXE })
  const result = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }))
  const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  ok(`accessibility (axe): ${name}`, bad.length === 0, bad.map((v) => `${v.id} x${v.nodes.length}: ${v.nodes[0].html.slice(0, 90)}`).join('; '))
}

try {
  await page.goto(URL + '/login')
  await page.getByLabel('Username').fill('admin1')
  await page.getByLabel(/^Password/).fill('ChangeMe123!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByLabel(/^Current password/).fill('ChangeMe123!')
  await page.getByLabel(/^New password/).fill(NEW_PASSWORD)
  await page.getByLabel(/^Repeat new password/).fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Save new password' }).click()

  await page.getByRole('button', { name: 'Load sample data' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sample accounts created' })
  await dialog.waitFor({ timeout: 60_000 })
  const shown = await dialog.locator('p', { hasText: /^username / }).count()
  ok('sample data: the dialog lists 30 logins', shown === 30, `(${shown})`)
  await scan('sample accounts dialog')

  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download CSV' }).click()])
  ok('csv: saved as acme-logins.csv', download.suggestedFilename() === 'acme-logins.csv', download.suggestedFilename())
  const text = (await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'))
  const lines = text.replace(/^﻿/, '').split('\r\n')
  ok('csv: a header and 30 rows', lines.length === 31 && lines[0] === 'Name,Role,Username,Password', `(${lines.length} lines)`)
  ok('csv: Hannah Weiss is a manager with a username and password', lines.some((l) => /^Hannah Weiss,manager,[a-z0-9]{6},\S{8,}$/.test(l)))
  ok('csv: usernames are unique', new Set(lines.slice(1).map((l) => l.split(',')[2])).size === 30)

  await dialog.getByRole('button', { name: 'I have saved them' }).click()
  await page.getByRole('heading', { name: /4 of 12 projects need attention/ }).waitFor()
  ok('dashboard: 4 of 12 projects need attention', true)
  const rows = await page.locator('main a[href^="/projects/"]').count()
  ok('dashboard: twelve project rows', rows === 12, `(${rows})`)

  await page.getByRole('button', { name: 'More' }).click()
  await scan('More menu with Sample data')
  await page.getByRole('menuitem', { name: 'Sample data' }).click()
  await page.getByRole('menuitem', { name: 'Sample data' }).waitFor({ state: 'detached' }) // the menu has finished fading out
  const ask = page.getByRole('dialog', { name: 'Add sample people and projects?' })
  await ask.waitFor()
  await scan('add sample data question')
  await ask.getByRole('button', { name: 'Add sample data' }).click()
  await page.getByText('Sample data is already loaded').waitFor()
  ok('More > Sample data: told it is already loaded, nothing created', true)
  const after = await page.locator('main a[href^="/projects/"]').count()
  ok('dashboard: still twelve projects', after === 12, `(${after})`)
} catch (err) {
  ok('script finished', false, String(err).split('\n')[0])
} finally {
  console.log(log.join('\n'))
  await browser.close()
}
