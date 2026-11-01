import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-97/OPE-104: excluir uma central arquiva o canal de memórias do agente desenvolvedor dela (Engramind). */

const CENTRAL = 'c0000000000000000000000a'
const mocks = vi.hoisted(() => ({
  active: 0,
  recordAudit: vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined),
  archiveCentralMemories: vi.fn<(id: string) => Promise<boolean>>(async () => true),
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
vi.mock('@/features/ai/server/agent-memory-service', () => ({ archiveCentralMemories: mocks.archiveCentralMemories }))

import { deleteCentral } from '@/features/agentic/server/centrals'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.active = 0
})

describe('excluir central', () => {
  it('arquiva o canal de memórias da central e registra na auditoria', async () => {
    await deleteCentral(CENTRAL, 'local')
    expect(mocks.archiveCentralMemories).toHaveBeenCalledWith(CENTRAL)
    expect(mocks.centralDeleteOne).toHaveBeenCalled()
    expect(mocks.recordAudit.mock.calls[0]?.[0]).toMatchObject({ acao: 'EXCLUIR', antes: { produto: 'opex' }, depois: { canalMemoriasArquivado: true } })
  })

  it('Engramind fora do ar: a central é excluída mesmo assim (canal não arquivado)', async () => {
    mocks.archiveCentralMemories.mockResolvedValueOnce(false)
    await deleteCentral(CENTRAL, 'local')
    expect(mocks.centralDeleteOne).toHaveBeenCalled()
    expect(mocks.recordAudit.mock.calls[0]?.[0]).toMatchObject({ depois: { canalMemoriasArquivado: false } })
  })

  it('com mesas em andamento recusa e não toca nas memórias', async () => {
    mocks.active = 1
    await expect(deleteCentral(CENTRAL, 'local')).rejects.toMatchObject({ status: 409 })
    expect(mocks.archiveCentralMemories).not.toHaveBeenCalled()
  })
})
