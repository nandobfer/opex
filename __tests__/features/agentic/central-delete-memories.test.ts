import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-97: excluir uma central remove as memórias do agente desenvolvedor dela. */

const CENTRAL = 'c0000000000000000000000a'
const mocks = vi.hoisted(() => ({
  active: 0,
  recordAudit: vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined),
  deleteCentralMemories: vi.fn<(id: string) => Promise<number>>(async () => 2),
  centralDeleteOne: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(async () => undefined), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/db/models/Project', () => ({ Project: {} }))
vi.mock('@/lib/db/models/Agentic', () => ({
  AgenticCentral: { findById: () => ({ lean: async () => ({ _id: CENTRAL, projectName: 'opex', config: {} }) }), deleteOne: mocks.centralDeleteOne },
  AgenticWorkbench: { countDocuments: async () => mocks.active, find: () => ({ select: () => ({ lean: async () => [] }) }), deleteMany: async () => undefined },
  AgenticEvent: { deleteMany: async () => undefined },
}))
vi.mock('@/features/agentic/logic', () => ({ parseCentralConfig: () => ({}) }))
vi.mock('@/features/agentic/server/forks', () => ({ deleteCentralForks: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/files', () => ({ deleteWorkbenchFiles: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/settings', () => ({ assertAgentConfigs: vi.fn() }))
vi.mock('@/features/ai/server/agent-memory-service', () => ({ deleteCentralMemories: mocks.deleteCentralMemories }))

import { deleteCentral } from '@/features/agentic/server/centrals'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.active = 0
})

describe('excluir central', () => {
  it('remove as memórias da central e registra quantas saíram na auditoria', async () => {
    await deleteCentral(CENTRAL, 'local')
    expect(mocks.deleteCentralMemories).toHaveBeenCalledWith(CENTRAL)
    expect(mocks.centralDeleteOne).toHaveBeenCalled()
    expect(mocks.recordAudit.mock.calls[0]?.[0]).toMatchObject({ acao: 'EXCLUIR', antes: { produto: 'opex', memorias: 2 } })
  })

  it('com mesas em andamento recusa e não toca nas memórias', async () => {
    mocks.active = 1
    await expect(deleteCentral(CENTRAL, 'local')).rejects.toMatchObject({ status: 409 })
    expect(mocks.deleteCentralMemories).not.toHaveBeenCalled()
  })
})
