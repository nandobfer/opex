import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: { baseUrl: 'https://go.sipal.com.br', token: 'h.e30.s' as string | undefined, expiryWarningDays: 3 },
  recordAudit: vi.fn(),
  publish: vi.fn(),
  tasks: [{ id: 'a'.repeat(24), code: 'GO-DEV-7' }],
  snapshots: new Map<string, { signatures: Record<string, string> }>(),
}))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => mocks.config }))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({ info: vi.fn(), step: vi.fn(), request: vi.fn(), response: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', MOVER: 'MOVER' } }))
vi.mock('@/lib/pusher/channels', () => ({ appChannel: () => 'private-app', publishToChannels: mocks.publish }))
vi.mock('@/features/tasks/server/service', async (original) => ({
  ...(await original<typeof import('@/features/tasks/server/service')>()),
  fetchAllTasks: async () => mocks.tasks,
}))
vi.mock('@/lib/db/models/GoSipalTaskSnapshot', () => ({
  GoSipalTaskSnapshot: {
    findOne: ({ key }: { key: string }) => ({ lean: async () => mocks.snapshots.get(key) ?? null }),
    updateOne: async ({ key }: { key: string }, update: { $set: { signatures: Record<string, string> } }) => {
      mocks.snapshots.set(key, { signatures: update.$set.signatures })
    },
  },
}))

import { deleteTimeLog, listActiveTimers, listTimeLogs, resetTaskCodesCache, startTimer, stopTimer, toTimeLogDto, updateTimeLog } from '@/features/time/server/service'
import { syncGoSipalTasks } from '@/features/tasks/server/sync'

const TASK = 'a'.repeat(24)
const LOG = 'c'.repeat(24)
const raw = (overrides: Record<string, unknown> = {}) => ({
  _id: LOG,
  task: { _id: TASK, title: 'Ajustar login', product: { _id: 'p1', name: 'GO' } },
  startTime: '2026-10-08T12:00:00.000Z',
  isActive: true,
  ...overrides,
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.config.token = 'h.e30.s'
  mocks.snapshots.clear()
  resetTaskCodesCache()
  vi.stubGlobal('fetch', fetchMock)
})

describe('normalização', () => {
  it('toTimeLogDto: tarefa populada, código pelo quadro, duração e ativo', () => {
    expect(toTimeLogDto(raw({ isActive: false, endTime: '2026-10-08T13:30:00.000Z', duration: 90, description: 'Feito' }), new Map([[TASK, 'GO-DEV-7']]))).toEqual({
      id: LOG,
      taskId: TASK,
      taskCode: 'GO-DEV-7',
      taskTitle: 'Ajustar login',
      productName: 'GO',
      startTime: '2026-10-08T12:00:00.000Z',
      endTime: '2026-10-08T13:30:00.000Z',
      duration: 90,
      description: 'Feito',
      active: false,
    })
    expect(toTimeLogDto({ _id: LOG })).toBeNull()
    expect(toTimeLogDto(raw({ task: null }))).toMatchObject({ taskId: null, taskTitle: null })
  })
})

describe('timers no Go! Sipal', () => {
  it('iniciar: POST com a tarefa, auditoria e aviso; nada salvo aqui', async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: raw() }, 201))
    const log = await startTimer({ taskId: TASK }, 'local')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://go.sipal.com.br/api/dev-center/time-logs')
    expect(JSON.parse(init.body)).toEqual({ taskId: TASK, elementType: 'devTask' })
    expect(log).toMatchObject({ taskCode: 'GO-DEV-7', active: true })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'ApontamentoGoSipal', acao: 'CRIAR' }))
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'time-updated', { taskIds: [TASK] })
  })

  it('iniciar recusado (já existe timer): 400 com a mensagem da plataforma', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Já existe um timer ativo para este item' }, 400))
    await expect(startTimer({ taskId: TASK }, 'local')).rejects.toMatchObject({ status: 400, message: 'Já existe um timer ativo para este item' })
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })

  it('parar: PUT stop=true com início/fim/descrição ajustados', async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: raw({ isActive: false, endTime: '2026-10-08T13:00:00.000Z', duration: 60 }) }))
    const log = await stopTimer(LOG, { description: 'Revisão', startTime: '2026-10-08T12:00:00.000Z', endTime: '2026-10-08T13:00:00.000Z' }, 'local')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://go.sipal.com.br/api/dev-center/time-logs/${LOG}`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ stop: true, description: 'Revisão', startTime: '2026-10-08T12:00:00.000Z', endTime: '2026-10-08T13:00:00.000Z' })
    expect(log.duration).toBe(60)
    await expect(stopTimer('pending-x', {}, 'local')).rejects.toMatchObject({ status: 404 })
  })

  it('ativos: lista só os ativos com código', async () => {
    fetchMock.mockImplementation(async (url: string) => (url.endsWith('/active') ? json({ success: true, data: [raw(), raw({ _id: 'd'.repeat(24), isActive: false })] }) : json({})))
    const active = await listActiveTimers()
    expect(active).toHaveLength(1)
    expect(active[0]!.taskCode).toBe('GO-DEV-7')
  })

  it('meus apontamentos: período e página na query; totais da plataforma', async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: [raw({ isActive: false, duration: 30 })], pagination: { page: 2, totalPages: 3, total: 250 }, summary: { totalMinutes: 4000 } }))
    const page = await listTimeLogs({ from: '2026-10-01T03:00:00.000Z', to: '2026-10-09T02:59:59.999Z', page: 2 })
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.pathname).toBe('/api/dev-center/time-logs')
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '100', page: '2', startDate: '2026-10-01T03:00:00.000Z', endDate: '2026-10-09T02:59:59.999Z' })
    expect(page).toMatchObject({ page: 2, totalPages: 3, total: 250, totalMinutes: 4000 })
  })

  it('editar período (com justificativa) e excluir (com justificativa)', async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: raw({ isActive: false }) }))
    await updateTimeLog(LOG, { kind: 'period', startTime: '2026-10-08T12:00:00.000Z', endTime: '2026-10-08T12:30:00.000Z', justification: 'Esqueci de parar' }, 'local')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ startTime: '2026-10-08T12:00:00.000Z', endTime: '2026-10-08T12:30:00.000Z', justification: 'Esqueci de parar' })
    await updateTimeLog(LOG, { kind: 'description', description: 'Nova' }, 'local')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ description: 'Nova' })
    fetchMock.mockResolvedValue(json({ success: true }))
    await deleteTimeLog(LOG, 'Duplicado', 'local')
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE')
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ justification: 'Duplicado' })
    expect(mocks.recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ acao: 'EXCLUIR' }))
  })
})

describe('sincronização de timers', () => {
  it('timer iniciado/parado direto no go.sipal avisa a tela (time-updated)', async () => {
    let active: unknown[] = []
    fetchMock.mockImplementation(async (url: string) => (url.endsWith('/active') ? json({ data: active }) : json({ data: [] })))
    await syncGoSipalTasks()
    expect(mocks.publish).not.toHaveBeenCalled()

    active = [raw()]
    await syncGoSipalTasks()
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'time-updated', { taskIds: [TASK] })

    mocks.publish.mockClear()
    await syncGoSipalTasks()
    expect(mocks.publish).not.toHaveBeenCalled()

    active = []
    await syncGoSipalTasks()
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'time-updated', { taskIds: [TASK] })
  })
})
