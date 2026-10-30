import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ texts: vi.fn<(centralId: string) => Promise<string[]>>(async () => []) }))
vi.mock('@/features/ai/server/agent-memory-service', () => ({ developerMemoryTexts: mocks.texts }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { syncDeveloperMemories, withDeveloperMemories } from '@/features/agentic/server/developer-memories'
import type { OpencodeClient } from '@/lib/ai/opencode-client'

const makeClient = () => {
  const put = vi.fn(async () => undefined)
  const remove = vi.fn(async () => undefined)
  return { put, remove, client: { session: { instructions: { entry: { put, remove } } } } as unknown as OpencodeClient }
}

beforeEach(() => vi.clearAllMocks())

describe('memórias do agente desenvolvedor na sessão (OPE-97)', () => {
  it('grava as memórias da central como instrução durável da sessão', async () => {
    mocks.texts.mockResolvedValueOnce(['Global.', 'Da central.'])
    const { client, put, remove } = makeClient()
    const sync = await syncDeveloperMemories(client, 'ses_1', 'c1')
    expect(mocks.texts).toHaveBeenCalledWith('c1')
    expect(put).toHaveBeenCalledWith({ sessionID: 'ses_1', key: 'opex-developer-memories', value: expect.stringContaining('- Global.\n- Da central.') })
    expect(remove).not.toHaveBeenCalled()
    expect(sync.applied).toBe(true)
    // Aplicada na sessão: o prompt do turno não repete as memórias.
    expect(withDeveloperMemories(sync, 'Implemente.')).toBe('Implemente.')
  })

  it('sem memórias (ex.: a última foi excluída), remove a entrada da sessão', async () => {
    const { client, put, remove } = makeClient()
    const sync = await syncDeveloperMemories(client, 'ses_1', 'c1')
    expect(remove).toHaveBeenCalledWith({ sessionID: 'ses_1', key: 'opex-developer-memories' })
    expect(put).not.toHaveBeenCalled()
    expect(withDeveloperMemories(sync, 'Planeje.')).toBe('Planeje.')
  })

  it('servidor recusa a instrução: as memórias vão à frente do prompt do turno', async () => {
    mocks.texts.mockResolvedValueOnce(['Rode o lint.'])
    const { client, put } = makeClient()
    put.mockRejectedValueOnce(new Error('não suportado'))
    const sync = await syncDeveloperMemories(client, 'ses_1', 'c1')
    expect(sync.applied).toBe(false)
    const text = withDeveloperMemories(sync, 'Implemente.')
    expect(text.startsWith('## Memórias e instruções permanentes')).toBe(true)
    expect(text).toContain('- Rode o lint.')
    expect(text.endsWith('---\nImplemente.')).toBe(true)
  })

  it('falha ao ler as memórias não derruba o turno nem mexe na sessão', async () => {
    mocks.texts.mockRejectedValueOnce(new Error('mongo fora'))
    const { client, put, remove } = makeClient()
    const sync = await syncDeveloperMemories(client, 'ses_1', 'c1')
    expect(sync).toEqual({ applied: true, section: '' })
    expect(put).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})
