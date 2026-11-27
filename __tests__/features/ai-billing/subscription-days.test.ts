import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-203: uso total diário das assinaturas (base do rateio). Chaves da mesma assinatura (Go: mesmo ciclo e limites;
 * Command Code: mesma conta) viram um grupo só, gravado por dia (idempotente) — a mensalidade conta uma vez.
 */

const mocks = vi.hoisted(() => ({
  status: new Map<string, unknown>(),
  costByDay: vi.fn(),
  whoami: new Map<string, unknown>(),
  ccDays: vi.fn(),
  docs: new Map<string, Record<string, unknown>>(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(async () => undefined) }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ warn: vi.fn(), info: vi.fn() }) }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/ai/api-keys', () => ({ getAiProviderKeyById: vi.fn() }))
vi.mock('@/lib/integrations/store', () => ({ loadStoredIntegration: vi.fn() }))
vi.mock('@/features/opencode-quota/server/go-api', () => ({ fetchGoStatus: async (apiKey: string) => mocks.status.get(apiKey), fetchGoCostByDay: mocks.costByDay }))
vi.mock('@/features/command-code-usage/server/api', () => ({
  fetchCcWhoami: async (apiKey: string) => mocks.whoami.get(apiKey),
  fetchCcSubscription: async () => ({ currentPeriodStart: '2026-11-20T00:00:00.000Z' }),
}))
vi.mock('@/features/command-code-usage/server/series', () => ({ loadCcDays: mocks.ccDays }))
vi.mock('@/lib/db/models/AiSubscriptionDay', () => ({
  AiSubscriptionDay: {
    bulkWrite: async (ops: { updateOne: { filter: { provider: string; account: string; date: string }; update: { $set: Record<string, unknown> } } }[]) => {
      let upserted = 0
      let modified = 0
      for (const op of ops) {
        const id = `${op.updateOne.filter.account}|${op.updateOne.filter.date}`
        const before = JSON.stringify(mocks.docs.get(id)?.total ?? null)
        if (!mocks.docs.has(id)) upserted++
        else if (before !== JSON.stringify(op.updateOne.update.$set.total)) modified++
        mocks.docs.set(id, { ...op.updateOne.filter, ...op.updateOne.update.$set })
      }
      return { upsertedCount: upserted, modifiedCount: modified }
    },
  },
}))

import { readCommandCodeSubscriptionDays, readGoSubscriptionDays, saveSubscriptionDays } from '@/features/ai-billing/server/subscription-days'

const meter = (limit: number, used: number) => ({ limitMicroCents: limit, usedMicroCents: used, resetsAt: null })
const goStatus = (used: number, startsAt = '2026-11-05T00:00:00Z') => ({ product: 'go', access: { startsAt, endsAt: '2026-12-05T00:00:00Z', meters: { fiveHour: meter(1, used), week: meter(2, used), month: meter(3, used) } } })
const key = (id: string) => ({ id, name: id, apiKey: `sk-${id}` })
const NOW = Date.parse('2026-11-26T12:00:00Z')

beforeEach(() => {
  mocks.status.clear()
  mocks.whoami.clear()
  mocks.docs.clear()
  mocks.costByDay.mockReset()
  mocks.ccDays.mockReset()
})

describe('OpenCode Go', () => {
  it('chaves com o mesmo ciclo e limites (consumo diferente) são uma assinatura; custo por dia em US$', async () => {
    mocks.status.set('sk-a', goStatus(10))
    mocks.status.set('sk-b', goStatus(99))
    mocks.status.set('sk-c', goStatus(1, '2026-11-10T00:00:00Z'))
    mocks.costByDay.mockResolvedValue(new Map([['2026-11-25', 150_000_000]]))
    const reads = await readGoSubscriptionDays([key('a'), key('b'), key('c')], NOW)
    expect(reads.map((read) => read.keyIds)).toEqual([['a', 'b'], ['c']])
    expect(reads[0]!.account).not.toBe(reads[1]!.account)
    const day = reads[0]!.days.find((item) => item.date === '2026-11-25')!
    expect(day).toEqual({ date: '2026-11-25', total: 1.5, partial: false })
    // Dia sem custo no Console = sem uso (0), não desconhecido; hoje fica parcial.
    expect(reads[0]!.days.find((item) => item.date === '2026-11-24')!.total).toBe(0)
    expect(reads[0]!.days.at(-1)).toMatchObject({ date: '2026-11-26', partial: true })
  })

  it('gravar de novo os mesmos dias não duplica nem muda nada', async () => {
    mocks.status.set('sk-a', goStatus(10))
    mocks.costByDay.mockResolvedValue(new Map([['2026-11-25', 150_000_000]]))
    const reads = await readGoSubscriptionDays([key('a')], NOW)
    const first = await saveSubscriptionDays('opencode-go', reads)
    expect(first).toBeGreaterThan(0)
    expect(await saveSubscriptionDays('opencode-go', reads)).toBe(0)
  })
})

describe('Command Code', () => {
  it('chaves da mesma conta são uma assinatura; créditos do pool por dia do ciclo', async () => {
    mocks.whoami.set('sk-a', { org: { id: 'org1' } })
    mocks.whoami.set('sk-b', { org: { id: 'org1' } })
    mocks.ccDays.mockResolvedValue(new Map([['2026-11-25', { credits: 2.5, partial: false }], ['2026-11-24', { credits: null, partial: false }]]))
    const reads = await readCommandCodeSubscriptionDays([key('a'), key('b')], NOW)
    expect(reads).toHaveLength(1)
    expect(reads[0]).toMatchObject({ keyIds: ['a', 'b'], unit: 'credits', days: [{ date: '2026-11-25', total: 2.5, partial: false }] })
  })
})
