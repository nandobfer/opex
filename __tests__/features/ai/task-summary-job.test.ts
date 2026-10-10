import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  availability: vi.fn(),
  concluded: vi.fn(),
  find: vi.fn(),
  findById: vi.fn(),
  updateOne: vi.fn(),
  publish: vi.fn(),
  getTask: vi.fn(),
  stream: vi.fn(),
  docs: [] as Array<Record<string, unknown>>,
  savedSummary: 'Resumo salvo',
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/Ai', () => ({ AiUsageLog: { create: vi.fn() } }))
vi.mock('@/lib/db/models/DevTask', () => ({ DevTask: { find: mocks.find, findById: mocks.findById, updateOne: mocks.updateOne } }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({ step: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(), warn: vi.fn(), request: vi.fn(), response: vi.fn() }) }))
vi.mock('@/lib/ai/stream', () => ({ streamAi: mocks.stream }))
vi.mock('@/features/ai/server/settings', () => ({ loadTaskSummarySettings: mocks.loadSettings, availabilityOfTaskSummary: mocks.availability }))
vi.mock('@/features/tasks/server/service', () => ({ concludedColumnKeys: mocks.concluded, getTask: mocks.getTask, publishTasksUpdated: mocks.publish }))

import { DEFAULT_TASK_SUMMARY_SETTINGS, type TaskSummarySettings } from '@/features/ai/schemas'
import { taskSummarySourceHash } from '@/features/ai/task-summary'
import { runTaskSummaryBackfill } from '@/features/ai/server/task-summary'
import type { TaskDetailDto } from '@/features/tasks/types'

const settings = (overrides: Partial<TaskSummarySettings> = {}): TaskSummarySettings => ({ ...DEFAULT_TASK_SUMMARY_SETTINGS, enabled: true, provider: 'gemini', model: 'gemini-3-flash', ...overrides })

const taskDetail = (overrides: Partial<TaskDetailDto> = {}): TaskDetailDto => ({
  id: '0123456789abcdef01234567',
  code: 'OPX-1',
  columnId: 'todo',
  order: 0,
  title: 'Título A',
  summary: null,
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: null,
  createdAt: null,
  updatedAt: null,
  description: 'Corpo A',
  technicalSpec: null,
  comments: [],
  history: [],
  timeLogs: [],
  totalTimeLogged: 0,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadSettings.mockResolvedValue({ settings: settings(), isDefault: false, updatedAt: new Date() })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.concluded.mockResolvedValue(['done'])
  mocks.docs = []
  mocks.find.mockImplementation(() => ({ select: () => ({ lean: async () => mocks.docs }) }))
  mocks.findById.mockImplementation(() => ({ select: () => ({ lean: async () => ({ summary: mocks.savedSummary }) }) }))
  mocks.getTask.mockImplementation(async (id: string) => taskDetail({ id }))
  mocks.stream.mockImplementation(async function* () {
    yield { type: 'delta', text: 'Resumo salvo' }
    yield { type: 'done', finishReason: 'stop', durationMs: 5, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: null } }
  })
})

describe('runTaskSummaryBackfill', () => {
  it('com a feature indisponível, não varre nada', async () => {
    mocks.availability.mockResolvedValue({ available: false, reason: 'desativada' })
    expect(await runTaskSummaryBackfill()).toContain('Pulada')
    expect(mocks.find).not.toHaveBeenCalled()
  })

  it('varre só as não arquivadas fora das colunas de conclusão e sem resumo atualizado', async () => {
    const current = { title: 'Título B', description: 'Corpo B' }
    mocks.docs = [
      { _id: 'a', code: 'OPX-1', title: 'Título A', description: 'Corpo A', summary: null, summarySourceHash: null },
      { _id: 'b', code: 'OPX-2', title: current.title, description: current.description, summary: 'Já resumido', summarySourceHash: taskSummarySourceHash(current) },
    ]

    expect(await runTaskSummaryBackfill()).toContain('1 resumo(s) gerado(s)')
    expect(mocks.find).toHaveBeenCalledWith({ archived: { $ne: true }, columnId: { $nin: ['done'] } })
    expect(mocks.getTask).toHaveBeenCalledTimes(1)
    expect(mocks.getTask).toHaveBeenCalledWith('a')
    expect(mocks.updateOne).toHaveBeenCalledWith({ _id: 'a' }, expect.objectContaining({ $set: expect.objectContaining({ summary: 'Resumo salvo' }) }))
    expect(mocks.publish).toHaveBeenCalledWith(['a'])
  })

  it('nada pendente devolve o aviso sem gerar', async () => {
    const current = { title: 'Título B', description: 'Corpo B' }
    mocks.docs = [{ _id: 'b', code: 'OPX-2', title: current.title, description: current.description, summary: 'Já resumido', summarySourceHash: taskSummarySourceHash(current) }]

    expect(await runTaskSummaryBackfill()).toBe('Nenhum resumo pendente')
    expect(mocks.getTask).not.toHaveBeenCalled()
  })
})
