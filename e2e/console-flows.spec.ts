import { test, expect } from './fixtures'

const runId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

test.describe('console smoke flows', () => {
  test('project services → service deployment', async ({ page, project }) => {
    const serviceName = `e2e-service-${runId()}`
    await page.goto('/dashboard')
    await expect(page.getByText('Your projects')).toBeVisible()

    const projectCard = page.locator('h3').filter({ hasText: project.name ?? 'Getting Started' }).first()
    await expect(projectCard).toBeVisible()
    await projectCard.click()
    await expect(page.getByText(project.name ?? 'Getting Started', { exact: true }).first()).toBeVisible()
    await page.getByRole('link', { name: /Services: Choose, deploy/ }).click()
    await expect(page.getByRole('heading', { name: 'Services', exact: true })).toBeVisible()
    await page.screenshot({ path: 'test-results/services-list.png', fullPage: true })

    const newService = page.getByRole('button', { name: 'Layanan baru' })
    if (await newService.count()) await newService.click()
    else await page.getByRole('button', { name: 'Buka katalog' }).click()
    await expect(page.getByRole('heading', { name: 'Pilih layanan', exact: true })).toBeVisible()

    const catalogAction = page.getByRole('button', { name: 'Use advanced template Custom container' })
    await expect(catalogAction).toBeVisible()
    await catalogAction.click()
    await page.getByLabel('Nama layanan').fill(serviceName)

    const requiredInputs = page.locator('input[id^="service-input-"]')
    for (let index = 0; index < await requiredInputs.count(); index += 1) {
      const input = requiredInputs.nth(index)
      if (await input.inputValue() === '') {
        const type = await input.getAttribute('type')
        await input.fill(type === 'number' ? '1' : 'e2e-value')
      }
    }
    const secrets = page.locator('input[id^="service-secret-"]')
    for (let index = 0; index < await secrets.count(); index += 1) {
      const input = secrets.nth(index)
      if (await input.inputValue() === '') await input.fill('secret://e2e/test')
    }
    const storageSizes = page.locator('input[id^="service-storage-"][id$="-size"]')
    for (let index = 0; index < await storageSizes.count(); index += 1) {
      const input = storageSizes.nth(index)
      await input.fill('1')
    }

    await page.getByRole('button', { name: 'Tinjau deployment' }).click()
    await expect(page.getByRole('dialog', { name: 'Tinjau deployment layanan' })).toBeVisible()
    await expect(page.getByText('Checklist deployment')).toBeVisible()
    await page.screenshot({ path: 'test-results/service-deployment-review.png', fullPage: true })

    await page.getByRole('button', { name: 'Buat & deploy' }).click()
    await expect(page).not.toHaveURL(/\/new$/, { timeout: 30_000 })
    await expect(page).toHaveURL(/\/projects\/[^/]+\/services\/[^/]+$/)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: /Something went wrong/ })).not.toBeVisible()
    await expect(page.getByText('Activity & logs', { exact: true })).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: 'test-results/service-deployment-detail.png', fullPage: true })
  })

  test('feature flags create → configuration', async ({ page, project: _project }) => {
    const key = `e2e-${runId()}`
    await page.goto('/cloud/flags')
    await expect(page.getByRole('heading', { name: 'Feature Flags', exact: true })).toBeVisible()
    await page.screenshot({ path: 'test-results/feature-flags-list.png', fullPage: true })

    await page.getByRole('button', { name: 'Buat flag', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Buat feature flag' })).toBeVisible()
    await page.locator('#flag-key').fill(key)
    await page.locator('#flag-name').fill(`E2E ${key}`)
    await page.locator('#flag-description').fill('Created by the Playwright console smoke test')
    await page.locator('#flag-rollout').fill('100')
    await page.locator('#flag-tags').fill('e2e,smoke')
    await page.screenshot({ path: 'test-results/feature-flag-form.png', fullPage: true })
    await page.getByRole('button', { name: 'Buat flag', exact: true }).last().click()

    await expect(page.getByRole('button', { name: `Lihat konfigurasi ${key}` })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: `Lihat konfigurasi ${key}` }).click()
    await expect(page.getByText(key, { exact: true }).last()).toBeVisible()
    await expect(page.getByRole('tablist', { name: 'Detail feature flag' })).toBeVisible()
    await page.screenshot({ path: 'test-results/feature-flag-configuration.png', fullPage: true })
  })
})
