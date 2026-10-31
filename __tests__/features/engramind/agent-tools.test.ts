import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Ferramentas do Agente Opex para o Engramind: riscos, segredos fora do chat e o "Ver token". */

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  reveal: vi.fn(async (_secret: string, options: { title: string; label: string; ttlMs: number }) => ({ kind: 'reveal-secret', id: 'rv_1234567890', label: options.label, title: options.title, expiresAt: '2026-10-31T12:10:00Z' })),
}))

vi.mock('@/features/engramind/server/operations-runner', () => ({ runEngramindOperation: mocks.run, importEngramindMemories: vi.fn() }))
vi.mock('@/features/opex-agent/server/secret-reveals', () => ({ createSecretReveal: mocks.reveal }))

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

  it('as demais chamam o serviço do Opex (nunca o HTTP do app)', async () => {
    mocks.run.mockResolvedValue({ ok: true })
    await find('archive_engramind_channel').execute({ channel: 'eng/x' }, context)
    expect(mocks.run).toHaveBeenCalledWith('archive_channel', { channel: 'eng/x' }, 'local')
  })
})
