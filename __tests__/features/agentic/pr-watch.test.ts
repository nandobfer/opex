import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  request: vi.fn(),
  paginate: vi.fn(),
  merged: vi.fn(),
  feedback: vi.fn(),
  conflict: vi.fn(),
  autoMerge: vi.fn(),
  ciFix: vi.fn(async () => true),
  ciLimit: vi.fn(),
  globalCi: { fixCi: true, ciFixLimit: null as number | null },
  closed: vi.fn(),
  reopened: vi.fn(),
  saveCursors: vi.fn(),
  replan: vi.fn((): { allowed: boolean; reason: string | null } => ({ allowed: true, reason: null })),
  blocksAutoMerge: vi.fn(async () => false),
  centrals: vi.fn((): unknown[] => []),
  reviewStatus: vi.fn(async (): Promise<{ enabled: false } | { enabled: true; state: string | null; verdict: string | null }> => ({ enabled: false })),
  reports: [] as { workbenchId: string; prNumber: number; nextCheckAt: string | null; steps: { text: string; level: string }[]; outcome: string | null; summary: string | null; failed: string | null }[],
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: { find: () => ({ lean: mocks.find }) }, AgenticCentral: { find: () => ({ lean: async () => mocks.centrals() }) } }))
vi.mock('@/features/github/client', () => ({ githubRequest: mocks.request, githubPaginate: mocks.paginate }))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/workflow', () => ({
  handlePrMerged: mocks.merged,
  handlePrFeedback: mocks.feedback,
  handlePrConflict: mocks.conflict,
  handlePrAutoMerge: mocks.autoMerge,
  handlePrCiFailure: mocks.ciFix,
  handlePrCiLimit: mocks.ciLimit,
  handlePrClosed: mocks.closed,
  handlePrReopened: mocks.reopened,
  savePrCursors: mocks.saveCursors,
}))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: async () => ({ settings: { ci: mocks.globalCi } }) }))
vi.mock('@/features/agentic/server/timer-sync', () => ({ closeOrphanWorkPeriods: vi.fn(async () => 0) }))
vi.mock('@/features/pr-review/server/gate', () => ({ loadPrReviewGate: async () => ({ replan: mocks.replan, blocksAutoMerge: mocks.blocksAutoMerge, reviewStatus: mocks.reviewStatus }) }))
vi.mock('@/features/agentic/server/pr-watch-schedule', () => ({ loadPrWatchSchedule: async () => ({ enabled: true, nextCheckAt: '2026-10-16T12:02:00.000Z', running: true }) }))
// Relato da verificação gravado em memória (ordem dos passos, desfecho e resumo).
vi.mock('@/features/agentic/server/pr-watch-report', () => ({
  startPrWatchReport: async (workbenchId: string, prNumber: number, nextCheckAt: string | null) => {
    const report = { workbenchId, prNumber, nextCheckAt, steps: [] as { text: string; level: string }[], outcome: null as string | null, summary: null as string | null, failed: null as string | null }
    mocks.reports.push(report)
    return {
      step: (text: string, level = 'info') => {
        if (!report.outcome) report.steps.push({ text, level })
      },
      finish: async (outcome: string, summary: string) => {
        if (report.outcome) return
        report.outcome = outcome
        report.summary = summary
      },
      fail: async (message: string) => {
        report.failed = message
        if (!report.outcome) {
          report.outcome = 'error'
          report.summary = 'Falha na verificação do PR'
        }
      },
      get finished() {
        return report.outcome !== null
      },
    }
  },
}))


import { conflictUntried, describeChecks, describePull, describeReviewStatus, mentionsOpex, mergeWaitReason, repoFromPrUrl, watchPullRequests } from '@/features/agentic/server/pr-watch'

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
  mocks.replan.mockReturnValue({ allowed: true, reason: null })
  mocks.blocksAutoMerge.mockResolvedValue(false)
  mocks.reviewStatus.mockResolvedValue({ enabled: false })
  mocks.centrals.mockReturnValue([])
  mocks.ciFix.mockResolvedValue(true)
  mocks.globalCi = { fixCi: true, ciFixLimit: null }
  mocks.reports.length = 0
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

  it('espera a revisão automática do commit atual (na fila, revisando ou pedindo mudanças)', async () => {
    mocks.blocksAutoMerge.mockResolvedValue(true)
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: true, mergeable_state: 'clean', draft: false, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    expect(mocks.blocksAutoMerge).toHaveBeenCalledWith('org/app', 7, 'h1')
    expect(mocks.autoMerge).not.toHaveBeenCalled()
  })
})

