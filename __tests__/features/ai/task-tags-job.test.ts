import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  availability: vi.fn(),
  concluded: vi.fn(),
  find: vi.fn(),
  updateOne: vi.fn(),
  publish: vi.fn(),
  getTask: vi.fn(),
  stream: vi.fn(),
  jev: vi.fn(),
  docs: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/Ai', () => ({ AiUsageLog: { create: vi.fn() } }))
vi.mock('@/lib/db/models/DevTask', () => ({ DevTask: { find: mocks.find, updateOne: mocks.updateOne } }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({ step: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(), warn: vi.fn(), request: vi.fn(), response: vi.fn() }) }))
vi.mock('@/lib/ai/stream', () => ({ streamAi: mocks.stream }))
vi.mock('@/lib/ai/jev', () => ({ askJevSystemOne: mocks.jev }))
vi.mock('@/features/ai/server/settings', () => ({ loadTaskTagsSettings: mocks.loadSettings, availabilityOfTaskTags: mocks.availability }))
vi.mock('@/features/tasks/server/service', () => ({ concludedColumnKeys: mocks.concluded, getTask: mocks.getTask, publishTasksUpdated: mocks.publish }))

import { DEFAULT_TASK_TAGS_SETTINGS, type TaskTagsSettings } from '@/features/ai/schemas'
import { taskTagsSourceHash } from '@/features/ai/task-tags'
import { generateTaskTags, runTaskTagsBackfill } from '@/features/ai/server/task-tags'

const settings = (overrides: Partial<TaskTagsSettings> = {}): TaskTagsSettings => ({ ...DEFAULT_TASK_TAGS_SETTINGS, enabled: true, provider: 'gemini', model: 'gemini-3-flash', ...overrides })

const task = (overrides: Record<string, unknown> = {}) => ({ id: 'a', code: 'OPX-1', title: 'Ajustar rodapé', description: 'Corpo', taskType: 'bugfix', project: null, summary: null, ...overrides })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadSettings.mockResolvedValue({ settings: settings(), isDefault: false, updatedAt: new Date() })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.concluded.mockResolvedValue(['done'])
  mocks.docs = []
  mocks.find.mockImplementation(() => ({ select: () => ({ lean: async () => mocks.docs }) }))
  mocks.getTask.mockImplementation(async (id: string) => task({ id }))
  mocks.stream.mockImplementation(async function* () {
    yield { type: 'delta', text: '{"tags":["api"]}' }
    yield { type: 'done', finishReason: 'stop', durationMs: 5, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: null } }
  })
})

describe('generateTaskTags', () => {
  it('gera pelo provedor de texto e grava as tags com o hash da fonte', async () => {
    const tags = await generateTaskTags('a')
    expect(tags).toEqual(['api'])
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: 'a' },
      expect.objectContaining({ $set: expect.objectContaining({ tags: ['api'], tagsSourceHash: expect.any(String), tagsUpdatedAt: expect.any(Date) }) }),
      { timestamps: false },
    )
    expect(mocks.publish).toHaveBeenCalledWith(['a'])
  })

  it('gera pelo JEV (uma pergunta noul por tag, acima do limiar)', async () => {
    mocks.loadSettings.mockResolvedValue({ settings: settings({ provider: 'jev', model: 'jev-latest', jevThreshold: 0.5 }), isDefault: false, updatedAt: new Date() })
    mocks.jev.mockResolvedValue({ answers: { tag_api: { type: 'noul', noul: 0.9 }, tag_ux: { type: 'noul', noul: 0.2 } } })
    expect(await generateTaskTags('a')).toEqual(['api'])
    expect(mocks.jev).toHaveBeenCalledOnce()
  })
})

describe('runTaskTagsBackfill', () => {
  it('com a feature indisponível, não varre nada', async () => {
    mocks.availability.mockResolvedValue({ available: false, reason: 'desativada' })
    expect(await runTaskTagsBackfill()).toContain('Pulada')
    expect(mocks.find).not.toHaveBeenCalled()
  })

  it('varre só as não arquivadas fora das colunas de conclusão e sem tags atualizadas', async () => {
    const current = { title: 'Título B', description: 'Corpo B' }
    mocks.docs = [
      { _id: 'a', code: 'OPX-1', title: 'Título A', description: 'Corpo A', tagsSourceHash: null },
      { _id: 'b', code: 'OPX-2', title: current.title, description: current.description, tagsSourceHash: taskTagsSourceHash(current) },
    ]
    expect(await runTaskTagsBackfill()).toContain('1 tarefa(s) marcada(s)')
    expect(mocks.find).toHaveBeenCalledWith({ archived: { $ne: true }, columnId: { $nin: ['done'] } })
    expect(mocks.getTask).toHaveBeenCalledTimes(1)
    expect(mocks.getTask).toHaveBeenCalledWith('a')
  })

  it('nada pendente devolve o aviso sem gerar', async () => {
    const current = { title: 'Título B', description: 'Corpo B' }
    mocks.docs = [{ _id: 'b', code: 'OPX-2', title: current.title, description: current.description, tagsSourceHash: taskTagsSourceHash(current) }]
    expect(await runTaskTagsBackfill()).toBe('Nenhuma tag pendente')
    expect(mocks.getTask).not.toHaveBeenCalled()
  })
})
