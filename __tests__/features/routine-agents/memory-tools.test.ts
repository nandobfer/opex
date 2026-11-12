import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toEngramindError } from '@/features/engramind/server/errors'

/**
 * Memória do agente rotineiro em canais assinados (critério aprovado OPE-130, D13–D15): chave
 * idempotente, edição por id, listagem completa e paginada, lista de permissão de canais e
 * repetição com a credencial do Opex só quando o token do agente é recusado.
 */

const engramind = vi.hoisted(() => ({ calls: [] as { method: string; path: string; query?: Record<string, unknown>; body?: Record<string, unknown>; target: unknown }[], handler: null as null | ((call: { method: string; path: string; query?: Record<string, unknown>; body?: Record<string, unknown>; target: unknown }) => unknown) }))
const audits = vi.hoisted(() => [] as Record<string, unknown>[])

vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: vi.fn(async (method: string, request: { path: string; query?: Record<string, unknown>; body?: Record<string, unknown> }, options: { target?: unknown } = {}) => {
    const call = { method, path: request.path, query: request.query, body: request.body, target: options.target ?? 'opex' }
    engramind.calls.push(call)
    return engramind.handler!(call)
  }),
}))
vi.mock('@/lib/audit/record', () => ({ AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR' }, recordAudit: vi.fn(async (entry: Record<string, unknown>) => void audits.push(entry)) }))
vi.mock('@/lib/pusher/channels', () => ({ integrationChannel: (name: string) => `private-integration-${name}`, publishToChannels: vi.fn(async () => undefined) }))
vi.mock('@/features/ai/server/agent-memory-service', () => ({ parseText: async (text: string) => text, resolveCategory: async (category: string | null) => category ?? 'PROJECT_RULES' }))

import { routineMemoryTools } from '@/features/routine-agents/server/tools/memory'
import type { OpexTool } from '@/features/opex-agent/server/tools/define'

const AGENT = { baseUrl: 'http://engramind', token: 'tk_agent' }
const ALLOWED = ['agentes/rotineiros/indexador', 'opex', 'agentes/rotineiros/global', 'experiencia/desenvolvimento']

const memory = (id: string, extra: Record<string, unknown> = {}) => ({ id, channel: 'experiencia/desenvolvimento', title: `catalogo: ${id}`, text: 'x'.repeat(2_500), category: 'PROJECT_RULES', status: 'active', version: 1, key: null, tags: [], updated_at: '2026-11-05T00:00:00Z', origin: { source: 'rotineiro' }, ...extra })

function tools(warn = vi.fn()) {
  const list = routineMemoryTools({ slug: 'indexador', label: 'Agente Indexador #1', runId: 'run_1', target: AGENT, allowed: ALLOWED, warn })
  const byName = (name: string) => list.find((tool) => tool.name === name) as OpexTool
  const run = (name: string, input: unknown) => byName(name).execute(byName(name).input.parse(input), { sessionId: '', actorId: 'local' })
  return { run, warn }
}

beforeEach(() => {
  engramind.calls = []
  audits.length = 0
  engramind.handler = null
})

describe('critério aprovado (OPE-130, D13): canais assinados', () => {
  it('remember grava no canal extra pedido, com o token do agente', async () => {
    engramind.handler = () => ({ memory: memory('m_1'), duplicate: false, created: true, similar: [] })
    const result = await tools().run('remember', { canal: 'experiencia/desenvolvimento', texto: 'catálogo do repo' })
    expect(result).toMatchObject({ id: 'm_1', canal: 'experiencia/desenvolvimento', criada: true })
    expect(engramind.calls[0]).toMatchObject({ method: 'POST', path: '/v1/memories', target: AGENT, body: { channel: 'experiencia/desenvolvimento' } })
  })

  it('sem canal, grava no canal próprio; lista "global" vai para o global dos rotineiros', async () => {
    engramind.handler = () => ({ memory: memory('m_1'), duplicate: false, created: true, similar: [] })
    const { run } = tools()
    await run('remember', { texto: 'fato do agente' })
    await run('remember', { lista: 'global', texto: 'fato de todos' })
    expect(engramind.calls.map((call) => call.body?.channel)).toEqual(['agentes/rotineiros/indexador', 'agentes/rotineiros/global'])
  })

  it('canal fora da lista é recusado com os canais válidos, sem chamar o Engramind', async () => {
    await expect(tools().run('remember', { canal: 'agentes/desenvolvedor/global', texto: 'fora' })).rejects.toMatchObject({ code: 'ROUTINE_CHANNEL_NOT_ALLOWED' })
    await expect(tools().run('list_my_memories', { canal: 'outro' })).rejects.toThrow(/experiencia\/desenvolvimento/)
    expect(engramind.calls).toHaveLength(0)
  })
})

describe('critério aprovado (OPE-130, D14): chave idempotente e edição', () => {
  it('com chave envia upsert; a primeira cria e a mesma chave atualiza a entrada (criada: false)', async () => {
    let created = true
    engramind.handler = () => {
      const result = { memory: memory('m_cat', { key: 'catalogo-nandobfer-petify', version: created ? 1 : 2 }), duplicate: false, created, similar: [] }
      created = false
      return result
    }
    const { run } = tools()
    const input = { canal: 'experiencia/desenvolvimento', chave: 'catalogo-nandobfer-petify', titulo: 'catalogo: nandobfer/petify', texto: '{"repo":"nandobfer/petify"}' }
    const first = await run('remember', input)
    const second = await run('remember', { ...input, texto: '{"repo":"nandobfer/petify","ultimoPushVisto":"2026-11-01"}' })
    expect(first).toMatchObject({ criada: true, atualizada: false, chave: 'catalogo-nandobfer-petify' })
    expect(second).toMatchObject({ criada: false, atualizada: true, id: 'm_cat', versao: 2 })
    expect(engramind.calls[0]!.body).toMatchObject({ key: 'catalogo-nandobfer-petify', upsert: true, title: 'catalogo: nandobfer/petify' })
    expect(audits.map((entry) => entry.acao)).toEqual(['CRIAR', 'ATUALIZAR'])
  })

  it('chave com caractere inválido é recusada pelo schema', async () => {
    await expect(async () => tools().run('remember', { chave: 'catalogo/dono repo', texto: 'abc' })).rejects.toThrow(/Chave inválida/)
  })

  it('sem chave e com similar ≥ 0,9, a resposta orienta a não duplicar', async () => {
    engramind.handler = () => ({ memory: memory('m_novo'), duplicate: false, created: true, similar: [{ id: 'm_velho', title: 'petify', score: 0.97 }] })
    const result = (await tools().run('remember', { texto: 'petify de novo' })) as { aviso?: string }
    expect(result.aviso).toContain('m_velho')
  })

  it('update_memory edita com a versão lida; versão diferente vira 409 acionável', async () => {
    engramind.handler = (call) => {
      if (call.method === 'GET') return memory('m_1', { version: 3 })
      if (call.body?.expected_version === 2) throw toEngramindError(409, { code: 'MEMORY_VERSION_CONFLICT', details: { current_version: 3 } })
      return { memory: memory('m_1', { version: 4 }), duplicate: false, similar: [] }
    }
    const { run } = tools()
    await expect(run('update_memory', { id: 'm_1', texto: 'novo texto', versao: 3 })).resolves.toMatchObject({ id: 'm_1', versao: 4 })
    await expect(run('update_memory', { id: 'm_1', texto: 'novo texto', versao: 2 })).rejects.toMatchObject({ code: 'MEMORY_VERSION_CONFLICT' })
  })

  it('update_memory recusa memória de canal que o agente não assina', async () => {
    engramind.handler = () => memory('m_x', { channel: 'agentes/desenvolvedor/global' })
    await expect(tools().run('update_memory', { id: 'm_x', texto: 'troca' })).rejects.toMatchObject({ code: 'ROUTINE_CHANNEL_NOT_ALLOWED' })
    expect(engramind.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0)
  })

  it('a sexta gravação no turno (remember + update_memory) é recusada', async () => {
    engramind.handler = (call) => (call.method === 'GET' ? memory('m_1') : { memory: memory('m_1'), duplicate: false, created: true, similar: [] })
    const { run } = tools()
    for (let i = 0; i < 3; i++) await run('remember', { texto: `fato ${i}` })
    await run('update_memory', { id: 'm_1', texto: 'a' + 'b'.repeat(5) })
    await run('update_memory', { id: 'm_1', texto: 'c' + 'd'.repeat(5) })
    await expect(run('remember', { texto: 'sexta' })).rejects.toThrow(/Limite de 5/)
  })
})

describe('critério aprovado (OPE-130, D15): listagem completa e paginada', () => {
  it('texto acima de 1.000 caracteres volta inteiro; com mais páginas, parcial e cursor', async () => {
    engramind.handler = (call) => (call.query?.cursor ? { memories: [memory('m_2')], next_cursor: null } : { memories: [memory('m_1')], next_cursor: 'c2' })
    const { run } = tools()
    const first = (await run('list_my_memories', { canal: 'experiencia/desenvolvimento' })) as { memorias: { texto: string }[]; parcial: boolean; proximoCursor: string | null; aviso?: string }
    expect(first.memorias[0]!.texto).toHaveLength(2_500)
    expect(first).toMatchObject({ parcial: true, proximoCursor: 'c2' })
    expect(first.aviso).toContain('cursor')
    const last = await run('list_my_memories', { canal: 'experiencia/desenvolvimento', cursor: 'c2' })
    expect(last).toMatchObject({ parcial: false, proximoCursor: null })
  })

  it('formato "titulos" pede fields=title, sem texto; filtro por chave', async () => {
    engramind.handler = () => ({ memories: [memory('m_1', { key: 'catalogo-nandobfer-petify' })], next_cursor: null })
    const result = (await tools().run('list_my_memories', { canal: 'experiencia/desenvolvimento', formato: 'titulos', chave: 'catalogo-nandobfer-petify' })) as { memorias: Record<string, unknown>[] }
    expect(engramind.calls[0]!.query).toMatchObject({ channels: 'experiencia/desenvolvimento', fields: 'title', key: 'catalogo-nandobfer-petify', limit: 200 })
    expect(result.memorias[0]).toMatchObject({ chave: 'catalogo-nandobfer-petify', titulo: 'catalogo: m_1' })
    expect(result.memorias[0]).not.toHaveProperty('texto')
  })
})

describe('credencial do agente', () => {
  it('token recusado (AUTH_INVALID, pelo código) repete com a credencial do Opex no mesmo canal e avisa', async () => {
    engramind.handler = (call) => {
      if (call.target === AGENT) throw toEngramindError(500, { code: 'AUTH_INVALID' })
      return { memories: [memory('m_1')], next_cursor: null }
    }
    const { run, warn } = tools()
    const result = await run('list_my_memories', { canal: 'experiencia/desenvolvimento' })
    expect(result).toMatchObject({ canal: 'experiencia/desenvolvimento' })
    expect(engramind.calls.map((call) => call.target)).toEqual([AGENT, 'opex'])
    expect(engramind.calls[1]!.query).toMatchObject({ channels: 'experiencia/desenvolvimento' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Reprovisionar'))
  })

  it('escrita negada no canal não repete e orienta reprovisionar; indisponibilidade sobe sem repetir', async () => {
    engramind.handler = () => {
      throw toEngramindError(403, { code: 'SCOPE_REQUIRED' })
    }
    await expect(tools().run('remember', { canal: 'opex', texto: 'abc' })).rejects.toMatchObject({ code: 'ROUTINE_CHANNEL_FORBIDDEN' })
    expect(engramind.calls).toHaveLength(1)
    engramind.calls = []
    engramind.handler = () => {
      throw toEngramindError(503, { code: 'HTTP_503' })
    }
    await expect(tools().run('remember', { texto: 'abc' })).rejects.toBeTruthy()
    expect(engramind.calls).toHaveLength(1)
  })
})

describe('instruções da execução (D13)', () => {
  it('listam os canais graváveis e mandam consultar o catálogo e usar chave fixa', async () => {
    const { routineInstructions } = await import('@/features/routine-agents/run-prompt')
    const text = routineInstructions({ name: 'Agente Indexador', objective: 'Catalogar', instructions: '', engine: 'opex', confirmIrreversible: false, maxLiveWaitMinutes: null, memoryBlock: '', memoryChannels: ALLOWED, toolPrefix: '', warnings: [], now: new Date('2026-11-05T12:00:00Z') })
    expect(text).toContain('experiencia/desenvolvimento')
    expect(text).toContain('formato "titulos"')
    expect(text).toContain('`chave`')
    expect(text).toContain('update_memory')
  })
})

describe('conversa com o agente (OPE-160)', () => {
  it('a auditoria registra a conversa no lugar da execução', async () => {
    engramind.handler = () => ({ memory: memory('m_1'), duplicate: false, created: true, similar: [] })
    const list = routineMemoryTools({ slug: 'indexador', label: 'Agente Indexador · conversa', runId: '', sessionId: 'sess_1', target: AGENT, allowed: ALLOWED })
    const remember = list.find((tool) => tool.name === 'remember') as OpexTool
    await remember.execute(remember.input.parse({ texto: 'fato dito na conversa' }), { sessionId: 'sess_1', actorId: 'local' })
    expect(audits[0]?.depois).toMatchObject({ conversa: 'sess_1', rotineiro: 'indexador' })
    expect(audits[0]?.depois).not.toHaveProperty('execucao')
  })
})
