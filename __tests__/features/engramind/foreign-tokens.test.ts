import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Migração A (OPE-206): tokens gravados no banco desta instância que pertencem a outro app são revogados SÓ pelo id
 * gravado; a instância cujos tokens já são do próprio app não escreve nada.
 */

const holder = vi.hoisted(() => ({
  app: 'alfredopex',
  state: {} as { agentTokens?: Record<string, { tokenId: string }>; appToken?: { tokenId: string } | null },
  routines: [] as { _id: string; engramindToken: { tokenId: string } | null }[],
  tokens: [] as { id: string; app: { id: string; slug: string } }[],
  calls: [] as { method: string; path: string }[],
  writes: [] as string[],
  integration: [] as unknown[],
}))

vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: vi.fn(async (method: string, request: { path: string }) => {
    holder.calls.push({ method, path: request.path })
    if (method === 'GET' && request.path === '/v1/tokens') return { tokens: holder.tokens, next_cursor: null }
    if (method === 'POST' && /\/revoke$/.test(request.path)) return {}
    throw new Error(`inesperado ${method} ${request.path}`)
  }),
}))
vi.mock('@/features/engramind/server/instance', () => ({ instanceApp: async () => holder.app, resetInstanceCache: vi.fn() }))
vi.mock('@/features/engramind/server/models', () => {
  const collection = (name: string) => ({ deleteMany: vi.fn(async () => holder.writes.push(`${name}.deleteMany`)) })
  return {
    ENGRAMIND_STATE_ID: 'engramind',
    engramindDb: async () => undefined,
    EngramindState: {
      findById: () => ({ select: () => ({ lean: async () => holder.state }) }),
      updateOne: vi.fn(async (_filter: unknown, update: unknown) => holder.writes.push(`state:${JSON.stringify(update)}`)),
    },
    EngramindContextCache: collection('context'),
    EngramindDelivery: collection('deliveries'),
    EngramindRelatedMemory: collection('related'),
  }
})
vi.mock('@/lib/db/models/RoutineAgent', () => ({
  RoutineAgent: {
    find: () => ({ select: () => ({ lean: async () => holder.routines }) }),
    updateOne: vi.fn(async (filter: { _id: string }) => holder.writes.push(`routine:${filter._id}`)),
  },
}))
vi.mock('@/features/integrations/services/integration-service', () => ({ updateIntegration: vi.fn(async (...args: unknown[]) => holder.integration.push(args)) }))
vi.mock('@/features/engramind/server/shared', () => ({ AcaoAuditoria: { EXECUTAR: 'EXECUTAR' }, auditEngramind: vi.fn(async () => undefined), engramindLog: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/features/routine-agents/server/provisioning', () => ({ startProvisioning: vi.fn(async () => undefined) }))

import { auditEngramind } from '@/features/engramind/server/shared'
import { foreignTokensOf, migrateForeignTokens } from '@/features/engramind/server/foreign-tokens'
import { startProvisioning } from '@/features/routine-agents/server/provisioning'

const target = { baseUrl: 'http://engramind', token: 'admin' }
const opex = { id: 'app_19b5e9ea', slug: 'opex' }
const alfredopex = { id: 'app_alf', slug: 'alfredopex' }

beforeEach(() => {
  holder.app = 'alfredopex'
  holder.state = {}
  holder.routines = []
  holder.tokens = []
  holder.calls = []
  holder.writes = []
  holder.integration = []
  vi.mocked(auditEngramind).mockClear()
  vi.mocked(startProvisioning).mockClear()
})

describe('migração A (tokens de outro app)', () => {
  it('revoga só os ids gravados aqui que são do app opex e apaga os registros', async () => {
    holder.state = { agentTokens: { opex: { tokenId: 'tk_88610e55' }, maddox: { tokenId: 'tk_f4c20ff4' } }, appToken: { tokenId: 'tk_ab6f0ff9' } }
    holder.routines = [{ _id: 'r1', engramindToken: { tokenId: 'tk_r1' } }]
    // Tokens do dono (de outro banco) também estão na lista do Engramind: nunca são tocados.
    holder.tokens = [
      { id: 'tk_88610e55', app: opex },
      { id: 'tk_f4c20ff4', app: opex },
      { id: 'tk_ab6f0ff9', app: opex },
      { id: 'tk_r1', app: opex },
      { id: 'tk_00af373a', app: opex },
      { id: 'tk_8bc2c0ce', app: opex },
    ]
    const result = await migrateForeignTokens('local', target)
    expect(result.revoked.sort()).toEqual(['tk_88610e55', 'tk_ab6f0ff9', 'tk_f4c20ff4', 'tk_r1'])
    const revoked = holder.calls.filter((call) => call.path.endsWith('/revoke')).map((call) => call.path)
    expect(revoked).not.toContain('/v1/tokens/tk_00af373a/revoke')
    expect(revoked).not.toContain('/v1/tokens/tk_8bc2c0ce/revoke')
    expect(holder.calls.some((call) => call.method === 'POST' && !call.path.endsWith('/revoke'))).toBe(false)
    expect(holder.writes).toContain('routine:r1')
    expect(holder.writes.some((write) => write.includes('agentTokens.opex'))).toBe(true)
    expect(holder.writes).toEqual(expect.arrayContaining(['context.deleteMany', 'deliveries.deleteMany', 'related.deleteMany']))
    expect(holder.integration).toHaveLength(1)
    const audit = JSON.stringify(vi.mocked(auditEngramind).mock.calls)
    expect(audit).toContain('tk_88610e55')
    expect(audit).not.toMatch(/eng\.tk_/)
    await result.afterProvision()
    expect(startProvisioning).toHaveBeenCalledWith('r1', 'retry', 'local')
  })

  it('instância do dono (tokens do próprio app): nenhuma escrita', async () => {
    holder.app = 'opex'
    holder.state = { agentTokens: { opex: { tokenId: 'tk_00af373a' } }, appToken: { tokenId: 'tk_8bc2c0ce' } }
    holder.tokens = [
      { id: 'tk_00af373a', app: opex },
      { id: 'tk_8bc2c0ce', app: opex },
    ]
    const result = await migrateForeignTokens('local', target)
    expect(result.revoked).toEqual([])
    expect(holder.calls.every((call) => call.method === 'GET')).toBe(true)
    expect(holder.writes).toEqual([])
    expect(holder.integration).toEqual([])
    expect(auditEngramind).not.toHaveBeenCalled()
  })

  it('sem nada gravado não chama o Engramind', async () => {
    expect((await migrateForeignTokens('local', target)).revoked).toEqual([])
    expect(holder.calls).toEqual([])
  })

  it('foreignTokensOf: token fora da lista fica para o provisionamento reemitir', () => {
    const stored = [
      { kind: 'agent' as const, tokenId: 'tk_a', owner: 'opex' },
      { kind: 'agent' as const, tokenId: 'tk_b', owner: 'maddox' },
      { kind: 'app' as const, tokenId: 'tk_c', owner: 'app' },
    ]
    const tokens = new Map([
      ['tk_a', { app: opex }],
      ['tk_c', { app: alfredopex }],
    ])
    expect(foreignTokensOf(stored, tokens, 'alfredopex').map((item) => item.tokenId)).toEqual(['tk_a'])
  })
})
