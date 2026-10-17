import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), warn: vi.fn() }))

vi.mock('@/lib/db/models/DevTask', () => ({ DevTask: { updateMany: mocks.updateMany } }))
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }))

import { backfillTaskAgenticFlow } from '@/lib/db/migrations/backfill-task-agentic-flow'

beforeEach(() => vi.clearAllMocks())

describe('migração do fluxo da mesa das tarefas (OPE-79)', () => {
  it('preserva o fluxo antigo gravando "preview" só em quem não tem o campo', async () => {
    mocks.updateMany.mockResolvedValue({ modifiedCount: 4 })

    await backfillTaskAgenticFlow()

    // O filtro por campo AUSENTE não alcança as tarefas novas (`agenticFlow: null` = herda a central).
    expect(mocks.updateMany).toHaveBeenCalledWith({ agenticFlow: { $exists: false } }, { $set: { agenticFlow: 'preview' } })
    expect(mocks.warn).toHaveBeenCalledWith({ updated: 4 }, expect.stringContaining('fluxo da mesa'))
  })

  it('é idempotente: sem tarefas para migrar não registra aviso', async () => {
    mocks.updateMany.mockResolvedValue({ modifiedCount: 0 })

    await backfillTaskAgenticFlow()

    expect(mocks.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.warn).not.toHaveBeenCalled()
  })
})
