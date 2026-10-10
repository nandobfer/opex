import { describe, expect, it } from 'vitest'
import { isChannelAuthorized, parseChannel } from '@/lib/pusher/channel-auth'
import { appChannel, integrationChannel } from '@/lib/pusher/channel-names'

describe('autorização dos canais privados', () => {
  it('interpreta os nomes de canal', () => {
    expect(parseChannel('private-app')).toEqual({ kind: 'app' })
    expect(parseChannel('private-integration-crons')).toEqual({ kind: 'integration', integrationId: 'crons' })
    expect(parseChannel('private-company-x-all')).toEqual({ kind: 'unknown' })
    expect(parseChannel('public-qualquer')).toEqual({ kind: 'unknown' })
  })

  it('nomes gerados pelos helpers batem com as regras', () => {
    expect(appChannel()).toBe('private-app')
    expect(integrationChannel('pusher')).toBe('private-integration-pusher')
  })

  it('canal do app é autorizado', () => {
    expect(isChannelAuthorized(appChannel())).toBe(true)
  })

  it('canal de integração só para ids do catálogo', () => {
    expect(isChannelAuthorized('private-integration-pusher')).toBe(true)
    expect(isChannelAuthorized('private-integration-internal_api')).toBe(true)
    expect(isChannelAuthorized('private-integration-crons')).toBe(true)
    expect(isChannelAuthorized('private-integration-smtp')).toBe(false)
    expect(isChannelAuthorized('private-integration-go_sipal')).toBe(false)
    expect(isChannelAuthorized('private-integration-archflow')).toBe(false)
    expect(isChannelAuthorized('private-integration-')).toBe(false)
  })

  it('qualquer outro canal é negado', () => {
    expect(isChannelAuthorized('private-user-local')).toBe(false)
    expect(isChannelAuthorized('private-company-abc-all')).toBe(false)
    expect(isChannelAuthorized('presence-app')).toBe(false)
    expect(isChannelAuthorized('')).toBe(false)
  })
})
