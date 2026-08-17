import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'

const apiBase = process.env.E2E_API_BASE ?? 'http://127.0.0.1:5001'
const username = process.env.E2E_USERNAME
const password = process.env.E2E_PASSWORD

export type E2EProject = { id: string; name?: string; org_id?: string; orgId?: string }

type LoginResponse = {
  access_token?: string
  refresh_token?: string
  token?: string
  user?: unknown
  active_org_id?: string
}

type ProjectsResponse = { projects?: E2EProject[]; data?: E2EProject[] } | E2EProject[]

function requireCredentials() {
  if (!username || !password) {
    throw new Error('Set E2E_USERNAME and E2E_PASSWORD before running Playwright.')
  }
  return { username, password }
}

async function jsonOrText(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return text
  }
}

async function authenticate(request: APIRequestContext) {
  const credentials = requireCredentials()
  const response = await request.post(`${apiBase}/api/auth/login`, { data: credentials })
  if (!response.ok()) {
    throw new Error(`Login failed (${response.status()}): ${await response.text()}`)
  }
  const body = (await jsonOrText(response)) as LoginResponse
  const token = body.access_token ?? body.token
  if (!token) throw new Error('Login response did not contain an access token.')

  const projectsResponse = await request.get(`${apiBase}/api/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!projectsResponse.ok()) {
    throw new Error(`Project discovery failed (${projectsResponse.status()}): ${await projectsResponse.text()}`)
  }
  const projectsBody = (await jsonOrText(projectsResponse)) as ProjectsResponse
  const projects = Array.isArray(projectsBody) ? projectsBody : projectsBody.projects ?? projectsBody.data ?? []
  const project = projects.find((item) => item.id)
  if (!project) throw new Error('No accessible project was returned by GET /api/projects.')

  return { token, refreshToken: body.refresh_token ?? null, user: body.user ?? null, project, activeOrgId: body.active_org_id ?? project.org_id ?? project.orgId ?? null }
}

export const test = base.extend<{ project: E2EProject }>({
  project: async ({ page, request }, use) => {
    const session = await authenticate(request)
    await page.addInitScript((state) => {
      localStorage.setItem('auth_token', state.token)
      if (state.refreshToken) localStorage.setItem('auth_refresh_token', state.refreshToken)
      if (state.user) localStorage.setItem('user_data', JSON.stringify(state.user))
      localStorage.setItem('current_project_id', state.project.id)
      if (state.activeOrgId) localStorage.setItem('active_org_id', state.activeOrgId)
    }, session)
    await use(session.project)
  },
})

export { expect }
