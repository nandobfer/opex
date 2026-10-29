import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  active: new Set<string>(), turn: vi.fn(), settings: vi.fn(), request: vi.fn(), paginate: vi.fn(),
  finish: vi.fn(), audit: vi.fn(), publish: vi.fn(), interrupt: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.audit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR' } }))
vi.mock('@/lib/db/models/PrReview', async () => ({ PrReview: (await import('../../helpers/memory-model')).memoryModel() }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: async () => ({ session: { create: async () => ({ id: 'session-review' }), interrupt: mocks.interrupt, instructions: { entry: { put: vi.fn() } } } }) }))
vi.mock('@/lib/ai/opencode-run', () => ({ runAgentTurn: mocks.turn }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/features/github/client', () => ({ githubRequest: mocks.request, githubPaginate: mocks.paginate }))
vi.mock('@/features/ai/server/settings', () => ({ loadPrReviewSettings: mocks.settings, availabilityOfPrReview: async () => ({ available: true }) }))
vi.mock('@/features/agentic/server/hub', () => ({
  isWorkbenchActive: (id: string) => mocks.active.has(id), markWorkbenchActive: (id: string) => mocks.active.add(id),
  clearWorkbenchActive: (id: string) => mocks.active.delete(id), abortWorkbenchRun: vi.fn(),
  prepareHub: vi.fn(), publishWorkbenchEvent: vi.fn(), flushWorkbenchEvents: vi.fn(async () => undefined), dropWorkbenchEvents: vi.fn(),
}))
vi.mock('@/features/pr-review/server/session-cleanup', () => ({ finishReviewSession: mocks.finish }))
vi.mock('@/features/pr-review/server/targets', async () => ({
  findReviewTarget: async () => ({ config: (await import('@/features/agentic/schemas')).defaultCentralConfig('/repo') }),
  githubLogin: async () => 'dono', listReviewTargets: async () => [], workbenchPrIndex: async () => new Map(),
}))
vi.mock('@/features/pr-review/server/queue', () => ({ enqueueReview: vi.fn() }))

import { PrReview } from '@/lib/db/models/PrReview'
import { DEFAULT_PR_REVIEW_SETTINGS } from '@/features/pr-review/schemas'
import { reviewMarker } from '@/features/pr-review/logic'
import { getPrReview, listPrReviews, pumpPrReviews, stopPrReview } from '@/features/pr-review/server/service'

const model = PrReview as unknown as { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }
const create = async (patch: Record<string, unknown> = {}) => String((await model.create({ repo: 'org/app', number: 7, url: 'https://github.com/org/app/pull/7', title: 'Melhoria', headSha: 'sha1', state: 'queued', usage: {}, ...patch }))._id)

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.active.clear()
  mocks.settings.mockResolvedValue({ settings: { ...DEFAULT_PR_REVIEW_SETTINGS, enabled: true, model: { providerID: 'p', modelID: 'm' } } })
  mocks.publish.mockResolvedValue(undefined)
  mocks.interrupt.mockResolvedValue(undefined)
  mocks.finish.mockResolvedValue(undefined)
  mocks.audit.mockResolvedValue(undefined)
  mocks.paginate.mockImplementation(async (path: string) => path.includes('/reviews?') ? [{ body: reviewMarker('sha1'), state: 'APPROVED' }] : [])
  mocks.turn.mockResolvedValue({ outcome: 'succeeded', text: 'Relatório\n```json\n{"verdict":"approved","blocking":0,"summary":"Sem bloqueios"}\n```', costUsd: 0 })
})

describe('execução da revisão de PR', () => {
  it('executa no SHA, publica resultado, audita e limpa sessão', async () => {
    const id = await create()
    expect(await pumpPrReviews()).toBe(1)
    await vi.waitFor(() => expect(mocks.finish).toHaveBeenCalledWith(id, 'session-review'))
    const dto = await getPrReview(id)
    expect(dto).toMatchObject({ state: 'done', verdict: 'approved', error: null, summary: 'Sem bloqueios' })
    expect(mocks.turn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ consumption: { origin: 'pr-review', subject: 'org/app#7' }, text: expect.stringContaining('sha1') }), expect.anything())
    expect(mocks.audit).toHaveBeenCalled()
  })

  it('duas chamadas do motor não duplicam a execução', async () => {
    await create()
    await Promise.all([pumpPrReviews(), pumpPrReviews()])
    await vi.waitFor(() => expect(mocks.finish).toHaveBeenCalled())
    expect(mocks.turn).toHaveBeenCalledTimes(1)
  })

  it('falha do agente mantém erro acionável e limpa a sessão', async () => {
    const id = await create()
    mocks.turn.mockRejectedValue(new Error('OpenCode indisponível'))
    await pumpPrReviews()
    await vi.waitFor(() => expect(mocks.finish).toHaveBeenCalledWith(id, 'session-review'))
    expect(await getPrReview(id)).toMatchObject({ state: 'failed', error: 'OpenCode indisponível' })
  })

  it('não considera publicada a revisão quando GitHub não confirma o marcador', async () => {
    const id = await create()
    mocks.paginate.mockResolvedValue([])
    await pumpPrReviews()
    await vi.waitFor(() => expect(mocks.finish).toHaveBeenCalled())
    expect((await getPrReview(id)).error).toContain('não foi encontrada no GitHub')
  })

  it('parar uma revisão na fila não chama OpenCode e audita a decisão', async () => {
    const id = await create()
    expect(await stopPrReview(id)).toMatchObject({ state: 'interrupted', error: 'Removida da fila pelo usuário' })
    expect(mocks.interrupt).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalled()
  })

  it('parar uma revisão concluída é recusado', async () => {
    const id = await create({ state: 'done' })
    await expect(stopPrReview(id)).rejects.toMatchObject({ code: 'PR_REVIEW_NOT_RUNNING' })
  })
})

describe('lista paginada das revisões', () => {
  const seed = async (count: number, patch: Record<string, unknown> = {}) => {
    for (let i = 0; i < count; i++) await create({ number: i + 1, state: 'done', createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)), ...patch })
  }

  it('página 2 com limite 20 pula as 20 mais recentes e calcula total e páginas', async () => {
    await seed(45)
    const list = await listPrReviews({ page: 2, limit: 20 })
    expect(list).toMatchObject({ page: 2, limit: 20, total: 45, totalPages: 3 })
    expect(list.items.map((item) => item.number)).toEqual(Array.from({ length: 20 }, (_, i) => 25 - i))
    expect((await listPrReviews({ page: 3, limit: 20 })).items).toHaveLength(5)
  })

  it('sem revisões, total zero e uma página', async () => {
    expect(await listPrReviews()).toMatchObject({ items: [], page: 1, total: 0, totalPages: 1 })
  })

  it('o filtro vale para a página e para o total', async () => {
    await seed(3)
    await seed(2, { state: 'failed' })
    const find = vi.spyOn(PrReview, 'find')
    const count = vi.spyOn(PrReview, 'countDocuments')
    const list = await listPrReviews({ states: ['failed'], limit: 20 })
    expect(list).toMatchObject({ total: 2, totalPages: 1 })
    expect(list.items.every((item) => item.state === 'failed')).toBe(true)
    const filter = find.mock.calls.at(-1)?.[0]
    expect(filter).toMatchObject({ state: { $in: ['failed'] } })
    expect(count).toHaveBeenCalledWith(filter)
  })
})
