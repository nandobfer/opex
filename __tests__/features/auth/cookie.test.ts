import { describe, expect, it } from 'vitest'
import { isHttpsRequest, sessionCookieOptions } from '@/features/auth/server/cookie'

describe('cookie de sessão: detecção de HTTPS', () => {
  it('sem header de proxy, usa o protocolo da URL', () => {
    expect(isHttpsRequest(null, 'http:')).toBe(false)
    expect(isHttpsRequest(undefined, 'http:')).toBe(false)
    expect(isHttpsRequest(null, 'https:')).toBe(true)
  })

  it('com x-forwarded-proto, o header decide (proxy que termina TLS)', () => {
    expect(isHttpsRequest('https', 'http:')).toBe(true)
    expect(isHttpsRequest('http', 'https:')).toBe(false)
    expect(isHttpsRequest('https, http', 'http:')).toBe(true)
    expect(isHttpsRequest(' HTTPS ', 'http:')).toBe(true)
  })

  it('sessionCookieOptions reflete o Secure e mantém httpOnly/lax/path', () => {
    expect(sessionCookieOptions(true)).toEqual({ httpOnly: true, sameSite: 'lax', path: '/', secure: true })
    expect(sessionCookieOptions(false)).toEqual({ httpOnly: true, sameSite: 'lax', path: '/', secure: false })
  })
})
