import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEngramind, type FakeEngramind } from '../../helpers/fake-engramind'

/**
 * Rede das memórias dos agentes no Engramind (OPE-104): cinco identidades (os quatro consumidores e o
 * Agente Mentor), assinaturas por identidade, escopos do token (o Mentor sem `delete`) e reemissão
 * quando os escopos divergem.
 */

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeEngramind, tokens: {} as Record<string, unknown> }))

vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: (...args: Parameters<FakeEngramind['engramindCall']>) => holder.fake.engramindCall(...args),
  engramindTarget: async () => ({ baseUrl: 'http://engramind', token: 'admin-token' }),
}))
vi.mock('@/features/engramind/server/models', () => ({
  ENGRAMIND_STATE_ID: 'engramind',
  engramindDb: async () => undefined,
  EngramindState: {
    findById: () => ({ select: () => ({ lean: async () => ({ agentTokens: holder.tokens }) }) }),
    updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
      for (const [key, value] of Object.entries(update.$set)) holder.tokens[key.replace('agentTokens.', '')] = value
    },
  },
}))
vi.mock('@/features/engramind/server/shared', () => ({
  AcaoAuditoria: { EXECUTAR: 'EXECUTAR' },
  auditEngramind: vi.fn(async () => undefined),
  engramindLog: { info: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/lib/crypto/secretBox', () => ({
  encryptSecret: (value: string) => `enc:${value}`,
  isEncryptedSecret: (value: unknown) => typeof value === 'string' && value.startsWith('enc:'),
  decryptSecret: (value: string) => value.slice(4),
}))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticCentral: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }))

import { MEMORY_IDENTITIES, MEMORY_TOKEN_SCOPES, isOpexMemoryAgent } from '@/features/ai/agents'
import { agentTokenFor, ensureAgentMemoryNetwork, resetMemoryNetworkForTests } from '@/features/engramind/server/memory-network'

const tokenOf = (agent: string) => [...holder.fake.state.tokens.values()].filter((item) => item.agent === agent)
const subscriptionsOf = (agent: string) => holder.fake.state.subscriptions.filter((item) => item.agent === `opex/${agent}`).map((item) => item.target)

beforeEach(() => {
  holder.fake = createFakeEngramind()
  holder.tokens = {}
  resetMemoryNetworkForTests()
})

