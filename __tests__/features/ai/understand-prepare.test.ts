import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  availability: vi.fn(),
  getTask: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/Ai', () => ({ AiUsageLog: { create: vi.fn() } }))
vi.mock('@/lib/ai/stream', () => ({ streamAi: vi.fn() }))
vi.mock('@/features/ai/server/settings', () => ({ loadUnderstandTaskSettings: mocks.load, availabilityOf: mocks.availability }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask }))

import { DEFAULT_UNDERSTAND_TASK_SETTINGS } from '@/features/ai/schemas'
import { prepareUnderstandTask } from '@/features/ai/server/understand-task'

const task = (overrides: Record<string, unknown> = {}) => ({
  id: '0123456789abcdef01234567',
  code: 'OPX-7',
  columnId: 'todo',
  order: 0,
  title: 'Botão de exportar',
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: { id: 'p1', name: 'Portal', repo: 'sipal/portal', sigla: 'POR' },
  createdAt: null,
  updatedAt: null,
  description: 'Corpo',
  technicalSpec: null,
  comments: [],
  history: [],
  timeLogs: [],
  totalTimeLogged: 0,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockResolvedValue({ settings: { ...DEFAULT_UNDERSTAND_TASK_SETTINGS, enabled: true, provider: 'gemini', model: 'gemini-3-flash' } })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
})

describe('prepareUnderstandTask', () => {
  it('usa a tarefa local e monta a entrada com o código', async () => {
    mocks.getTask.mockResolvedValue(task())
    const prepared = await prepareUnderstandTask('0123456789abcdef01234567')
    expect(mocks.getTask).toHaveBeenCalledWith('0123456789abcdef01234567')
    expect(prepared).toMatchObject({ taskId: '0123456789abcdef01234567', title: 'Entender tarefa OPX-7' })
    expect(prepared.prompt).toContain('# Tarefa OPX-7')
  })

  it('feature indisponível nem busca a tarefa', async () => {
    mocks.availability.mockResolvedValue({ available: false, reason: 'desativada' })
    await expect(prepareUnderstandTask('0123456789abcdef01234567')).rejects.toMatchObject({ status: 409, message: 'desativada' })
    expect(mocks.getTask).not.toHaveBeenCalled()
  })
})
