import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `private-integration-{id}` de uma integração dinâmica é resolvido pela central (`getDefinition`, que
 * conhece os provedores customizados gravados em `ai_custom_providers`): o 403 só vem para id inexistente.
 */

const mocks = vi.hoisted(() => ({ getDefinition: vi.fn() }))

vi.mock('@/lib/integrations/runtime', () => ({}))
vi.mock('@nandobfer/integracoes/server', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), getDefinition: mocks.getDefinition }))

import { isChannelAuthorized } from '@/lib/pusher/channel-auth'
import type { SessionPayload } from '@/features/auth/session'

const ADMIN: SessionPayload = { iat: 0, exp: 9_999_999_999, kind: 'admin' }

beforeEach(() => {
  mocks.getDefinition.mockReset()
  mocks.getDefinition.mockImplementation(async (id: string) => (id === 'ai_custom_groq' ? { id } : undefined))
})

describe('canal de integração dinâmica pela central', () => {
  it('autoriza o provedor customizado que existe e recusa o inexistente', async () => {
    expect(await isChannelAuthorized('private-integration-ai_custom_groq', ADMIN)).toBe(true)
    expect(await isChannelAuthorized('private-integration-ai_custom_sumiu', ADMIN)).toBe(false)
    expect(mocks.getDefinition).toHaveBeenCalledWith('ai_custom_groq')
  })

  it('integração fixa do registro não consulta a central', async () => {
    expect(await isChannelAuthorized('private-integration-pusher', ADMIN)).toBe(true)
    expect(mocks.getDefinition).not.toHaveBeenCalled()
  })
})
