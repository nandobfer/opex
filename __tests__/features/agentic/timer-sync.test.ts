import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  begin: vi.fn(async () => ({})),
  end: vi.fn(async () => null),
  endById: vi.fn(async () => undefined),
  touch: vi.fn(async () => undefined),
  listActive: vi.fn(async () => [] as { id: string; taskId: string; workbenchId: string | null }[]),
  doc: null as Record<string, unknown> | null,
  active: new Set<string>(),
}))

vi.mock('@/features/time/server/service', () => ({
  beginWorkPeriod: mocks.begin,
  endWorkPeriod: mocks.end,
  endWorkPeriodById: mocks.endById,
  touchWorkPeriod: mocks.touch,
  listActiveWorkPeriods: mocks.listActive,
}))
vi.mock('@/lib/db/models/Agentic', () => ({
  AgenticWorkbench: {
    findById: () => {
      const chain = { select: () => chain, lean: async () => mocks.doc }
      return chain
    },
  },
}))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn(), step: vi.fn() }) }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: async () => ({ settings: (await import('@/features/agentic/schemas')).DEFAULT_AGENTIC_SETTINGS }) }))
vi.mock('@/features/agentic/server/centrals', () => ({ loadCentral: async () => ({ config: (await import('@/features/agentic/schemas')).defaultCentralConfig('/x') }) }))
vi.mock('@/features/agentic/server/hub', () => ({ isWorkbenchActive: (id: string) => mocks.active.has(id) }))

import { closeOrphanWorkPeriods, syncWorkbenchTimer } from '@/features/agentic/server/timer-sync'

const workbench = (overrides: Record<string, unknown> = {}) => ({
  _id: 'wb-1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'OPX-1',
  stage: 'implementing',
  runState: 'running',
  pendingPermissions: [],
  pendingForms: [],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.doc = null
  mocks.active.clear()
  mocks.listActive.mockResolvedValue([])
})

describe('syncWorkbenchTimer', () => {
  it('agente trabalhando: abre o período com etapa/agente/modelo', async () => {
    mocks.doc = workbench()
    mocks.active.add('wb-1')
    await syncWorkbenchTimer('wb-1')
    expect(mocks.begin).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't1', workbenchId: 'wb-1', stage: 'implementing', agent: 'build' }),
      'local',
    )
    expect(mocks.touch).toHaveBeenCalledWith('wb-1', expect.objectContaining({ stage: 'implementing', agent: 'build' }))
    expect(mocks.end).not.toHaveBeenCalled()
  })

  it('esperando o usuário: fecha o período (pausa)', async () => {
    mocks.doc = workbench({ runState: 'idle', stage: 'plan_review' })
    await syncWorkbenchTimer('wb-1')
    expect(mocks.end).toHaveBeenCalledWith('wb-1', 'local', expect.anything())
    expect(mocks.begin).not.toHaveBeenCalled()
  })

  it('permissão/pergunta pendente durante o turno também pausa', async () => {
    mocks.doc = workbench({ pendingPermissions: [{ id: 'p1' }] })
    mocks.active.add('wb-1')
    await syncWorkbenchTimer('wb-1')
    expect(mocks.end).toHaveBeenCalled()
    expect(mocks.begin).not.toHaveBeenCalled()
  })

  it('mesa "running" sem turno vivo (app reiniciou): fecha', async () => {
    mocks.doc = workbench()
    await syncWorkbenchTimer('wb-1')
    expect(mocks.end).toHaveBeenCalled()
    expect(mocks.begin).not.toHaveBeenCalled()
  })

  it('mesa concluída fecha com a descrição de conclusão', async () => {
    mocks.doc = workbench({ runState: 'idle', stage: 'done' })
    await syncWorkbenchTimer('wb-1')
    expect(mocks.end).toHaveBeenCalledWith('wb-1', 'local', { description: 'Desenvolvimento agêntico · Concluída' })
  })
})

describe('closeOrphanWorkPeriods', () => {
  it('encerra períodos sem mesa e de mesas que não estão executando', async () => {
    mocks.listActive.mockResolvedValue([
      { id: 'log-legacy', taskId: 't0', workbenchId: null },
      { id: 'log-idle', taskId: 't1', workbenchId: 'wb-idle' },
    ])
    mocks.doc = workbench({ runState: 'idle' })
    const closed = await closeOrphanWorkPeriods()
    expect(closed).toBe(2)
    expect(mocks.endById).toHaveBeenCalledWith('log-legacy', 'local', expect.stringContaining('timer antigo'))
    expect(mocks.endById).toHaveBeenCalledWith('log-idle', 'local', expect.stringContaining('execução perdida'))
  })

  it('mantém o período de uma mesa realmente ativa', async () => {
    mocks.listActive.mockResolvedValue([{ id: 'log-live', taskId: 't1', workbenchId: 'wb-1' }])
    mocks.doc = workbench()
    mocks.active.add('wb-1')
    const closed = await closeOrphanWorkPeriods()
    expect(closed).toBe(0)
    expect(mocks.endById).not.toHaveBeenCalled()
  })
})
