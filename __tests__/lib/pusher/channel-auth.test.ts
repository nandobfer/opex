import { describe, expect, it } from 'vitest'
import { isChannelAuthorized, parseChannel } from '@/lib/pusher/channel-auth'
import { appChannel, clientChannel, integrationChannel } from '@/lib/pusher/channel-names'
import type { SessionPayload } from '@/features/auth/session'

const ADMIN: SessionPayload = { iat: 0, exp: 9_999_999_999, kind: 'admin' }
const CLIENT = (clientId?: string): SessionPayload => ({ iat: 0, exp: 9_999_999_999, kind: 'client', userId: 'u1', clientId })

describe('autorização dos canais privados', () => {
  it('interpreta os nomes de canal', () => {
    expect(parseChannel('private-app')).toEqual({ kind: 'app' })
    expect(parseChannel('private-integration-crons')).toEqual({ kind: 'integration', integrationId: 'crons' })
    expect(parseChannel('private-client-abc')).toEqual({ kind: 'client', clientId: 'abc' })
    expect(parseChannel('public-qualquer')).toEqual({ kind: 'unknown' })
  })

  it('nomes gerados pelos helpers batem com as regras', () => {
    expect(appChannel()).toBe('private-app')
    expect(integrationChannel('pusher')).toBe('private-integration-pusher')
    expect(clientChannel('abc')).toBe('private-client-abc')
  })

  it('o canal do app e os de integração são só do dono', () => {
    expect(isChannelAuthorized(appChannel(), ADMIN)).toBe(true)
    expect(isChannelAuthorized(appChannel(), CLIENT('c1'))).toBe(false)
    expect(isChannelAuthorized(appChannel(), null)).toBe(false)

    expect(isChannelAuthorized('private-integration-pusher', ADMIN)).toBe(true)
    expect(isChannelAuthorized('private-integration-crons', ADMIN)).toBe(true)
    expect(isChannelAuthorized('private-integration-smtp', ADMIN)).toBe(false)
    expect(isChannelAuthorized('private-integration-pusher', CLIENT('c1'))).toBe(false)
  })

  it('o canal do cliente é do próprio cliente (ou do dono em pré-visualização)', () => {
    expect(isChannelAuthorized(clientChannel('c1'), CLIENT('c1'))).toBe(true)
    expect(isChannelAuthorized(clientChannel('c2'), CLIENT('c1'))).toBe(false)
    expect(isChannelAuthorized(clientChannel('c1'), CLIENT())).toBe(false)
    expect(isChannelAuthorized(clientChannel('c1'), ADMIN)).toBe(true)
    expect(isChannelAuthorized(clientChannel('c1'), null)).toBe(false)
  })

  it('qualquer outro canal é negado', () => {
    expect(isChannelAuthorized('private-company-abc-all', ADMIN)).toBe(false)
    expect(isChannelAuthorized('presence-app', ADMIN)).toBe(false)
    expect(isChannelAuthorized('', ADMIN)).toBe(false)
  })
})
