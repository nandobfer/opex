import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetRateLimit } from '@/features/auth/server/rate-limit'

import { POST as login } from '@/app/api/auth/login/route'
import { POST as logout } from '@/app/api/auth/logout/route'

const noParams = { params: Promise.resolve({}) }

function loginRequest(origin: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ password: 'senha-secreta' }),
  })
}

function logoutRequest(origin: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/auth/logout`, { method: 'POST', headers })
}

beforeEach(() => {
  process.env.APP_PASSWORD = 'senha-secreta'
  process.env.AUTH_SECRET = 'segredo-de-teste'
  resetRateLimit('local')
})

afterEach(() => {
  delete process.env.APP_PASSWORD
  delete process.env.AUTH_SECRET
})

describe('POST /api/auth/login: cookie de sessão', () => {
  it('acesso HTTP (IP:porta) emite o cookie SEM Secure', async () => {
    const res = await login(loginRequest('http://217.77.3.47:7001'), noParams)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(res.status).toBe(200)
    expect(setCookie).toContain('opex_session=')
    expect(setCookie).not.toMatch(/;\s*Secure/i)
  })

  it('acesso atrás de proxy TLS (x-forwarded-proto) emite o cookie COM Secure', async () => {
    const res = await login(loginRequest('http://opex.nandoburgos.dev', { 'x-forwarded-proto': 'https' }), noParams)
    expect(res.headers.get('set-cookie') ?? '').toMatch(/;\s*Secure/i)
  })

  it('acesso HTTPS direto emite o cookie COM Secure', async () => {
    const res = await login(loginRequest('https://opex.nandoburgos.dev'), noParams)
    expect(res.headers.get('set-cookie') ?? '').toMatch(/;\s*Secure/i)
  })
})

describe('POST /api/auth/logout: limpeza do cookie de sessão', () => {
  it('em HTTP (IP:porta), expira o cookie sem Secure', async () => {
    const res = await logout(logoutRequest('http://217.77.3.47:7001'), noParams)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('opex_session=')
    expect(setCookie).toMatch(/Max-Age=0/i)
    expect(setCookie).not.toMatch(/;\s*Secure/i)
  })

  it('em HTTPS (proxy), expira o cookie com Secure', async () => {
    const res = await logout(logoutRequest('http://opex.nandoburgos.dev', { 'x-forwarded-proto': 'https' }), noParams)
    expect(res.headers.get('set-cookie') ?? '').toMatch(/;\s*Secure/i)
  })
})
