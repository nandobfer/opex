import { describe, expect, it } from 'vitest'
import { isChannelAuthorized, parseChannel } from '@/lib/pusher/channel-auth'
import { appChannel, clientChannel, integrationChannel, opexChannel, repoRecentsChannel } from '@/lib/pusher/channel-names'
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
    expect(isChannelAuthorized('private-integration-smtp', ADMIN)).toBe(true)
    expect(isChannelAuthorized('private-integration-storage_s3', ADMIN)).toBe(true)
    expect(isChannelAuthorized('private-integration-inexistente', ADMIN)).toBe(false)
    expect(isChannelAuthorized('private-integration-pusher', CLIENT('c1'))).toBe(false)
  })

  it('o canal do cliente é do próprio cliente (ou do dono em pré-visualização)', () => {
    expect(isChannelAuthorized(clientChannel('c1'), CLIENT('c1'))).toBe(true)
    expect(isChannelAuthorized(clientChannel('c2'), CLIENT('c1'))).toBe(false)
    expect(isChannelAuthorized(clientChannel('c1'), CLIENT())).toBe(false)
    expect(isChannelAuthorized(clientChannel('c1'), ADMIN)).toBe(true)
    expect(isChannelAuthorized(clientChannel('c1'), null)).toBe(false)
  })

  it('o canal do histórico de repositórios é do próprio ator', () => {
    expect(parseChannel('private-repo-recents-local')).toEqual({ kind: 'repoRecents', actorId: 'local' })
    expect(repoRecentsChannel('u1')).toBe('private-repo-recents-u1')

    expect(isChannelAuthorized(repoRecentsChannel('local'), ADMIN)).toBe(true)
    expect(isChannelAuthorized(repoRecentsChannel('u1'), ADMIN)).toBe(false)

    expect(isChannelAuthorized(repoRecentsChannel('u1'), CLIENT())).toBe(true)
    expect(isChannelAuthorized(repoRecentsChannel('u2'), CLIENT())).toBe(false)
    expect(isChannelAuthorized(repoRecentsChannel('local'), CLIENT())).toBe(false)

    expect(isChannelAuthorized(repoRecentsChannel('local'), null)).toBe(false)
    expect(isChannelAuthorized('private-repo-recents-', ADMIN)).toBe(false)
  })

  it('o canal do Agente Opex é do próprio usuário no cliente (e do dono local)', () => {
    expect(parseChannel(opexChannel('c1', 'u1'))).toEqual({ kind: 'opex', clientId: 'c1', userId: 'u1' })
    expect(isChannelAuthorized(opexChannel('c1', 'u1'), CLIENT('c1'))).toBe(true)
    expect(isChannelAuthorized(opexChannel('c2', 'u1'), CLIENT('c1'))).toBe(false)
    expect(isChannelAuthorized(opexChannel('c1', 'u2'), CLIENT('c1'))).toBe(false)
    expect(isChannelAuthorized(opexChannel('c1', 'local'), ADMIN)).toBe(true)
    expect(isChannelAuthorized(opexChannel('c1', 'u1'), ADMIN)).toBe(false)
    expect(isChannelAuthorized(opexChannel('c1', 'u1'), null)).toBe(false)
  })

  it('qualquer outro canal é negado', () => {
    expect(isChannelAuthorized('private-company-abc-all', ADMIN)).toBe(false)
    expect(isChannelAuthorized('presence-app', ADMIN)).toBe(false)
    expect(isChannelAuthorized('', ADMIN)).toBe(false)
  })
})
