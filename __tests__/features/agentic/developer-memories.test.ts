import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-97/OPE-104: memórias do agente desenvolvedor (contexto do Engramind) e o aprendizado autônomo na sessão. */

const mocks = vi.hoisted(() => ({
  context: vi.fn(async (_centralId: string | null) => ({ block: '', source: 'live' as 'live' | 'cache' | 'none', cachedAt: null as string | null, counts: { full: 0, titles: 0, overflow: 0 }, reason: null })),
  selfEnabled: vi.fn(async () => false),
  ensureMcp: vi.fn(async () => ({ ok: true, error: null as string | null, skipped: [] as string[] })),
  mentorLearns: vi.fn<(centralId: string) => Promise<boolean>>(async () => false),
}))
vi.mock('@/features/adversarial-agent/server/mentor/hooks', () => ({ mentorLearnsOnDone: mocks.mentorLearns }))
vi.mock('@/features/ai/server/agent-memory-context', () => ({ developerMemoryContext: mocks.context }))
vi.mock('@/features/ai/server/self-memory/settings', () => ({ selfMemoryEnabled: mocks.selfEnabled }))
vi.mock('@/features/ai/server/self-memory/mcp', () => ({ ensureAgentMemoryMcp: mocks.ensureMcp }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { registerDeveloperMemoryMcpAt, syncDeveloperMemories, withDeveloperMemories } from '@/features/agentic/server/developer-memories'
import type { OpencodeClient } from '@/lib/ai/opencode-client'

const makeClient = () => {
  const put = vi.fn(async () => undefined)
  const remove = vi.fn(async () => undefined)
  return { put, remove, client: { session: { instructions: { entry: { put, remove } } } } as unknown as OpencodeClient }
}
const live = (block: string) => ({ block, source: 'live' as const, cachedAt: null, counts: { full: 1, titles: 0, overflow: 0 }, reason: null })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.selfEnabled.mockResolvedValue(false)
  mocks.ensureMcp.mockResolvedValue({ ok: true, error: null, skipped: [] })
  mocks.mentorLearns.mockResolvedValue(false)
})

