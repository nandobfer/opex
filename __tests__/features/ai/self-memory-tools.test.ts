import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-104: ferramentas "Memória própria" (aprendizado autônomo): listas por turno, escopo forçado, limite e avisos. */

const mocks = vi.hoisted(() => ({
  create: vi.fn(async (_agent: string, texto: string, _actor: string, options: Record<string, unknown>) => ({ memoria: { id: 'm_1', texto, resumo: texto, categoria: 'PROJECT_RULES', fixada: false, ativa: true, doDono: false, autor: 'Agente', versao: 1, ...(options.clientId ? { clientId: options.clientId } : {}) }, similares: [] as unknown[] })),
  update: vi.fn(async () => ({ memoria: { id: 'm_1', texto: 'x', resumo: 'x', categoria: 'PROJECT_RULES', fixada: false, ativa: false, doDono: false, autor: null, versao: 2 } })),
  remove: vi.fn(async () => ({ id: 'm_1', texto: 'Superada', resumo: 'Superada', categoria: 'PROJECT_RULES', fixada: false, ativa: true, doDono: false, autor: null, versao: 1 })),
  list: vi.fn(async () => [] as unknown[]),
}))
vi.mock('@/features/ai/server/agent-memory-service', () => ({ createAgentMemory: mocks.create, updateAgentMemory: mocks.update, deleteAgentMemory: mocks.remove, listAgentMemories: mocks.list }))
// O registro completo do Agente Opex é pesado: a regra de confirmação é a mesma do tool-tree.
vi.mock('@/features/opex-agent/server/tools/registry', async () => {
  const { toolConfirms } = await import('@/features/opex-agent/tool-tree')
  return { needsConfirmation: (tool: Parameters<typeof toolConfirms>[0], overrides?: Record<string, boolean>) => toolConfirms(tool, overrides) }
})
vi.mock('@/features/engramind/server/memory-context', () => ({ contextCacheKey: () => 'k' }))
vi.mock('@/features/engramind/server/models', () => ({ EngramindContextCache: { findById: () => ({ select: () => ({ lean: async () => ({ counts: { full: 10, titles: 2, overflow: 1 } }) }) }) } }))

import { resetSelfMemoryCounters, selfMemoryTools, type SelfMemoryContext } from '@/features/ai/server/self-memory/tools'
import { selfMemoryInstructions } from '@/features/ai/self-memory'

const C = 'a'.repeat(24)
const K = 'b'.repeat(24)
const OTHER = 'c'.repeat(24)
const ctx = (overrides: Partial<SelfMemoryContext> = {}): SelfMemoryContext => ({ consumer: 'opex', turn: { kind: 'owner' }, label: 'Agente Opex', turnKey: 't1', actorId: 'local', ...overrides })
const tool = (context: SelfMemoryContext, name: string) => {
  const found = selfMemoryTools(context).find((item) => item.name === name)!
  return (input: Record<string, unknown>) => found.execute(found.input.parse(input), { sessionId: 's', actorId: 'local' })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetSelfMemoryCounters()
})

