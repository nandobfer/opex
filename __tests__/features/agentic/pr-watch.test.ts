import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  request: vi.fn(),
  paginate: vi.fn(),
  merged: vi.fn(),
  changes: vi.fn(),
  closed: vi.fn(),
  reopened: vi.fn(),
  saveReview: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: { find: () => ({ lean: mocks.find }) } }))
vi.mock('@/features/github/client', () => ({ githubRequest: mocks.request, githubPaginate: mocks.paginate }))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/workflow', () => ({
  handlePrMerged: mocks.merged,
  handlePrChangesRequested: mocks.changes,
  handlePrClosed: mocks.closed,
  handlePrReopened: mocks.reopened,
  saveLastReviewId: mocks.saveReview,
}))
vi.mock('@/features/agentic/server/timer-sync', () => ({ closeOrphanWorkPeriods: vi.fn(async () => 0) }))

import { repoFromPrUrl, watchPullRequests } from '@/features/agentic/server/pr-watch'

const workbench = (pr: Record<string, unknown> = {}) => ({ _id: 'w1', centralId: 'c1', taskCode: 'GO-DEV-1', pr: { number: 7, url: 'https://github.com/org/app/pull/7', state: 'open', lastReviewId: 10, ...pr } })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.find.mockResolvedValue([workbench()])
})

describe('watchPullRequests', () => {
  it('repoFromPrUrl extrai org/repo', () => {
    expect(repoFromPrUrl('https://github.com/org/app/pull/7')).toBe('org/app')
    expect(repoFromPrUrl('https://gitlab.com/x')).toBeNull()
  })

  it('PR mergeado conclui a mesa com o commit do merge', async () => {
    mocks.request.mockResolvedValue({ state: 'closed', merged: true, merged_at: '2026-10-09T10:00:00Z', merge_commit_sha: 'abc' })
    await watchPullRequests()
    expect(mocks.request).toHaveBeenCalledWith('/repos/org/app/pulls/7')
    expect(mocks.merged).toHaveBeenCalledWith('w1', { mergedAt: new Date('2026-10-09T10:00:00Z'), mergeCommitSha: 'abc' })
    expect(mocks.changes).not.toHaveBeenCalled()
  })

  it('revisão nova pedindo mudanças replaneja com os comentários', async () => {
    mocks.request.mockResolvedValue({ state: 'open', merged: false })
    mocks.paginate.mockImplementation(async (path: string) =>
      path.includes('/comments') ? [{ body: 'renomear', path: 'a.ts', line: 3 }] : [{ id: 9, state: 'CHANGES_REQUESTED', body: 'antiga', user: { login: 'x' } }, { id: 12, state: 'CHANGES_REQUESTED', body: 'Ajustar', user: { login: 'ana' } }],
    )
    await watchPullRequests()
    expect(mocks.saveReview).toHaveBeenCalledWith('w1', 12)
    expect(mocks.changes).toHaveBeenCalledTimes(1)
    const feedback = mocks.changes.mock.calls[0]![1] as string
    expect(feedback).toContain('Ajustar')
    expect(feedback).toContain('`a.ts:3`: renomear')
    expect(feedback).not.toContain('antiga')
  })

  it('pedido de mudanças sem texto chega vazio (a mesa pede o texto ao usuário)', async () => {
    mocks.request.mockResolvedValue({ state: 'open', merged: false })
    mocks.paginate.mockImplementation(async (path: string) => (path.includes('/comments') ? [] : [{ id: 11, state: 'CHANGES_REQUESTED', body: '', user: null }]))
    await watchPullRequests()
    expect(mocks.changes).toHaveBeenCalledWith('w1', '')
  })

  it('aprovação ou comentário não replaneja; PR fechado avisa', async () => {
    mocks.request.mockResolvedValueOnce({ state: 'open', merged: false })
    mocks.paginate.mockResolvedValue([{ id: 15, state: 'APPROVED', body: 'ok', user: null }])
    await watchPullRequests()
    expect(mocks.changes).not.toHaveBeenCalled()
    expect(mocks.saveReview).toHaveBeenCalledWith('w1', 15)

    mocks.request.mockResolvedValueOnce({ state: 'closed', merged: false })
    await watchPullRequests()
    expect(mocks.closed).toHaveBeenCalledWith('w1')
  })
})