describe('revisão automática (Revisão de PR)', () => {
  const autoReview = (id: number, state = 'CHANGES_REQUESTED', body = '**Bloqueio** em a.ts\n<!-- opex:pr-review sha=h1 -->') => ({ id, state, body, user: { login: 'eu' } })

  it('pedido de mudanças da revisão automática replaneja e conta o replanejamento', async () => {
    mocks.find.mockResolvedValue([workbench({ autoReviewReplans: 2 })])
    respond({ reviews: [autoReview(12)] })
    await watchPullRequests()
    expect(mocks.replan).toHaveBeenCalledWith(2)
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    expect(mocks.saveCursors).toHaveBeenCalledWith('w1', { autoReviewReplans: 3 })
  })

  it('limite atingido: ignora o pedido da revisão automática, mas segue replanejando por pessoas', async () => {
    mocks.replan.mockReturnValue({ allowed: false, reason: 'limite de 3 replanejamento(s) pela revisão automática atingido' })
    respond({ reviews: [autoReview(12)] })
    await watchPullRequests()
    expect(mocks.feedback).not.toHaveBeenCalled()
    expect(mocks.saveCursors).not.toHaveBeenCalledWith('w1', expect.objectContaining({ autoReviewReplans: expect.any(Number) }))

    respond({ reviews: [autoReview(13), { id: 14, state: 'CHANGES_REQUESTED', body: 'Ajustar o filtro', user: { login: 'ana' } }] })
    await watchPullRequests()
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    expect(mocks.feedback.mock.calls[0]![1]).toContain('Ajustar o filtro')
    expect(mocks.feedback.mock.calls[0]![1]).not.toContain('Bloqueio')
  })

  it('PR próprio: comentário da revisão com a menção da central replaneja', async () => {
    respond({ reviews: [autoReview(12, 'COMMENTED', '@opex bloqueio em a.ts\n<!-- opex:pr-review sha=h1 -->')] })
    await watchPullRequests()
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    expect(mocks.saveCursors).toHaveBeenCalledWith('w1', { autoReviewReplans: 1 })
  })
})

