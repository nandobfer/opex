import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  availability: vi.fn(),
  getTask: vi.fn(),
  getDraftDetail: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/Ai', () => ({ AiUsageLog: { create: vi.fn() } }))
vi.mock('@/lib/ai/stream', () => ({ streamAi: vi.fn() }))
vi.mock('@/features/ai/server/settings', () => ({ loadUnderstandTaskSettings: mocks.load, availabilityOf: mocks.availability }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask }))
vi.mock('@/features/github/server/drafts', () => ({ getDraftDetail: mocks.getDraftDetail }))

import { DEFAULT_UNDERSTAND_TASK_SETTINGS } from '@/features/ai/schemas'
import { prepareUnderstandTask } from '@/features/ai/server/understand-task'

const DRAFT_ID = 'draft-0123456789abcdef01234567'

const draft = (overrides: Record<string, unknown> = {}) => ({
  id: DRAFT_ID,
  code: 'GH-7',
  title: 'Bot\u00e3o de exportar',
  body: 'Corpo',
  issueTitle: 'Bot\u00e3o de exportar',
  issueBody: 'Corpo',
  previewBody: 'Corpo com https://assinada.example/img?token=segredo',
  repo: 'sipal/portal',
  number: 7,
  issueState: 'open',
  author: { login: 'ana', name: null, avatarUrl: null, developerName: null },
  labels: [],
  issueType: null,
  milestone: null,
  assignees: [],
  product: { id: 'p1', name: 'Portal' },
  taskType: 'feature',
  priority: 'medium',
  assignee: null,
  workPackage: null,
  columnName: null,
  imageCount: 0,
  comments: [],
  issueCreatedAt: null,
  state: 'draft',
  goTaskCode: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockResolvedValue({ settings: { ...DEFAULT_UNDERSTAND_TASK_SETTINGS, enabled: true, provider: 'gemini', model: 'gemini-3-flash' } })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
})

describe('prepareUnderstandTask com rascunhos', () => {
  it('id draft-\u2026 usa o rascunho (n\u00e3o o Go! Sipal) e nunca envia o corpo com URLs assinadas', async () => {
    mocks.getDraftDetail.mockResolvedValue(draft())
    const prepared = await prepareUnderstandTask(DRAFT_ID)
    expect(mocks.getDraftDetail).toHaveBeenCalledWith(DRAFT_ID)
    expect(mocks.getTask).not.toHaveBeenCalled()
    expect(prepared).toMatchObject({ taskId: DRAFT_ID, title: 'Entender rascunho GH-7' })
    expect(prepared.prompt).toContain('# Rascunho GH-7')
    expect(prepared.prompt).not.toContain('assinada.example')
  })

  it('rascunho enviado ou descartado responde 409 com a orienta\u00e7\u00e3o', async () => {
    mocks.getDraftDetail.mockResolvedValueOnce(draft({ state: 'sent', goTaskCode: 'GO-DEV-99' }))
    await expect(prepareUnderstandTask(DRAFT_ID)).rejects.toMatchObject({ status: 409, code: 'DRAFT_ALREADY_SENT', message: 'Rascunho j\u00e1 enviado: use a tarefa GO-DEV-99' })
    mocks.getDraftDetail.mockResolvedValueOnce(draft({ state: 'discarded' }))
    await expect(prepareUnderstandTask(DRAFT_ID)).rejects.toMatchObject({ status: 409, code: 'DRAFT_DISCARDED' })
  })

  it('feature indispon\u00edvel nem busca o rascunho', async () => {
    mocks.availability.mockResolvedValue({ available: false, reason: 'desativada' })
    await expect(prepareUnderstandTask(DRAFT_ID)).rejects.toMatchObject({ status: 409, message: 'desativada' })
    expect(mocks.getDraftDetail).not.toHaveBeenCalled()
  })
})
