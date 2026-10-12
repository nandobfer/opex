import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  request: vi.fn(),
  paginate: vi.fn(),
  merged: vi.fn(),
  feedback: vi.fn(),
  conflict: vi.fn(),
  autoMerge: vi.fn(),
  closed: vi.fn(),
  reopened: vi.fn(),
  saveCursors: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: { find: () => ({ lean: mocks.find }) } }))
vi.mock('@/features/github/client', () => ({ githubRequest: mocks.request, githubPaginate: mocks.paginate }))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/workflow', () => ({
  handlePrMerged: mocks.merged,
  handlePrFeedback: mocks.feedback,
  handlePrConflict: mocks.conflict,
  handlePrAutoMerge: mocks.autoMerge,
  handlePrClosed: mocks.closed,
  handlePrReopened: mocks.reopened,
  savePrCursors: mocks.saveCursors,
}))
vi.mock('@/features/agentic/server/timer-sync', () => ({ closeOrphanWorkPeriods: vi.fn(async () => 0) }))

import { conflictUntried, mentionsOpex, repoFromPrUrl, watchPullRequests } from '@/features/agentic/server/pr-watch'

const workbench = (pr: Record<string, unknown> = {}) => ({
  _id: 'w1',
  centralId: 'c1',
  taskCode: 'GO-DEV-1',
  pr: { number: 7, url: 'https://github.com/org/app/pull/7', state: 'open', lastReviewId: 10, lastCommentId: 20, ...pr },
})

/** Roteia `githubPaginate` pelos endpoints do PR (reviews, comentários da conversa, comentários de linha). */
const respond = (data: { reviews?: unknown[]; issues?: unknown[]; inline?: unknown[]; reviewComments?: Record<number, unknown[]> } = {}) =>
  mocks.paginate.mockImplementation(async (path: string) => {
    const reviewComment = /\/reviews\/(\d+)\/comments/.exec(path)
    if (reviewComment) return data.reviewComments?.[Number(reviewComment[1])] ?? []
    if (path.includes('/pulls/7/comments')) return data.inline ?? []
    if (path.includes('/issues/7/comments')) return data.issues ?? []
    if (path.includes('/reviews?per_page')) return data.reviews ?? []
    return []
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.find.mockResolvedValue([workbench()])
  mocks.request.mockResolvedValue({ state: 'open', merged: false })
  respond()
})

describe('watchPullRequests', () => {
  it('repoFromPrUrl extrai org/repo', () => {
    expect(repoFromPrUrl('https://github.com/org/app/pull/7')).toBe('org/app')
    expect(repoFromPrUrl('https://gitlab.com/x')).toBeNull()
  })

  it('mentionsOpex respeita a fronteira da menção', () => {
    expect(mentionsOpex('oi @opex, veja isso')).toBe(true)
    expect(mentionsOpex('@OPEX ajuste o filtro')).toBe(true)
    expect(mentionsOpex('@opexa não é o mesmo')).toBe(false)
    expect(mentionsOpex('veja @opex-dev')).toBe(false)
    expect(mentionsOpex('fale com foo@opex.com')).toBe(false)
  })

  it('PR mergeado conclui a mesa com o commit do merge', async () => {
    mocks.request.mockResolvedValue({ state: 'closed', merged: true, merged_at: '2026-10-09T10:00:00Z', merge_commit_sha: 'abc' })
    await watchPullRequests()
    expect(mocks.request).toHaveBeenCalledWith('/repos/org/app/pulls/7')
    expect(mocks.merged).toHaveBeenCalledWith('w1', { mergedAt: new Date('2026-10-09T10:00:00Z'), mergeCommitSha: 'abc' })
    expect(mocks.feedback).not.toHaveBeenCalled()
  })

  it('comentário novo da conversa com @opex volta ao planejamento', async () => {
    respond({ issues: [{ id: 25, body: '@opex ajuste o filtro de data', user: { login: 'ana' } }] })
    await watchPullRequests()
    expect(mocks.saveCursors).toHaveBeenCalledWith('w1', expect.objectContaining({ lastCommentId: 25 }))
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    const feedback = mocks.feedback.mock.calls[0]![1] as string
    expect(feedback).toContain('@ana')
    expect(feedback).toContain('@opex ajuste o filtro de data')
  })

  it('comentário novo sem @opex não replaneja, mas avança o cursor', async () => {
    respond({ issues: [{ id: 25, body: 'comentário comum', user: { login: 'ana' } }] })
    await watchPullRequests()
    expect(mocks.saveCursors).toHaveBeenCalledWith('w1', expect.objectContaining({ lastCommentId: 25 }))
    expect(mocks.feedback).not.toHaveBeenCalled()
  })

  it('comentário já visto (id <= cursor) com @opex não replaneja', async () => {
    respond({ issues: [{ id: 20, body: '@opex de novo', user: { login: 'ana' } }] })
    await watchPullRequests()
    expect(mocks.feedback).not.toHaveBeenCalled()
    expect(mocks.saveCursors).not.toHaveBeenCalled()
  })

  it('comentário de linha com @opex volta ao planejamento com path:line', async () => {
    respond({ inline: [{ id: 26, body: '@opex renomear', user: { login: 'ana' }, path: 'a.ts', line: 3, pull_request_review_id: 99 }] })
    await watchPullRequests()
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    const feedback = mocks.feedback.mock.calls[0]![1] as string
    expect(feedback).toContain('`a.ts:3`')
    expect(feedback).toContain('@opex renomear')
  })

  it('revisão nova pedindo mudanças continua replanejando com os comentários', async () => {
    respond({
      reviews: [{ id: 12, state: 'CHANGES_REQUESTED', body: 'Ajustar', user: { login: 'ana' } }],
      reviewComments: { 12: [{ body: 'renomear', path: 'a.ts', line: 3 }] },
    })
    await watchPullRequests()
    expect(mocks.saveCursors).toHaveBeenCalledWith('w1', expect.objectContaining({ lastReviewId: 12 }))
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    const feedback = mocks.feedback.mock.calls[0]![1] as string
    expect(feedback).toContain('Ajustar')
    expect(feedback).toContain('`a.ts:3`: renomear')
  })

  it('corpo de revisão com @opex volta ao planejamento mesmo sem CHANGES_REQUESTED', async () => {
    respond({ reviews: [{ id: 13, state: 'APPROVED', body: 'ok, mas @opex troque o texto', user: { login: 'ana' } }] })
    await watchPullRequests()
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    expect(mocks.feedback.mock.calls[0]![1]).toContain('@opex troque o texto')
  })

  it('pedido de mudanças sem texto chega vazio (a mesa pede o texto ao usuário)', async () => {
    respond({ reviews: [{ id: 12, state: 'CHANGES_REQUESTED', body: '', user: null }] })
    await watchPullRequests()
    expect(mocks.feedback).toHaveBeenCalledWith('w1', '')
  })

  it('PR legado (sem cursor de comentário) não replaneja por comentário antigo e grava a linha de base', async () => {
    mocks.find.mockResolvedValue([workbench({ lastCommentId: undefined })])
    respond({ issues: [{ id: 25, body: '@opex ajuste antigo', user: { login: 'ana' } }] })
    await watchPullRequests()
    expect(mocks.feedback).not.toHaveBeenCalled()
    expect(mocks.saveCursors).toHaveBeenCalledWith('w1', expect.objectContaining({ lastCommentId: 25 }))
  })

  it('aprovação sem @opex não replaneja; PR fechado avisa', async () => {
    respond({ reviews: [{ id: 15, state: 'APPROVED', body: 'ok', user: null }] })
    await watchPullRequests()
    expect(mocks.feedback).not.toHaveBeenCalled()
    expect(mocks.saveCursors).toHaveBeenCalledWith('w1', expect.objectContaining({ lastReviewId: 15 }))

    mocks.request.mockResolvedValueOnce({ state: 'closed', merged: false })
    await watchPullRequests()
    expect(mocks.closed).toHaveBeenCalledWith('w1')
  })
})

