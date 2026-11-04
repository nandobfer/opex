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
const hints = vi.hoisted(() => ({ call: vi.fn(async (..._args: unknown[]) => ({ hints: [{ id: 'm_1', title: 'Deploy', channel: 'opex', score: 0.8 }] })), tokens: { opex: 'eng.tk_opex.s', maddox: 'eng.tk_maddox.s' } as Record<string, string | null> }))
vi.mock('@/features/engramind/server/memory-network', () => ({ agentTokenFor: async (consumer: string) => hints.tokens[consumer] ?? null }))
vi.mock('@/features/engramind/server/client', () => ({ engramindCall: hints.call, engramindTarget: async () => ({ baseUrl: 'http://engramind', token: 'admin' }) }))
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

  it('confirmação só em excluir, arquivar, revogar e rotacionar', () => {
    expect(engramindTools.filter((tool) => tool.risk === 'destructive').map((tool) => tool.name).sort()).toEqual(
      ['archive_engramind_channel', 'archive_engramind_memory', 'delete_engramind_agent', 'delete_engramind_app', 'delete_engramind_channel', 'delete_engramind_memory', 'revoke_engramind_token', 'rotate_engramind_token'].sort(),
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

describe('busca de memórias pelo agente (OPE-109, OPE-116)', () => {
  const hit = (id: string, channel: string) => ({ memory: { id, channel, text: 'segredo do texto', title: 'Título' }, rank: 1, score: 0.9 })
  beforeEach(() => mocks.run.mockReset())

  it('OPE-116: a busca roda pelo serviço e devolve o resultado; o consumo ao vivo vem do webhook memory.consumed (o Opex não publica)', async () => {
    mocks.run.mockResolvedValue({ mode: 'hybrid', results: [hit('m_1', 'opex'), hit('m_2', 'agentes/opex/global')] })
    await expect(find('search_engramind_memories').execute({ query: 'pnpm' }, context)).resolves.toMatchObject({ results: [expect.anything(), expect.anything()] })
    expect(mocks.run).toHaveBeenCalledWith('search_memories', expect.objectContaining({ query: 'pnpm' }), 'local')
    await expect(import('@/features/engramind/server/consumption' as string)).rejects.toThrow()
  })
})

describe('get_engramind_hints (OPE-117)', () => {
  beforeEach(() => {
    mocks.run.mockReset()
    hints.call.mockClear()
    hints.tokens = { opex: 'eng.tk_opex.s', maddox: 'eng.tk_maddox.s' }
  })

  it('está no Agente Opex e no Maddox do dono (leitura, sem confirmação) e fora do portal', async () => {
    expect(find('get_engramind_hints').risk).toBe('read')
    const { maddoxMcpCatalog } = await import('@/features/maddox-agent/server/mcp-catalog')
    expect((await maddoxMcpCatalog('owner')).map((tool) => tool.name)).toContain('get_engramind_hints')
    expect(OPEX_CLIENT_SERVER_TOOLS.some((tool) => tool.name === 'get_engramind_hints')).toBe(false)
  })

  it('valida o texto (1 a 2000) e o limite (1 a 20)', () => {
    const input = find('get_engramind_hints').input
    expect(input.safeParse({ text: '' }).success).toBe(false)
    expect(input.safeParse({ text: 'x'.repeat(2001) }).success).toBe(false)
    expect(input.safeParse({ text: 'deploy', limit: 21 }).success).toBe(false)
    expect(input.safeParse({ text: 'deploy', channels: ['opex'], limit: 20 }).success).toBe(true)
  })

  it('o Agente Opex e o Maddox pedem as dicas com o próprio token de agente, não o admin', async () => {
    await find('get_engramind_hints').execute({ text: 'deploy' }, context)
    await find('get_engramind_hints').execute({ text: 'deploy' }, { ...context, scope: { kind: 'owner', agent: 'maddox' } as never })
    expect(hints.call.mock.calls.map((call) => (call[2] as { target: { token: string } }).target.token)).toEqual(['eng.tk_opex.s', 'eng.tk_maddox.s'])
    expect(hints.call.mock.calls[0]![1]).toMatchObject({ path: '/v1/hints', body: { text: 'deploy' } })
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it('por token de sistema (ou sem token do agente) segue pela operação do admin', async () => {
    mocks.run.mockResolvedValue({ hints: [] })
    await find('get_engramind_hints').execute({ text: 'x' }, { ...context, origin: { kind: 'api-token', tokenId: 't', nome: 'Sistema', prefixo: 'opx_' } })
    hints.tokens.opex = null
    await find('get_engramind_hints').execute({ text: 'x' }, context)
    expect(mocks.run).toHaveBeenCalledTimes(2)
    expect(mocks.run.mock.calls[0]![0]).toBe('get_hints')
    expect(hints.call).not.toHaveBeenCalled()
  })
})
