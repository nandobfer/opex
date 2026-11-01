import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-109: consumo de memórias publicado em `private-app` (só ids) e o último uso registrado pelo Opex. */

const mocks = vi.hoisted(() => ({ publish: vi.fn(async () => undefined), bulkWrite: vi.fn(async () => undefined), warn: vi.fn(), info: vi.fn() }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/features/engramind/server/shared', () => ({ engramindLog: { info: mocks.info, warn: mocks.warn } }))
vi.mock('@/features/engramind/server/models', () => ({ engramindDb: async () => undefined }))
vi.mock('mongoose', async (original) => {
  const actual = await original<typeof import('mongoose')>()
  return { ...actual, models: {}, model: () => ({ bulkWrite: mocks.bulkWrite, find: () => ({ lean: async () => [{ _id: 'm_1', lastUsedAt: new Date('2026-11-01T10:00:00Z'), liveCount: 2 }] }) }) }
})

import { publishConsumption } from '@/features/engramind/server/consumption'
import { listMemoryUsage, recordMemoryUsage } from '@/features/engramind/server/memory-usage'

beforeEach(() => vi.clearAllMocks())

describe('publishConsumption', () => {
  it('grava o uso e publica engramind-consumption só com agente, tipo, slugs e ids (sem repetir)', async () => {
    await publishConsumption({ agent: 'opex/opex', kind: 'context', channels: ['opex', 'opex'], delivered: ['opex'], memoryIds: ['m_1', 'm_2', 'm_1'] })
    expect(mocks.bulkWrite).toHaveBeenCalledTimes(1)
    expect(mocks.publish).toHaveBeenCalledWith('engramind-consumption', { agent: 'opex/opex', kind: 'context', channels: ['opex'], delivered: ['opex'], memoryIds: ['m_1', 'm_2'] })
  })

  it('sem memórias entregues não grava nem publica (log informativo)', async () => {
    await publishConsumption({ agent: 'opex/opex', kind: 'search', channels: ['opex'], delivered: [], memoryIds: [] })
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.bulkWrite).not.toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalled()
  })

  it('falha ao gravar o uso ou ao publicar vira aviso no log e nunca lança', async () => {
    mocks.bulkWrite.mockRejectedValueOnce(new Error('mongo fora'))
    mocks.publish.mockRejectedValueOnce(new Error('pusher fora'))
    await expect(publishConsumption({ agent: 'opex/maddox', kind: 'context', channels: ['opex'], delivered: ['opex'], memoryIds: ['m_1'] })).resolves.toBeUndefined()
    expect(mocks.warn).toHaveBeenCalledTimes(2)
  })
})

describe('uso registrado pelo Opex', () => {
  it('recordMemoryUsage usa $max na data (fora de ordem não volta no tempo) e soma o contador', async () => {
    const at = new Date('2026-11-01T12:00:00Z')
    await recordMemoryUsage(['m_1', 'm_1', 'm_2'], at)
    const operations = (mocks.bulkWrite.mock.calls[0] as unknown as [{ updateOne: { filter: unknown; update: unknown; upsert: boolean } }[]])[0]
    expect(operations).toHaveLength(2)
    expect(operations[0]!.updateOne).toEqual({ filter: { _id: 'm_1' }, update: { $max: { lastUsedAt: at }, $inc: { liveCount: 1 } }, upsert: true })
  })

  it('listMemoryUsage devolve o mapa por id com datas ISO', async () => {
    expect(await listMemoryUsage()).toEqual({ m_1: { lastUsedAt: '2026-11-01T10:00:00.000Z', liveCount: 2 } })
  })
})