describe('memória própria', () => {
  it('grava com o token e a origem do agente (sem filtro de conteúdo: URL, código e chave passam)', async () => {
    const onChange = vi.fn()
    const text = 'OPE-12: o deploy usa https://deploy.exemplo.com com a chave sk-abc123 em /etc/app.env'
    const result = await tool(ctx({ onChange }), 'remember')({ lista: 'opex-owner', texto: text })
    expect(mocks.create).toHaveBeenCalledWith('opex-owner', text, 'local', expect.objectContaining({ agent: { consumer: 'opex', label: 'Agente Opex' } }))
    expect(result).toMatchObject({ ok: true, lista: 'opex-owner', id: 'm_1' })
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('Memória gravada pelo agente: OPE-12'))
  })

  it('portal: só a lista do cliente da sessão; o cliente é forçado pelo servidor (o modelo não escolhe)', async () => {
    const portal = ctx({ turn: { kind: 'client', clientId: K } })
    const names = selfMemoryTools(portal).find((item) => item.name === 'remember')!
    expect(names.input.safeParse({ lista: 'opex-global', texto: 'x' }).success).toBe(false)
    expect(names.input.safeParse({ lista: 'opex-client-specific', texto: 'x', clientId: OTHER }).success).toBe(true)
    await tool(portal, 'remember')({ lista: 'opex-client-specific', texto: 'Cliente quer PDF.', clientId: OTHER })
    expect(mocks.create).toHaveBeenCalledWith('opex-client-specific', 'Cliente quer PDF.', 'local', expect.objectContaining({ clientId: K }))
  })

  it('dono grava num cliente específico informando o clientId; sem ele, recusa', async () => {
    await tool(ctx(), 'remember')({ lista: 'opex-client-specific', texto: 'Cliente X quer PDF.', clientId: K })
    expect(mocks.create).toHaveBeenCalledWith('opex-client-specific', 'Cliente X quer PDF.', 'local', expect.objectContaining({ clientId: K }))
    await expect(tool(ctx(), 'remember')({ lista: 'opex-client-specific', texto: 'Sem cliente.' })).rejects.toMatchObject({ code: 'CLIENT_REQUIRED' })
  })

  it('desenvolvedor: a central vem da mesa; lista de outro agente não aparece', async () => {
    const dev = ctx({ consumer: 'desenvolvedor', turn: { kind: 'central', centralId: C }, label: 'Agente desenvolvedor · OPE-1' })
    await tool(dev, 'remember')({ lista: 'developer-central', texto: 'Use pnpm.' })
    expect(mocks.create).toHaveBeenCalledWith('developer-central', 'Use pnpm.', 'local', expect.objectContaining({ centralId: C }))
    expect(selfMemoryTools(dev).find((item) => item.name === 'remember')!.input.safeParse({ lista: 'adversarial', texto: 'x' }).success).toBe(false)
  })

  it('limite de gravações por turno: a sexta é recusada', async () => {
    const remember = tool(ctx(), 'remember')
    for (let index = 0; index < 5; index++) await remember({ lista: 'opex-owner', texto: `Regra ${index}` })
    await expect(remember({ lista: 'opex-owner', texto: 'Sexta' })).rejects.toMatchObject({ code: 'SELF_MEMORY_TURN_LIMIT' })
    await expect(tool(ctx({ turnKey: 't2' }), 'remember')({ lista: 'opex-owner', texto: 'Outro turno' })).resolves.toMatchObject({ ok: true })
  })

  it('inativar e excluir passam pelo serviço com o agente (a proteção do dono fica lá)', async () => {
    await tool(ctx(), 'set_my_memory_active')({ lista: 'opex-owner', memoryId: 'm_1', ativa: false })
    expect(mocks.update).toHaveBeenCalledWith('opex-owner', 'm_1', { ativa: false }, 'local', expect.objectContaining({ agent: expect.objectContaining({ consumer: 'opex' }) }))
    await tool(ctx(), 'forget_my_memory')({ lista: 'opex-owner', memoryId: 'm_1' })
    expect(mocks.remove).toHaveBeenCalledWith('opex-owner', 'm_1', 'local', {}, expect.objectContaining({ agent: expect.objectContaining({ consumer: 'opex' }) }))
  })

  it('listar mostra as listas legíveis do turno, quais são graváveis e quantas ficaram fora do contexto', async () => {
    const result = (await tool(ctx({ consumer: 'adversario', turn: { kind: 'review' } }), 'list_my_memories')({})) as { listas: { lista: string; gravavel: boolean }[]; foraDoContexto: number }
    expect(result.listas.map((item) => [item.lista, item.gravavel])).toEqual([['app-global', true], ['adversarial', true]])
    expect(result.foraDoContexto).toBe(3)
  })

  it('instrução: listas graváveis do turno, cuidado com as globais e a regra das memórias do dono', () => {
    const text = selfMemoryInstructions('opex', { kind: 'client', clientId: K })
    expect(text).toContain('`opex-client-specific`')
    expect(text).not.toContain('`opex-global`')
    expect(text).toContain('Pode registrar códigos de tarefa, URLs, rotas, nomes, tokens e chaves')
    expect(text).toContain('não excluir nem inativar')
    expect(selfMemoryInstructions('maddox', { kind: 'owner' }, { toolPrefix: 'opex_memorias_' })).toContain('`opex_memorias_remember`')
  })

  it('inativar e excluir são destrutivas (pedem Confirmar/Cancelar no Agente Opex); as demais não', () => {
    const risks = Object.fromEntries(selfMemoryTools(ctx()).map((item) => [item.name, item.risk]))
    expect(risks).toEqual({ list_my_memories: 'read', remember: 'write', update_my_memory: 'write', pin_my_memory: 'write', set_my_memory_active: 'destructive', forget_my_memory: 'destructive' })
  })

  it('no Agente Opex, excluir pede Confirmar/Cancelar e não toca na memória até o dono confirmar', async () => {
    const { buildToolRuntime } = await import('@/features/opex-agent/server/tool-runtime')
    const requestConfirmation = vi.fn(async () => ({ actionId: 'a1', summary: 'Excluir memória', toolName: 'forget_my_memory' }) as never)
    const runtime = buildToolRuntime(selfMemoryTools(ctx()), { sessionId: 's', actorId: 'local' } as never, {}, { requestConfirmation })
    const execute = (runtime.tools.forget_my_memory as unknown as { execute: (input: unknown, options: { toolCallId: string }) => Promise<{ status: string }> }).execute
    expect(await execute({ lista: 'opex-owner', memoryId: 'm_1' }, { toolCallId: 'c1' })).toMatchObject({ status: 'confirmation_required' })
    expect(requestConfirmation).toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    // Com a confirmação desligada pelo dono, executa direto.
    const free = buildToolRuntime(selfMemoryTools(ctx()), { sessionId: 's', actorId: 'local' } as never, { forget_my_memory: false }, { requestConfirmation })
    await (free.tools.forget_my_memory as unknown as { execute: (input: unknown, options: { toolCallId: string }) => Promise<unknown> }).execute({ lista: 'opex-owner', memoryId: 'm_1' }, { toolCallId: 'c2' })
    expect(mocks.remove).toHaveBeenCalledTimes(1)
  })
})
