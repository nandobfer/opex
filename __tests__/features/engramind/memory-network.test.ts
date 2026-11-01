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
import { agentTokenFor, ensureAgentMemoryNetwork } from '@/features/engramind/server/memory-network'

const tokenOf = (agent: string) => [...holder.fake.state.tokens.values()].filter((item) => item.agent === agent)
const subscriptionsOf = (agent: string) => holder.fake.state.subscriptions.filter((item) => item.agent === `opex/${agent}`).map((item) => item.target)

beforeEach(() => {
  holder.fake = createFakeEngramind()
  holder.tokens = {}
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
})
