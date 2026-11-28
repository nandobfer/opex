import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-190: no histórico do Agente Opex (e da conversa com um rotineiro), os tipos de arquivo lidos como conteúdo
 * vêm do catálogo por modelo no OpenCode Go e no Command Code; nos demais provedores, da tabela do provedor.
 */

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), goInputs: vi.fn(), ccInputs: vi.fn() }))

vi.mock('@/lib/db/models/Opex', () => ({
  OpexMessage: { find: () => ({ sort: () => ({ select: () => ({ lean: async () => [{ role: 'user', modelMessages: JSON.stringify([{ role: 'user', content: 'oi' }]) }] }) }) }) },
}))
vi.mock('@/features/opex-agent/server/files', () => ({ resolveFileMarkers: mocks.resolve }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/ai/opencode-go", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ opencodeGoModelInputs: mocks.goInputs, listOpencodeGoModels: vi.fn() }))()) as Record<string, unknown>) }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/ai/command-code", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ commandCodeModelInputs: mocks.ccInputs, listCommandCodeModels: vi.fn() }))()) as Record<string, unknown>) }))

import { loadSessionHistory } from '@/features/opex-agent/server/turn-history'

const SESSION = '64b7f0c2a1b2c3d4e5f60718'
const acceptedOf = () => mocks.resolve.mock.calls[0]![2] as ReadonlySet<string> | undefined

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockImplementation(async (messages: unknown[]) => messages)
})

describe('loadSessionHistory: tipos de arquivo por modelo', () => {
  it('Command Code: lê os tipos de entrada do modelo no catálogo do Command Code', async () => {
    mocks.ccInputs.mockResolvedValue(['text', 'image', 'application/pdf'])
    await loadSessionHistory(SESSION, '', 'command-code', 'claude-sonnet-5-5', { turnContext: false })
    expect(mocks.ccInputs).toHaveBeenCalledWith('claude-sonnet-5-5', undefined)
    expect(mocks.goInputs).not.toHaveBeenCalled()
    expect(mocks.resolve.mock.calls[0]![1]).toBe('command-code')
    expect([...acceptedOf()!].sort()).toEqual(['image', 'pdf'])
  })

  it('Command Code sem catálogo: só texto (nenhum tipo como conteúdo)', async () => {
    mocks.ccInputs.mockResolvedValue(null)
    await loadSessionHistory(SESSION, '', 'command-code', 'gpt-6-astra', { turnContext: false })
    expect(acceptedOf()!.size).toBe(0)
  })

  it('provedor sem catálogo por modelo (Gemini): usa a tabela do provedor', async () => {
    await loadSessionHistory(SESSION, '', 'gemini', 'gemini-x', { turnContext: false })
    expect(acceptedOf()).toBeUndefined()
    expect(mocks.ccInputs).not.toHaveBeenCalled()
  })
})
