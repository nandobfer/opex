import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Ferramentas do Agente Opex para o Engramind: riscos, segredos fora do chat e o "Ver token". */

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  apply: vi.fn(async (...args: unknown[]) => ({ applied: true, keySynced: true, args })),
  reveal: vi.fn(async (_secret: string, options: { title: string; label: string; ttlMs: number }) => ({ kind: 'reveal-secret', id: 'rv_1234567890', label: options.label, title: options.title, expiresAt: '2026-10-31T12:10:00Z' })),
}))

vi.mock('@/features/engramind/server/operations-runner', () => ({ runEngramindOperation: mocks.run, importEngramindMemories: vi.fn() }))
vi.mock('@/features/opex-agent/server/secret-reveals', () => ({ createSecretReveal: mocks.reveal }))
vi.mock('@/features/engramind/server/shared', () => ({ engramindLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
const consumption = vi.hoisted(() => ({ publishConsumption: vi.fn(async () => undefined) }))
vi.mock('@/features/engramind/server/consumption', () => consumption)
vi.mock('@/features/engramind/server/ai-source', () => ({ applyOpexAiSource: mocks.apply, getOpexAiSourceState: vi.fn(), resendOpexAiKey: vi.fn() }))

import { engramindTools } from '@/features/opex-agent/server/tools/engramind'
import { OPEX_CLIENT_SERVER_TOOLS } from '@/features/opex-agent/server/client-tools/registry'
import { resultActionOf } from '@/features/opex-agent/result-actions'

const find = (name: string) => engramindTools.find((tool) => tool.name === name)!
const context = { sessionId: 's1', actorId: 'local' }

describe('ferramentas do Engramind', () => {
  beforeEach(() => {
    mocks.run.mockReset()
    mocks.reveal.mockClear()
  })

  it('cobrem as operações de todas as áreas e ficam no grupo engramind', () => {
    const names = engramindTools.map((tool) => tool.name)
    for (const name of ['update_engramind_settings', 'update_engramind_channel_settings', 'set_engramind_secret', 'test_engramind_redator', 'list_engramind_embedding_models', 'reembed_engramind', 'create_engramind_app', 'create_engramind_agent', 'issue_engramind_token', 'create_engramind_channel', 'subscribe_engramind_agent', 'search_engramind_memories', 'import_engramind_memories', 'retry_engramind_job', 'get_engramind_audit', 'get_engramind_env', 'update_engramind_env', 'apply_engramind_env', 'run_engramind_bootstrap'])
      expect(names).toContain(name)
    expect(new Set(engramindTools.map((tool) => tool.group))).toEqual(new Set(['engramind']))
  })

  it('confirmação só em excluir, arquivar e revogar', () => {
    expect(engramindTools.filter((tool) => tool.risk === 'destructive').map((tool) => tool.name).sort()).toEqual(
      ['archive_engramind_channel', 'archive_engramind_memory', 'delete_engramind_agent', 'delete_engramind_app', 'delete_engramind_channel', 'delete_engramind_memory', 'revoke_engramind_token'].sort(),
    )
    for (const tool of engramindTools.filter((item) => item.risk === 'destructive')) expect(typeof tool.summarize).toBe('function')
  })

  it('emitir token fica fora do MCP do Maddox (lá não há o botão "Ver token"); o resto do grupo segue', async () => {
    const { maddoxMcpCatalog } = await import('@/features/maddox-agent/server/mcp-catalog')
    const { maddoxOwnerToolMetas } = await import('@/features/maddox-agent/catalog')
    const names = (await maddoxMcpCatalog('owner')).map((tool) => tool.name)
    expect(names).not.toContain('issue_engramind_token')
    expect(names).toContain('revoke_engramind_token')
    expect(maddoxOwnerToolMetas(engramindTools.map((tool) => ({ name: tool.name, group: tool.group }) as never)).map((tool) => tool.name)).not.toContain('issue_engramind_token')
  })

  it('não existem no Agente Opex do portal', () => {
    expect(OPEX_CLIENT_SERVER_TOOLS.some((tool) => tool.name.includes('engramind'))).toBe(false)
  })

  it('segredos nunca vão para o histórico nem para os cards', () => {
    const secret = find('set_engramind_secret')
    expect(JSON.stringify(secret.redact!(secret.input.parse({ key: 'embedding.api_key', value: 'sk-123' })))).not.toContain('sk-123')
    const env = find('update_engramind_env')
    expect(JSON.stringify(env.redact!(env.input.parse({ hash: 'a'.repeat(64), changes: {}, litestreamSecret: 's3-secreto' })))).not.toContain('s3-secreto')
  })

  it('emitir token: o modelo recebe só o prefixo e o card ganha o "Ver token"', async () => {
    mocks.run.mockResolvedValue({ token: { id: 'tk_1', prefix: 'eng.tk_1', kind: 'agent', scopes: ['read'], app: { slug: 'app-a' }, agent: { slug: 'curador' }, label: null, expires_at: null }, secret: 'eng.tk_1.segredo-de-verdade' })
    const output = await find('issue_engramind_token').execute({ kind: 'agent', agent: 'app-a/curador', scopes: ['read'] }, context)
    const text = JSON.stringify(output)
    expect(text).not.toContain('segredo-de-verdade')
    expect(text).toContain('eng.tk_1')
    expect(mocks.reveal).toHaveBeenCalledWith('eng.tk_1.segredo-de-verdade', expect.objectContaining({ label: 'Ver token', ttlMs: 600_000 }))
    expect(resultActionOf(text)).toMatchObject({ kind: 'reveal-secret', label: 'Ver token' })
  })

  it('cofre do "Ver token" falhou: revoga o token recém-emitido e pede para emitir de novo (sem segredo na saída)', async () => {
    const issued = { token: { id: 'tk_2', prefix: 'eng.tk_2', kind: 'admin', scopes: ['read'], app: { slug: 'app-a' }, agent: null, label: null, expires_at: null }, secret: 'eng.tk_2.segredo' }
    mocks.run.mockImplementation(async (id: string) => (id === 'issue_token' ? issued : { revoked: true }))
    mocks.reveal.mockImplementationOnce(async () => {
      throw new Error('mongo fora')
    })
    const failure = (await find('issue_engramind_token').execute({ kind: 'admin', app: 'app-a', scopes: ['read'] }, context).catch((caught: unknown) => caught)) as Error & { code?: string }
    expect(failure.code).toBe('ENGRAMIND_TOKEN_REVEAL_FAILED')
    expect(failure.message).toContain('revogado')
    expect(failure.message).not.toContain('eng.tk_2.segredo')
    expect(mocks.run).toHaveBeenCalledWith('revoke_token', { token: 'tk_2' }, 'local')
  })

  it('se nem a revogação der certo, o erro diz qual token revogar', async () => {
    const issued = { token: { id: 'tk_3', prefix: 'eng.tk_3', kind: 'admin', scopes: ['read'], app: { slug: 'app-a' }, agent: null, label: null, expires_at: null }, secret: 'eng.tk_3.segredo' }
    mocks.run.mockImplementation(async (id: string) => {
      if (id === 'issue_token') return issued
      throw new Error('engramind fora')
    })
    mocks.reveal.mockImplementationOnce(async () => {
      throw new Error('mongo fora')
    })
    await expect(find('issue_engramind_token').execute({ kind: 'admin', app: 'app-a', scopes: ['read'] }, context)).rejects.toMatchObject({ code: 'ENGRAMIND_TOKEN_ORPHAN', message: expect.stringContaining('Revogue eng.tk_3') })
  })

  it('IA do Opex: ler, aplicar (com confirmação por padrão) e reenviar; a chave nunca está na entrada', async () => {
    expect(find('get_engramind_ai_source').risk).toBe('read')
    const apply = find('apply_engramind_ai_source')
    expect(apply.risk).toBe('write')
    expect(apply.confirmByDefault).toBe(true)
    expect(find('resend_engramind_ai_key').risk).toBe('write')
    expect(apply.input.safeParse({ section: 'redator', source: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk' } }).success).toBe(false)
    expect(apply.input.safeParse({ section: 'redator', source: { provider: 'anthropic', model: 'claude-opus', temperature: null } }).success).toBe(true)
    expect(apply.input.safeParse({ section: 'redator', source: { provider: 'anthropic', model: 'claude-opus', temperature: 2.5 } }).success).toBe(false)
    expect(apply.input.safeParse({ section: 'embedding', source: { provider: 'local', model: 'bge-m3', temperature: 0.2 } }).success).toBe(false)
    const input = { section: 'redator', source: { provider: 'openai', model: 'gpt-4o', fallbackModels: [], temperature: null } }
    await apply.execute(input, context)
    expect(mocks.apply).toHaveBeenCalledWith(input, 'local')
  })

  it('as demais chamam o serviço do Opex (nunca o HTTP do app)', async () => {
    mocks.run.mockResolvedValue({ ok: true })
    await find('archive_engramind_channel').execute({ channel: 'eng/x' }, context)
    expect(mocks.run).toHaveBeenCalledWith('archive_channel', { channel: 'eng/x' }, 'local')
  })
})

describe('busca de memórias pelo agente (OPE-109)', () => {
  const hit = (id: string, channel: string) => ({ memory: { id, channel, text: 'segredo do texto', title: 'Título' }, rank: 1, score: 0.9 })
  beforeEach(() => {
    mocks.run.mockReset()
    consumption.publishConsumption.mockClear()
  })

  it('publica o consumo com o agente do chat, os canais e só os ids', async () => {
    mocks.run.mockResolvedValue({ mode: 'hybrid', results: [hit('m_1', 'opex'), hit('m_2', 'agentes/opex/global')] })
    await find('search_engramind_memories').execute({ query: 'pnpm' }, context)
    await vi.waitFor(() => expect(consumption.publishConsumption).toHaveBeenCalledTimes(1))
    const event = consumption.publishConsumption.mock.calls[0]![0] as Record<string, unknown>
    expect(event).toEqual({ agent: 'opex/opex', kind: 'search', channels: ['opex', 'agentes/opex/global'], delivered: ['opex', 'agentes/opex/global'], memoryIds: ['m_1', 'm_2'] })
    expect(JSON.stringify(event)).not.toContain('segredo')
  })

  it('pelo MCP do Agente Maddox (token de sistema) o consumidor é opex/maddox; canais pedidos entram como consultados', async () => {
    mocks.run.mockResolvedValue({ mode: 'text', results: [hit('m_1', 'opex')] })
    await find('search_engramind_memories').execute({ query: 'x', channels: ['opex', 'agentes/maddox/dono'] }, { ...context, sessionId: '', origin: { kind: 'api-token', tokenId: 't', nome: 'Maddox', prefixo: 'opx_' } })
    await vi.waitFor(() => expect(consumption.publishConsumption).toHaveBeenCalledTimes(1))
    expect(consumption.publishConsumption.mock.calls[0]![0]).toMatchObject({ agent: 'opex/maddox', channels: ['opex', 'agentes/maddox/dono'], delivered: ['opex'] })
  })

  it('sem resultados não publica; outras operações também não; falha na publicação não derruba a ferramenta', async () => {
    mocks.run.mockResolvedValue({ mode: 'hybrid', results: [] })
    await find('search_engramind_memories').execute({ query: 'nada' }, context)
    mocks.run.mockResolvedValue({ memories: [] })
    await find('list_engramind_memories').execute({}, context)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(consumption.publishConsumption).not.toHaveBeenCalled()
    consumption.publishConsumption.mockRejectedValueOnce(new Error('pusher fora'))
    mocks.run.mockResolvedValue({ mode: 'hybrid', results: [hit('m_1', 'opex')] })
    await expect(find('search_engramind_memories').execute({ query: 'x' }, context)).resolves.toMatchObject({ results: [expect.anything()] })
  })
})