describe('conflito de merge', () => {
  it('PR aberto com mergeable false aciona a resolução automática', async () => {
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: false, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    expect(mocks.conflict).toHaveBeenCalledWith('w1', { baseBranch: 'main', headBranch: 'feat/x', baseSha: 'b1', headSha: 'h1' })
    expect(mocks.feedback).not.toHaveBeenCalled()
  })

  it('mergeable true ou null (calculando) não aciona a resolução', async () => {
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: true, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: null, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    expect(mocks.conflict).not.toHaveBeenCalled()
  })

  it('mesmo estado (SHAs já tratados) não repete a resolução', async () => {
    mocks.find.mockResolvedValue([workbench({ conflictBaseSha: 'b1', conflictHeadSha: 'h1' })])
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: false, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    expect(mocks.conflict).not.toHaveBeenCalled()
  })

  it('mudança de head (novo push) libera nova tentativa', async () => {
    mocks.find.mockResolvedValue([workbench({ conflictBaseSha: 'b1', conflictHeadSha: 'h1' })])
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: false, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h2' } })
    await watchPullRequests()
    expect(mocks.conflict).toHaveBeenCalledTimes(1)
  })

  it('feedback e conflito juntos: só o feedback é encaminhado nesta varredura', async () => {
    respond({ issues: [{ id: 25, body: '@opex ajuste o filtro', user: { login: 'ana' } }] })
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: false, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    expect(mocks.conflict).not.toHaveBeenCalled()
  })

  it('conflictUntried compara os SHAs de base e head', () => {
    expect(conflictUntried({}, { base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })).toBe(true)
    expect(conflictUntried({ conflictBaseSha: 'b1', conflictHeadSha: 'h1' }, { base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })).toBe(false)
    expect(conflictUntried({ conflictBaseSha: 'b0', conflictHeadSha: 'h1' }, { base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })).toBe(true)
    expect(conflictUntried({}, { base: { ref: 'main', sha: 'b1' }, head: null })).toBe(false)
  })
})

describe('merge automático', () => {
  it('PR pronto (mergeable true, estado clean e fora do rascunho) aciona o merge automático', async () => {
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: true, mergeable_state: 'clean', draft: false, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    expect(mocks.autoMerge).toHaveBeenCalledWith('w1', { baseBranch: 'main' })
    expect(mocks.conflict).not.toHaveBeenCalled()
    expect(mocks.feedback).not.toHaveBeenCalled()
  })

  it('PR rascunho não é mergeado automaticamente', async () => {
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: true, mergeable_state: 'clean', draft: true, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    expect(mocks.autoMerge).not.toHaveBeenCalled()
  })

  it('mergeable null (calculando) ou estado bloqueado não mergeia', async () => {
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: null, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: true, mergeable_state: 'blocked', draft: false, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    expect(mocks.autoMerge).not.toHaveBeenCalled()
  })

  it('feedback tem prioridade: pedido de mudança não mergeia na mesma varredura', async () => {
    respond({ issues: [{ id: 25, body: '@opex ajuste o filtro', user: { login: 'ana' } }] })
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: true, mergeable_state: 'clean', draft: false, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    expect(mocks.autoMerge).not.toHaveBeenCalled()
  })
})
