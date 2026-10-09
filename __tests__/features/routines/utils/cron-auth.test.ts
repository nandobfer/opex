import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifyCronToken } from '@/features/routines/utils/cron-auth'

function makeRequest(authHeader?: string): Parameters<typeof verifyCronToken>[0] {
  const headers = new Headers()
  if (authHeader !== undefined) {
    headers.set('authorization', authHeader)
  }
  return { headers } as never
}

describe('verifyCronToken', () => {
  const originalEnv = process.env.CRON_SECRET

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = originalEnv
    }
  })

  it('retorna false quando CRON_SECRET não está definido', async () => {
    delete process.env.CRON_SECRET
    expect(await verifyCronToken(makeRequest('Bearer some-token'))).toBe(false)
  })

  it('retorna false quando o header Authorization está ausente', async () => {
    process.env.CRON_SECRET = 'my-secret'
    expect(await verifyCronToken(makeRequest())).toBe(false)
  })

  it('retorna false quando o header não começa com "Bearer "', async () => {
    process.env.CRON_SECRET = 'my-secret'
    expect(await verifyCronToken(makeRequest('my-secret'))).toBe(false)
    expect(await verifyCronToken(makeRequest('Token my-secret'))).toBe(false)
    expect(await verifyCronToken(makeRequest('Basic my-secret'))).toBe(false)
  })

  it('retorna false quando o token não corresponde ao segredo', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    expect(await verifyCronToken(makeRequest('Bearer wrong-token'))).toBe(false)
  })

  it('retorna true quando o token Bearer corresponde exatamente ao segredo', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    expect(await verifyCronToken(makeRequest('Bearer correct-secret'))).toBe(true)
  })

  it('é sensível a maiúsculas e minúsculas', async () => {
    process.env.CRON_SECRET = 'MySecret'
    expect(await verifyCronToken(makeRequest('Bearer mysecret'))).toBe(false)
    expect(await verifyCronToken(makeRequest('Bearer MYSECRET'))).toBe(false)
    expect(await verifyCronToken(makeRequest('Bearer MySecret'))).toBe(true)
  })

  it('retorna false para token vazio', async () => {
    process.env.CRON_SECRET = 'my-secret'
    expect(await verifyCronToken(makeRequest('Bearer '))).toBe(false)
  })
})