describe('rede das memórias dos agentes', () => {
  it('cria cinco agentes; o Mentor assina só onde grava, sem canal próprio, com token read+write', async () => {
    const { step, summary } = await ensureAgentMemoryNetwork('local')
    expect(step.status).toBe('ok')
    expect([...holder.fake.state.agents.keys()].sort()).toEqual(MEMORY_IDENTITIES.map((id) => `opex/${id}`).sort())
    expect(summary.agentsCreated).toContain('mentor')
    expect(subscriptionsOf('mentor').sort()).toEqual(['agentes/adversario', 'agentes/desenvolvedor/*'])
    expect(subscriptionsOf('mentor')).not.toContain('opex')
    expect([...holder.fake.state.channels.keys()].some((slug) => slug.includes('mentor'))).toBe(false)
    expect(tokenOf('mentor')[0]!.scopes).toEqual(['read', 'write'])
    for (const consumer of ['opex', 'maddox', 'adversario', 'desenvolvedor']) expect(tokenOf(consumer)[0]!.scopes).toEqual(['read', 'write', 'delete'])
    expect(MEMORY_TOKEN_SCOPES.mentor).not.toContain('delete')
    expect(await agentTokenFor('mentor')).toMatch(/^eng\.tk_/)
  })

  it('repetir não cria nada de novo (idempotente)', async () => {
    await ensureAgentMemoryNetwork('local')
    const tokens = holder.fake.state.tokens.size
    const { step, summary } = await ensureAgentMemoryNetwork('local')
    expect(step.status).toBe('skipped')
    expect(summary.tokensIssued).toEqual([])
    expect(holder.fake.state.tokens.size).toBe(tokens)
  })

  it('token do Mentor com escopos diferentes é reemitido e o anterior revogado', async () => {
    await ensureAgentMemoryNetwork('local')
    const old = tokenOf('mentor')[0]!
    old.scopes = ['read', 'write', 'delete']
    const { summary } = await ensureAgentMemoryNetwork('local')
    expect(summary.tokensIssued).toEqual(['mentor'])
    expect(old.status).toBe('revoked')
    const current = tokenOf('mentor').find((item) => item.status === 'active')!
    expect(current.scopes).toEqual(['read', 'write'])
    expect(current.id).not.toBe(old.id)
  })

  it('a aba Identidades marca o agente opex/mentor como das Memórias do Opex', () => {
    expect(isOpexMemoryAgent('opex', 'mentor')).toBe(true)
    expect(isOpexMemoryAgent('opex', 'curador')).toBe(false)
  })

  it('sem token: o turno espera o provisionamento sob demanda só até o limite; ele termina em segundo plano', async () => {
    resetMemoryNetworkForTests({ lazyWaitMs: 20 })
    const original = holder.fake.engramindCall
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    holder.fake.engramindCall = (async (...args: Parameters<FakeEngramind['engramindCall']>) => {
      await gate
      return original(...args)
    }) as FakeEngramind['engramindCall']
    const started = Date.now()
    expect(await agentTokenFor('opex')).toBeNull()
    expect(Date.now() - started).toBeLessThan(1000)
    release()
    await vi.waitFor(() => expect(holder.tokens.opex).toBeTruthy())
    holder.fake.engramindCall = original
  })

  it('sem token e Engramind rápido: provisiona e devolve o token no mesmo turno', async () => {
    expect(await agentTokenFor('desenvolvedor')).toMatch(/^eng\.tk_/)
  })

  it('regressão do 405: rodar duas vezes seguidas conclui sem reemitir e nunca lê token por id', async () => {
    await ensureAgentMemoryNetwork('local')
    const tokens = holder.fake.state.tokens.size
    const { step } = await ensureAgentMemoryNetwork('local')
    expect(step).toMatchObject({ status: 'skipped' })
    expect(holder.fake.state.tokens.size).toBe(tokens)
    expect(holder.fake.state.calls.some((call) => call.method === 'GET' && /^\/v1\/tokens\/.+/.test(call.path))).toBe(false)
    expect(holder.fake.state.calls.filter((call) => call.method === 'GET' && call.path === '/v1/tokens').map((call) => call.query)).toContainEqual({ agent: 'opex/mentor', limit: 200 })
  })

  it('estado de antes do Mentor (quatro tokens gravados, sem opex/mentor): cria só o Mentor e não reemite os outros', async () => {
    await ensureAgentMemoryNetwork('local')
    holder.fake.state.agents.delete('opex/mentor')
    holder.fake.state.subscriptions = holder.fake.state.subscriptions.filter((item) => item.agent !== 'opex/mentor')
    for (const row of tokenOf('mentor')) holder.fake.state.tokens.delete(row.id)
    delete holder.tokens.mentor
    const before = new Map(['opex', 'maddox', 'adversario', 'desenvolvedor'].map((consumer) => [consumer, (holder.tokens[consumer] as { tokenId: string }).tokenId]))
    const { step, summary } = await ensureAgentMemoryNetwork('local')
    expect(step.status).toBe('ok')
    expect(summary.agentsCreated).toEqual(['mentor'])
    expect(summary.tokensIssued).toEqual(['mentor'])
    expect(subscriptionsOf('mentor').sort()).toEqual(['agentes/adversario', 'agentes/desenvolvedor/*'])
    expect(tokenOf('mentor')[0]!.scopes).toEqual(['read', 'write'])
    for (const [consumer, tokenId] of before) expect((holder.tokens[consumer] as { tokenId: string }).tokenId).toBe(tokenId)
  })

  it('token gravado que sumiu da lista é reemitido; revogado ou expirado também', async () => {
    await ensureAgentMemoryNetwork('local')
    const gone = (holder.tokens.opex as { tokenId: string }).tokenId
    holder.fake.state.tokens.delete(gone)
    tokenOf('maddox')[0]!.status = 'revoked'
    tokenOf('adversario')[0]!.status = 'expired'
    const { summary } = await ensureAgentMemoryNetwork('local')
    expect(summary.tokensIssued.sort()).toEqual(['adversario', 'maddox', 'opex'])
    expect((holder.tokens.opex as { tokenId: string }).tokenId).not.toBe(gone)
  })

  it('paginação: o token ativo na segunda página é achado e não reemite', async () => {
    await ensureAgentMemoryNetwork('local')
    const active = tokenOf('desenvolvedor')[0]!
    holder.fake.state.tokens.delete(active.id)
    for (let index = 0; index < 200; index++) holder.fake.state.tokens.set(`tk_old${index}`, { id: `tk_old${index}`, prefix: `eng.tk_old${index}`, status: 'revoked', agent: 'desenvolvedor', scopes: ['read', 'write', 'delete'] })
    holder.fake.state.tokens.set(active.id, active)
    const { summary } = await ensureAgentMemoryNetwork('local')
    expect(summary.tokensIssued).toEqual([])
    expect(holder.fake.state.calls.filter((call) => call.path === '/v1/tokens' && call.method === 'GET' && (call.query as { agent: string }).agent === 'opex/desenvolvedor').map((call) => (call.query as { cursor?: string }).cursor ?? null)).toEqual([null, '200'])
  })

  it('sob demanda: com os outros tokens gravados, o Mentor sem token provisiona e recebe o token no turno', async () => {
    await ensureAgentMemoryNetwork('local')
    for (const row of tokenOf('mentor')) holder.fake.state.tokens.delete(row.id)
    delete holder.tokens.mentor
    resetMemoryNetworkForTests()
    expect(await agentTokenFor('mentor')).toMatch(/^eng\.tk_/)
  })

  it('o fake recusa com 405 rota fora do contrato (não existe leitura de token por id)', async () => {
    await expect(holder.fake.engramindCall('GET', { path: '/v1/tokens/tk_x' })).rejects.toMatchObject({ status: 405, code: 'ENGRAMIND_METHOD_NOT_ALLOWED' })
  })
})
