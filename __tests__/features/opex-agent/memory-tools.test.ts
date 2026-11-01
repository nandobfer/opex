import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-104: ferramentas de gestão das memórias pelo Agente Opex (sem rajada por centrais e clientes). */

const mocks = vi.hoisted(() => ({ list: vi.fn<(agent: string, scope?: unknown) => Promise<{ ativa: boolean }[]>>(async () => []) }))
vi.mock('@/features/ai/server/agent-memory-service', () => ({ listAgentMemories: mocks.list, createAgentMemory: vi.fn(), getAgentMemory: vi.fn(), updateAgentMemory: vi.fn(), deleteAgentMemory: vi.fn() }))

import { memoryTools } from '@/features/opex-agent/server/tools/memories'

const C = 'a'.repeat(24)
const run = (input: Record<string, unknown>) => {
  const tool = memoryTools.find((item) => item.name === 'list_agent_memories')!
  return tool.execute(tool.input.parse(input) as never, { sessionId: 's', actorId: 'local' } as never)
}

beforeEach(() => vi.clearAllMocks())

describe('list_agent_memories', () => {
  it('sem agent: só contagens das listas sem escopo, uma chamada por lista, nada das centrais e clientes', async () => {
    mocks.list.mockResolvedValue([{ ativa: true }, { ativa: false }, { ativa: true }])
    const result = (await run({})) as { lists: { agent: string; active: number; inactive: number }[]; scoped: { agent: string; requires: string }[] }
    const called = mocks.list.mock.calls.map((call) => call[0])
    expect(called).not.toContain('developer-central')
    expect(called).not.toContain('opex-client-specific')
    expect(called).toContain('app-global')
    expect(result.lists.find((item) => item.agent === 'opex-global')).toMatchObject({ active: 2, inactive: 1 })
    expect(result.scoped).toEqual(expect.arrayContaining([{ agent: 'developer-central', agentLabel: expect.any(String), requires: 'centralId' }, { agent: 'maddox-client-specific', agentLabel: expect.any(String), requires: 'clientId' }]))
    expect(JSON.stringify(result)).not.toContain('"text"')
  })

  it('lista por central sem centralId é recusada; com ele, lê só aquela central', async () => {
    await expect(run({ agent: 'developer-central' })).rejects.toMatchObject({ code: 'CENTRAL_REQUIRED' })
    await expect(run({ agent: 'opex-client-specific' })).rejects.toMatchObject({ code: 'CLIENT_REQUIRED' })
    await run({ agent: 'developer-central', centralId: C })
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(mocks.list).toHaveBeenCalledWith('developer-central', { centralId: C, clientId: undefined })
  })
})
