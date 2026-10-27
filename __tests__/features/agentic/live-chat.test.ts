import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Chat durante a execução: opção efetiva (padrão global + central), padrões das configurações antigas
 * e a entrega ao turno vivo pelo runner (`delivery: "steer"`). OpenCode sempre falso.
 */

const mocks = vi.hoisted(() => ({ publish: vi.fn() }))
vi.mock('@/features/agentic/server/hub', () => ({ publishWorkbenchEvent: mocks.publish }))

import { isAgentTurnLive, steerAgentTurn } from '@/lib/ai/opencode-run'
import { runAgentTurn } from '@/features/agentic/server/runner'
import { parseCentralConfig, resolveLiveChat } from '@/features/agentic/logic'
import { agenticSettingsSchema, centralConfigSchema, defaultCentralConfig, DEFAULT_AGENTIC_SETTINGS, withDefaultAgents } from '@/features/agentic/schemas'
import type { OpencodeClient } from '@/lib/ai/opencode-client'

beforeEach(() => vi.clearAllMocks())

describe('opção efetiva', () => {
  it('central Ligado/Desligado prevalece; Padrão global segue a configuração geral', () => {
    expect(resolveLiveChat({ liveChat: false }, { liveChat: 'on' })).toBe(true)
    expect(resolveLiveChat({ liveChat: true }, { liveChat: 'off' })).toBe(false)
    expect(resolveLiveChat({ liveChat: true }, { liveChat: 'inherit' })).toBe(true)
    expect(resolveLiveChat({ liveChat: false }, { liveChat: 'inherit' })).toBe(false)
  })

  it('nasce desligada; configurações salvas antes do campo recebem os padrões', () => {
    expect(DEFAULT_AGENTIC_SETTINGS.liveChat).toBe(false)
    const { liveChat: _global, ...legacySettings } = DEFAULT_AGENTIC_SETTINGS
    void _global
    expect(agenticSettingsSchema.parse(withDefaultAgents(legacySettings)).liveChat).toBe(false)

    expect(defaultCentralConfig('/repo').liveChat).toBe('inherit')
    const { liveChat: _central, ...legacyCentral } = defaultCentralConfig('/repo')
    void _central
    expect(parseCentralConfig(legacyCentral).liveChat).toBe('inherit')
    expect(centralConfigSchema.safeParse({ ...defaultCentralConfig('/repo'), liveChat: 'talvez' }).success).toBe(false)
  })
})

type Raw = { type: string; data: Record<string, unknown> }
const ev = (type: string, data: Record<string, unknown> = {}): Raw => ({ type, data: { sessionID: 's1', ...data } })

/** Cliente falso: o turno só termina quando o teste libera (`end()`). */
function liveClient() {
  let release: () => void = () => {}
  const prompted = new Promise<void>((resolve) => (release = resolve))
  let end: () => void = () => {}
  const ended = new Promise<void>((resolve) => (end = resolve))
  const client = {
    session: {
      switchAgent: vi.fn().mockResolvedValue(undefined),
      switchModel: vi.fn().mockResolvedValue(undefined),
      prompt: vi.fn(async (input: { delivery?: string }) => {
        if (!input.delivery) release()
      }),
      interrupt: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
    },
    event: {
      subscribe: (opts: { onActivity?: () => void }) =>
        (async function* () {
          opts.onActivity?.()
          yield { type: 'server.connected', data: {} }
          await prompted
          await ended
          yield ev('session.execution.succeeded')
        })(),
    },
  }
  return { client: client as unknown as OpencodeClient & { session: typeof client.session }, end: () => end() }
}

const request = { workbenchId: 'w-live', sessionId: 's1', stage: 'implementing' as const, title: 'Implementando', agent: { agent: 'build', model: null, variant: null }, text: 'Implemente', timeoutMs: 60_000, signal: new AbortController().signal }

describe('entrega ao turno vivo (steerAgentTurn)', () => {
  it('durante o turno envia com delivery "steer" na mesma sessão; depois que termina, não envia nada', async () => {
    const { client, end } = liveClient()
    const turn = runAgentTurn(client, request)
    await vi.waitFor(() => expect(client.session.prompt).toHaveBeenCalledWith({ sessionID: 's1', text: 'Implemente' }))
    expect(isAgentTurnLive('w-live')).toBe(true)

    expect(await steerAgentTurn('w-live', 'use o componente X')).toBe(true)
    expect(client.session.prompt).toHaveBeenLastCalledWith({ sessionID: 's1', text: 'use o componente X', delivery: 'steer' })

    end()
    expect(await turn).toMatchObject({ outcome: 'succeeded' })
    expect(isAgentTurnLive('w-live')).toBe(false)
    expect(await steerAgentTurn('w-live', 'tarde demais')).toBe(false)
    expect(client.session.prompt).toHaveBeenCalledTimes(2)
  })

  it('id sem turno acompanhado: nada é enviado', async () => {
    expect(await steerAgentTurn('nenhum', 'oi')).toBe(false)
  })
})
