/** Completed-Turn notification preferences persist on the Loopback Host and render in General Settings. */
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold } from './scaffold.ts'
import { newEnglishPage, openSettings } from './support.ts'

it('renders both completed-Turn notification rows and round-trips their Host preferences', async () => {
  const scaffold = await launchWebScaffold({})
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  await page.goto(scaffold.authenticatedUrl)
  await openSettings(page, 'en')

  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  const mode = settings.getByRole('button', { name: 'Turn completion notifications', exact: true })
  expect(await mode.textContent()).toContain('Only when unfocused')
  const sound = settings.getByRole('switch', { name: 'Notification sound', exact: true })
  expect(await sound.getAttribute('aria-checked')).toBe('true')

  // A choice writes the profile's user layer, so a reload reads the same state.
  await sound.click()
  await expect.poll(() => sound.getAttribute('aria-checked')).toBe('false')
  await mode.click()
  await settings.getByRole('menuitem', { name: 'Never', exact: true }).click()
  await expect.poll(async () => await mode.textContent()).toContain('Never')
  await expect.poll(() => scaffold.ctx.settings.describe().find(row => row.ns === 'ui-settings-general')?.value)
    .toMatchObject({ turnMode: 'never', sound: false })

  await page.reload()
  await openSettings(page, 'en')
  await expect.poll(async () => await settings.getByRole('button', { name: 'Turn completion notifications', exact: true }).textContent())
    .toContain('Never')
  expect(await settings.getByRole('switch', { name: 'Notification sound', exact: true }).getAttribute('aria-checked')).toBe('false')
})
