import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PR_REVIEW_SETTINGS } from '@/features/pr-review/schemas'

const mocks = vi.hoisted(() => ({ settings: vi.fn(), find: vi.fn(), lean: vi.fn() }))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/features/ai/server/settings', () => ({ loadPrReviewSettings: mocks.settings }))
vi.mock('@/lib/db/models/PrReview', () => ({ PrReview: { findOne: mocks.find } }))

import { loadPrReviewGate } from '@/features/pr-review/server/gate'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.settings.mockResolvedValue({ settings: { ...DEFAULT_PR_REVIEW_SETTINGS, enabled: true } })
  mocks.find.mockReturnValue({ select: () => ({ lean: mocks.lean }) })
})

describe('revisão obrigatória antes do merge automático', () => {
  it.each([
    { state: 'queued' }, { state: 'running' }, { state: 'failed' }, { state: 'interrupted' },
    { state: 'done', verdict: 'changes_requested' }, { state: 'done', verdict: 'commented', blocking: 1 },
    { state: 'done', verdict: 'approved', error: 'Revisão não publicada no GitHub' },
  ])('bloqueia %j', async (review) => {
    mocks.lean.mockResolvedValue(review)
    expect(await (await loadPrReviewGate()).blocksAutoMerge('ORG/APP', 7, 'sha2')).toBe(true)
    expect(mocks.find).toHaveBeenCalledWith({ repo: 'org/app', number: 7, headSha: 'sha2' })
  })

  it('aprovação publicada do commit atual libera o merge', async () => {
    mocks.lean.mockResolvedValue({ state: 'done', verdict: 'approved', error: null, blocking: 0 })
    expect(await (await loadPrReviewGate()).blocksAutoMerge('org/app', 7, 'sha2')).toBe(false)
  })

  it('PR fora do critério, sem revisão do commit atual, não espera revisão de commit antigo', async () => {
    mocks.lean.mockResolvedValue(null)
    expect(await (await loadPrReviewGate()).blocksAutoMerge('org/app', 7, 'sha2')).toBe(false)
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ headSha: 'sha2' }))
  })

  it('configuração desativada não interfere no fluxo existente', async () => {
    mocks.settings.mockResolvedValue({ settings: DEFAULT_PR_REVIEW_SETTINGS })
    expect(await (await loadPrReviewGate()).blocksAutoMerge('org/app', 7, 'sha2')).toBe(false)
    expect(mocks.find).not.toHaveBeenCalled()
  })
})

describe('estado da revisão automática do commit atual (acompanhamento do PR)', () => {
  it('revisão automática desligada', async () => {
    mocks.settings.mockResolvedValue({ settings: DEFAULT_PR_REVIEW_SETTINGS })
    expect(await (await loadPrReviewGate()).reviewStatus('Org/App', 7, 'h1')).toEqual({ enabled: false })
    expect(mocks.find).not.toHaveBeenCalled()
  })

  it('estado e veredito da revisão do commit atual (repo em minúsculas)', async () => {
    mocks.lean.mockResolvedValue({ state: 'done', verdict: 'approved' })
    expect(await (await loadPrReviewGate()).reviewStatus('Org/App', 7, 'h1')).toEqual({ enabled: true, state: 'done', verdict: 'approved' })
    expect(mocks.find).toHaveBeenCalledWith({ repo: 'org/app', number: 7, headSha: 'h1' })
  })

  it('ainda não revisado ou sem commit conhecido', async () => {
    mocks.lean.mockResolvedValue(null)
    const gate = await loadPrReviewGate()
    expect(await gate.reviewStatus('org/app', 7, 'h1')).toEqual({ enabled: true, state: null, verdict: null })
    expect(await gate.reviewStatus('org/app', 7, null)).toEqual({ enabled: true, state: null, verdict: null })
  })
})