describe('memórias do agente desenvolvedor na sessão (OPE-97)', () => {
  it('grava o contexto do Engramind (globais e da central) como instrução durável da sessão', async () => {
    mocks.context.mockResolvedValueOnce(live('- Global.\n- Da central.'))
    const { client, put, remove } = makeClient()
    const sync = await syncDeveloperMemories(client, 'ses_1', 'c1')
    expect(mocks.context).toHaveBeenCalledWith('c1', { focus: undefined })
    expect(put).toHaveBeenCalledWith({ sessionID: 'ses_1', key: 'opex-developer-memories', value: expect.stringContaining('- Global.\n- Da central.') })
    expect(remove).not.toHaveBeenCalled()
    expect(sync.applied).toBe(true)
    expect(withDeveloperMemories(sync, 'Implemente.')).toBe('Implemente.')
  })

  it('sem memórias nem aprendizado autônomo, remove a entrada da sessão', async () => {
    const { client, put, remove } = makeClient()
    const sync = await syncDeveloperMemories(client, 'ses_1', 'c1')
    expect(remove).toHaveBeenCalledWith({ sessionID: 'ses_1', key: 'opex-developer-memories' })
    expect(put).not.toHaveBeenCalled()
    expect(withDeveloperMemories(sync, 'Planeje.')).toBe('Planeje.')
  })

  it('servidor recusa a instrução: as memórias vão à frente do prompt do turno', async () => {
    mocks.context.mockResolvedValueOnce(live('- Rode o lint.'))
    const { client, put } = makeClient()
    put.mockRejectedValueOnce(new Error('não suportado'))
    const sync = await syncDeveloperMemories(client, 'ses_1', 'c1')
    expect(sync.applied).toBe(false)
    const text = withDeveloperMemories(sync, 'Implemente.')
    expect(text.startsWith('## Memórias e instruções permanentes')).toBe(true)
    expect(text).toContain('- Rode o lint.')
    expect(text.endsWith('---\nImplemente.')).toBe(true)
  })

  it('Engramind fora do ar: usa o cache e avisa na mesa', async () => {
    mocks.context.mockResolvedValueOnce({ block: '- Do cache.', source: 'cache', cachedAt: '2026-10-30T12:00:00.000Z', counts: { full: 1, titles: 0, overflow: 0 }, reason: 'fora' })
    const notify = vi.fn()
    const { client, put } = makeClient()
    await syncDeveloperMemories(client, 'ses_1', 'c1', { notify })
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ value: expect.stringContaining('- Do cache.') }))
    expect(notify).toHaveBeenCalledWith('warn', expect.stringContaining('Memórias carregadas do cache de'))
  })

  it('aprendizado autônomo ligado: registra o MCP de memórias nos diretórios da sessão e instrui o agente', async () => {
    mocks.selfEnabled.mockResolvedValue(true)
    const { client, put } = makeClient()
    await syncDeveloperMemories(client, 'ses_1', 'c1', { directories: ['/repo/wt'] })
    expect(mocks.ensureMcp).toHaveBeenCalledWith(client, ['/repo/wt'])
    const value = (put.mock.calls[0] as unknown as [{ value: string }])[0].value
    expect(value).toContain('## Memória própria (aprendizado autônomo)')
    expect(value).toContain('opex_memorias_remember')
    expect(value).toContain('`developer-central`')
  })

  it('OPE-165: com o Agente Mentor aprendendo na central, o desenvolvedor fica somente leitura (sem checklist de gravação)', async () => {
    mocks.selfEnabled.mockResolvedValue(true)
    mocks.mentorLearns.mockResolvedValue(true)
    mocks.context.mockResolvedValueOnce({ block: '- Global.', source: 'live', cachedAt: null, counts: { full: 1, titles: 2, overflow: 3 }, reason: null })
    const { client, put } = makeClient()
    await syncDeveloperMemories(client, 'ses_1', 'c1', { directories: ['/repo/wt'] })
    expect(mocks.mentorLearns).toHaveBeenCalledWith('c1')
    expect(mocks.ensureMcp).toHaveBeenCalled()
    const value = (put.mock.calls[0] as unknown as [{ value: string }])[0].value
    expect(value).toContain('- Global.')
    expect(value).toContain('get_hints')
    expect(value).toContain('quem grava as memórias é o Agente Mentor')
    expect(value).not.toContain('Checklist de fim de turno')
    expect(value).not.toContain('Você aprende sozinho')
  })

  it('MCP indisponível: o turno segue sem a instrução de memória própria e avisa', async () => {
    mocks.selfEnabled.mockResolvedValue(true)
    mocks.ensureMcp.mockResolvedValue({ ok: false, error: 'sem URL', skipped: [] })
    mocks.context.mockResolvedValueOnce(live('- Regra.'))
    const notify = vi.fn()
    const { client, put } = makeClient()
    await syncDeveloperMemories(client, 'ses_1', 'c1', { directories: ['/repo/wt'], notify })
    expect((put.mock.calls[0] as unknown as [{ value: string }])[0].value).not.toContain('Memória própria')
    expect(notify).toHaveBeenCalledWith('warn', expect.stringContaining('Aprendizado autônomo indisponível'))
  })

  it('OPE-115: worktree ainda inexistente (ao clicar em Implementar) não vira aviso e o aprendizado segue', async () => {
    mocks.selfEnabled.mockResolvedValue(true)
    mocks.ensureMcp.mockResolvedValue({ ok: true, error: null, skipped: ['/repo/worktrees/ope-113'] })
    const notify = vi.fn()
    const { client, put } = makeClient()
    await syncDeveloperMemories(client, 'ses_1', 'c1', { directories: ['/repo', '/repo/worktrees/ope-113'], notify })
    expect(notify).not.toHaveBeenCalledWith('warn', expect.stringContaining('Aprendizado autônomo indisponível'))
    expect((put.mock.calls[0] as unknown as [{ value: string }])[0].value).toContain('## Memória própria (aprendizado autônomo)')
  })

  it('OPE-115/OPE-117: sessão movida para o worktree registra o MCP no novo diretório (leitura vale com o aprendizado desligado, sem lançar)', async () => {
    const { client } = makeClient()
    await registerDeveloperMemoryMcpAt(client, '/repo/worktrees/ope-115')
    expect(mocks.ensureMcp).toHaveBeenCalledWith(client, ['/repo/worktrees/ope-115'])
    mocks.ensureMcp.mockRejectedValueOnce(new Error('OpenCode fora'))
    await expect(registerDeveloperMemoryMcpAt(client, '/repo/worktrees/ope-115')).resolves.toBeUndefined()
  })

  it('falha ao ler as memórias não derruba o turno nem mexe na sessão', async () => {
    mocks.context.mockRejectedValueOnce(new Error('mongo fora'))
    const { client, put, remove } = makeClient()
    const sync = await syncDeveloperMemories(client, 'ses_1', 'c1')
    expect(sync).toEqual({ applied: true, section: '' })
    expect(put).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})