describe('acompanhamento ao vivo (relato da verificação)', () => {
  const texts = () => mocks.reports[0]!.steps.map((step) => step.text)
  const central = (git: Record<string, unknown>) => ({ _id: 'c1', config: { git } })
  const ready = { state: 'open', merged: false, mergeable: true, mergeable_state: 'clean', draft: false, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1234567890' } }

  it('sem novidade: passo a passo e "Nada a fazer" (idle), com o horário da próxima verificação', async () => {
    mocks.centrals.mockReturnValue([central({ autoMerge: false })])
    mocks.request.mockResolvedValue(ready)
    respond({ issues: [{ id: 25, body: 'valeu!', user: { login: 'ana' } }] })
    await watchPullRequests()
    expect(mocks.reports).toHaveLength(1)
    const report = mocks.reports[0]!
    expect(report).toMatchObject({ workbenchId: 'w1', prNumber: 7, nextCheckAt: '2026-10-16T12:02:00.000Z', outcome: 'idle', summary: 'Nada a fazer' })
    expect(texts()).toEqual([
      'Consultando o PR #7 no GitHub…',
      'PR aberto · estado de merge: pronto para merge (clean)',
      'Lendo revisões e comentários…',
      'Novos: 0 revisões, 1 comentário',
      'Nenhum pede mudança nem menciona @opex',
      'Revisão automática de PR desligada',
      'Sem conflito de merge',
      'Merge automático desligado na central',
    ])
    expect(mocks.autoMerge).not.toHaveBeenCalled()
  })

  it('pedido de mudança: fecha o relato (action) ANTES de replanejar', async () => {
    mocks.feedback.mockImplementation(async () => {
      expect(mocks.reports[0]!.outcome).toBe('action')
    })
    respond({ issues: [{ id: 25, body: '@opex ajuste o filtro', user: { login: 'ana' } }] })
    await watchPullRequests()
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    expect(mocks.reports[0]).toMatchObject({ outcome: 'action', summary: 'Pedido de mudança → replanejando' })
    expect(texts()).toContain('Pedido de mudança encontrado (@ana)')
  })

  it('conflito já tentado no mesmo estado: avisa e segue sem nova resolução', async () => {
    mocks.find.mockResolvedValue([workbench({ conflictBaseSha: 'b1', conflictHeadSha: 'h1' })])
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: false, mergeable_state: 'dirty', base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    expect(mocks.conflict).not.toHaveBeenCalled()
    expect(texts()).toContain('Conflito de merge já tentado neste estado: aguardando um novo push ou uma nova base')
    expect(texts()).toContain('Merge automático aguardando: há conflito de merge')
    expect(mocks.reports[0]!.outcome).toBe('idle')
  })

  it('conflito novo: relato "resolvendo automaticamente" (action)', async () => {
    mocks.request.mockResolvedValue({ state: 'open', merged: false, mergeable: false, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1' } })
    await watchPullRequests()
    expect(mocks.conflict).toHaveBeenCalledTimes(1)
    expect(mocks.reports[0]).toMatchObject({ outcome: 'action', summary: 'Conflito de merge → resolvendo automaticamente' })
  })

  it('merge automático aguardando a revisão automática do commit atual', async () => {
    mocks.centrals.mockReturnValue([central({ autoMerge: true })])
    mocks.request.mockResolvedValue(ready)
    mocks.reviewStatus.mockResolvedValue({ enabled: true, state: 'running', verdict: null })
    mocks.blocksAutoMerge.mockResolvedValue(true)
    await watchPullRequests()
    expect(texts()).toContain('Revisão automática do commit h123456: revisando')
    expect(texts()).toContain('Merge automático aguardando a revisão automática do commit h123456')
    expect(mocks.autoMerge).not.toHaveBeenCalled()
    expect(mocks.reports[0]!.outcome).toBe('idle')
  })

  it('PR pronto com merge automático ligado: relato "merge automático" (action)', async () => {
    mocks.centrals.mockReturnValue([central({ autoMerge: true })])
    mocks.request.mockResolvedValue(ready)
    await watchPullRequests()
    expect(mocks.autoMerge).toHaveBeenCalledTimes(1)
    expect(mocks.reports[0]).toMatchObject({ outcome: 'action', summary: 'PR pronto → merge automático' })
  })

  it('mesa aguardando vaga: avisa que só merge e fechamento são verificados', async () => {
    mocks.find.mockResolvedValue([{ ...workbench(), pendingTurn: { action: 'pr-feedback' } }])
    await watchPullRequests()
    expect(texts()).toContain('Mesa aguardando vaga na central: só merge e fechamento são verificados')
    expect(mocks.reports[0]).toMatchObject({ outcome: 'idle', summary: 'Aguardando vaga' })
  })

  it('PR mergeado e PR fechado: relatos com o desfecho', async () => {
    mocks.request.mockResolvedValue({ state: 'closed', merged: true, merged_at: null, merge_commit_sha: 'abc' })
    await watchPullRequests()
    expect(mocks.reports[0]).toMatchObject({ outcome: 'action', summary: 'PR mergeado → concluindo a mesa' })

    mocks.reports.length = 0
    mocks.request.mockResolvedValue({ state: 'closed', merged: false })
    await watchPullRequests()
    expect(mocks.reports[0]).toMatchObject({ outcome: 'action', summary: 'PR fechado sem merge → avisando' })

    // Já avisado: continua fechado, sem novidade.
    mocks.reports.length = 0
    mocks.find.mockResolvedValue([workbench({ closedNotified: true })])
    await watchPullRequests()
    expect(mocks.reports[0]!.outcome).toBe('idle')
  })

  it('falha do GitHub: relato com erro', async () => {
    mocks.request.mockRejectedValue(new Error('HTTP 502'))
    const summary = await watchPullRequests()
    expect(summary).toContain('1 com falha')
    expect(mocks.reports[0]).toMatchObject({ outcome: 'error', failed: 'Falha ao consultar o PR no GitHub: HTTP 502' })
  })

  it('textos de estado do PR e da revisão automática', () => {
    expect(describePull({ draft: true, mergeable_state: 'draft' })).toBe('PR aberto (rascunho) · estado de merge: rascunho (draft)')
    expect(describePull({ mergeable_state: null })).toBe('PR aberto · estado de merge: ainda sendo calculado pelo GitHub (unknown)')
    expect(mergeWaitReason({ draft: true })).toBe('o PR está como rascunho')
    expect(mergeWaitReason({ mergeable: null })).toBe('o GitHub ainda está calculando o estado de merge')
    expect(mergeWaitReason({ mergeable: true, mergeable_state: 'blocked' })).toContain('blocked')
    expect(describeReviewStatus({ enabled: true, state: null, verdict: null }, 'abcdef123')).toBe('Revisão automática do commit abcdef1: ainda não revisado')
    expect(describeReviewStatus({ enabled: true, state: 'done', verdict: 'changes_requested' }, 'abcdef123')).toBe('Revisão automática do commit abcdef1: pediu mudanças')
    expect(describeReviewStatus({ enabled: true, state: 'queued', verdict: null }, null)).toBe('Revisão automática: na fila')
  })

  it('correção de CI desligada: PR instável só relata as verificações com falha ou pendentes', async () => {
    expect(describeChecks({ mergeable_state: 'clean' })).toBeNull()
    mocks.centrals.mockReturnValue([central({ inheritCi: false, fixCi: false, ciFixLimit: null })])
    mocks.request.mockResolvedValue({ ...ready, mergeable_state: 'unstable' })
    await watchPullRequests()
    expect(mocks.reports[0]!.steps).toContainEqual({ text: 'Verificações (CI) com falha ou pendentes · correção automática desligada na central', level: 'warn' })
    expect(mocks.request).not.toHaveBeenCalledWith(expect.stringContaining('/check-runs'))
  })
})

describe('CI falho (correção automática)', () => {
  const central = (git: Record<string, unknown>) => ({ _id: 'c1', config: { git } })
  const unstable = { state: 'open', merged: false, mergeable: true, mergeable_state: 'unstable', draft: false, base: { ref: 'main', sha: 'b1' }, head: { ref: 'feat/x', sha: 'h1234567890' } }
  const failed = { id: 31, name: 'test', status: 'completed', conclusion: 'failure', details_url: 'https://github.com/org/app/actions/runs/900/job/901' }
  /** Roteia `githubRequest`: PR, check runs e status do commit. */
  const github = (pull: Record<string, unknown>, checkRuns: unknown[] = [failed], statuses: unknown[] = []) =>
    mocks.request.mockImplementation(async (path: string) => {
      if (path.includes('/check-runs')) return { check_runs: checkRuns }
      if (path.endsWith('/status')) return { statuses }
      return pull
    })

  it('CI falho com tudo terminado aciona a correção (1ª tentativa pode reexecutar)', async () => {
    github(unstable)
    const summary = await watchPullRequests()
    expect(mocks.request).toHaveBeenCalledWith('/repos/org/app/commits/h1234567890/check-runs?per_page=100')
    expect(mocks.request).toHaveBeenCalledWith('/repos/org/app/commits/h1234567890/status')
    expect(mocks.ciFix).toHaveBeenCalledWith('w1', expect.objectContaining({ headSha: 'h1234567890', headBranch: 'feat/x', key: 'h1234567890:check:31', rerunAllowed: true, attempt: 1 }))
    expect(mocks.reports[0]).toMatchObject({ outcome: 'action', summary: 'CI falhou → corrigindo automaticamente' })
    expect(summary).toContain('1 com CI em correção')
    expect(mocks.reports[0]!.steps).toContainEqual({ text: 'CI falhou no commit h123456: test', level: 'warn' })
    expect(mocks.autoMerge).not.toHaveBeenCalled()
  })

  it('verificações em andamento: espera todas terminarem', async () => {
    github(unstable, [failed, { id: 32, name: 'lint', status: 'in_progress', conclusion: null }])
    await watchPullRequests()
    expect(mocks.ciFix).not.toHaveBeenCalled()
  })

  it('só consulta o CI com mergeable true e estado unstable/blocked', async () => {
    github({ ...unstable, mergeable_state: 'clean' })
    await watchPullRequests()
    github({ ...unstable, mergeable: null })
    await watchPullRequests()
    expect(mocks.request).not.toHaveBeenCalledWith(expect.stringContaining('/check-runs'))
    expect(mocks.ciFix).not.toHaveBeenCalled()
  })

  it('mesmas falhas já tratadas não repetem; mesmo commit não pode reexecutar de novo', async () => {
    mocks.find.mockResolvedValue([workbench({ ciFixKey: 'h1234567890:check:31', ciFixHeadSha: 'h1234567890', ciFixAttempts: 1 })])
    github(unstable)
    await watchPullRequests()
    expect(mocks.ciFix).not.toHaveBeenCalled()

    // Reexecução falhou de novo (id novo) no mesmo commit: corrige sem reexecutar.
    github(unstable, [{ ...failed, id: 40 }])
    await watchPullRequests()
    expect(mocks.ciFix).toHaveBeenCalledWith('w1', expect.objectContaining({ key: 'h1234567890:check:40', rerunAllowed: false, attempt: 2 }))
  })

  it('limite da central atingido avisa uma vez e não corrige', async () => {
    mocks.centrals.mockReturnValue([central({ inheritCi: false, fixCi: true, ciFixLimit: 2 })])
    mocks.find.mockResolvedValue([workbench({ ciFixKey: 'old', ciFixAttempts: 2 })])
    github(unstable)
    await watchPullRequests()
    expect(mocks.ciFix).not.toHaveBeenCalled()
    expect(mocks.ciLimit).toHaveBeenCalledWith('w1', { max: 2 })

    mocks.find.mockResolvedValue([workbench({ ciFixKey: 'old', ciFixAttempts: 2, ciFixLimitNotified: true })])
    await watchPullRequests()
    expect(mocks.ciLimit).toHaveBeenCalledTimes(1)
  })

  it('central sem valor próprio herda o padrão global (desligado = não corrige)', async () => {
    mocks.centrals.mockReturnValue([central({ autoMerge: false })])
    mocks.globalCi = { fixCi: false, ciFixLimit: null }
    github(unstable)
    await watchPullRequests()
    expect(mocks.ciFix).not.toHaveBeenCalled()
  })

  it('CI verde zera a contagem de correções', async () => {
    mocks.find.mockResolvedValue([workbench({ ciFixKey: 'old', ciFixAttempts: 2, ciFixLimitNotified: true })])
    github({ ...unstable, mergeable_state: 'clean' }, [{ ...failed, conclusion: 'success' }])
    await watchPullRequests()
    expect(mocks.saveCursors).toHaveBeenCalledWith('w1', { ciFixAttempts: 0, ciFixLimitNotified: false })
  })

  it('prioridade: feedback e conflito vêm antes do CI', async () => {
    github(unstable)
    respond({ issues: [{ id: 25, body: '@opex ajuste', user: { login: 'ana' } }] })
    await watchPullRequests()
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    expect(mocks.ciFix).not.toHaveBeenCalled()

    respond()
    github({ ...unstable, mergeable: false, mergeable_state: 'dirty' })
    await watchPullRequests()
    expect(mocks.conflict).toHaveBeenCalledTimes(1)
    expect(mocks.ciFix).not.toHaveBeenCalled()
  })

  it('aguardando vaga: não corrige o CI', async () => {
    mocks.find.mockResolvedValue([{ ...workbench(), pendingTurn: { action: 'pr-conflict' } }])
    github(unstable)
    await watchPullRequests()
    expect(mocks.ciFix).not.toHaveBeenCalled()
  })
})
