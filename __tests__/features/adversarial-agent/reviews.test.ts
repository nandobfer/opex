import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => undefined),
  publishAppEvent: vi.fn(async () => undefined),
  sessionRemove: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local', name: 'Eu' }), LOCAL_USER_ID: 'local' }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: async () => ({ session: { remove: mocks.sessionRemove } }) }))
vi.mock('@/features/adversarial-agent/server/central-options', () => ({ listCentralOptions: vi.fn(async () => [{ id: 'c1', projectName: 'App' }]) }))
vi.mock('@/features/adversarial-agent/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AdversarialReview: memoryModel(), adversarialDb: vi.fn(async () => undefined) }
})

import { AdversarialReview } from '@/features/adversarial-agent/server/models'
import { failOrphanReviews, latestWorkbenchReview, listAdversarialReviews, listWorkbenchReviews, prepareUserFix, recordSkip, removeWorkbenchReviewSessions, restoreAwaiting } from '@/features/adversarial-agent/server/reviews'
import { planRound } from '@/features/adversarial-agent/rounds'

const reviews = AdversarialReview as unknown as { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }

const blocking = (id: string) => ({ id, severity: 'high', category: 'bug', title: `Achado ${id}`, file: 'a.ts', line: 1, evidence: 'x', scenario: 'y', suggestion: 'z', inDiff: true, carriedOver: false, introducedByFix: false, blocking: true, demotedReason: null })

beforeEach(() => {
  vi.clearAllMocks()
  reviews.docs.length = 0
})

describe('decisões do usuário no bloqueio', () => {
  const awaiting = () => reviews.create({ workbenchId: 'w1', taskCode: 'OPX-1', cycle: 1, round: 2, state: 'done', decision: 'awaiting', findings: [blocking('F1'), blocking('F2'), { ...blocking('F3'), blocking: false }], createdAt: new Date() })

  it('Corrigir monta o pedido só com os bloqueantes marcados e registra a decisão', async () => {
    await awaiting()
    const text = await prepareUserFix('w1', '/w', { text: 'F2 é intencional', excluded: ['F2'] })
    expect(text).toContain('### F1')
    expect(text).not.toContain('### F2')
    expect(text).not.toContain('### F3')
    expect(text).toContain('F2 é intencional')
    expect(reviews.docs[0]).toMatchObject({ decision: 'fix-user', excluded: ['F2'], userText: 'F2 é intencional' })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'RevisaoAdversaria' }))
  })

  it('Corrigir sem nenhum achado marcado é recusado; fora do bloqueio, também', async () => {
    await awaiting()
    await expect(prepareUserFix('w1', '/w', { excluded: ['F1', 'F2'] })).rejects.toMatchObject({ status: 400 })
    reviews.docs[0]!.decision = 'approved'
    await expect(prepareUserFix('w1', '/w', {})).rejects.toMatchObject({ status: 409 })
  })

  it('a ação que não começou devolve a revisão para "aguardando"; seguir sem revisão não falha', async () => {
    await awaiting()
    await prepareUserFix('w1', '/w', {})
    await restoreAwaiting('w1')
    expect(reviews.docs[0]).toMatchObject({ decision: 'awaiting', excluded: [] })
    await recordSkip('w1')
    expect((await latestWorkbenchReview('w1'))?.decision).toBe('skipped')
    await expect(recordSkip('sem-revisao')).resolves.toBeUndefined()
  })
})

describe('rodadas da mesa (aba "Adversário")', () => {
  it('só as da mesa, da mais antiga para a mais nova, com os detalhes', async () => {
    await reviews.create({ workbenchId: 'w1', cycle: 1, round: 1, state: 'done', findings: [blocking('F1')], createdAt: new Date('2026-10-26T10:00:00Z') })
    await reviews.create({ workbenchId: 'w2', cycle: 1, round: 1, state: 'done', findings: [], createdAt: new Date('2026-10-26T10:30:00Z') })
    await reviews.create({ workbenchId: 'w1', cycle: 1, round: 2, state: 'running', findings: [], createdAt: new Date('2026-10-26T11:00:00Z') })
    const rounds = await listWorkbenchReviews('w1')
    expect(rounds.map((item) => [item.round, item.state])).toEqual([
      [1, 'done'],
      [2, 'running'],
    ])
    expect(rounds[0]!.findings.map((item) => item.id)).toEqual(['F1'])
  })
})

describe('reinício e exclusão da mesa', () => {
  it('rodada órfã (revisando sem turno vivo) vira falha, guarda a sessão para excluir e repete a mesma rodada', async () => {
    await reviews.create({ workbenchId: 'w1', taskCode: 'OPX-1', cycle: 1, round: 1, state: 'done', decision: 'fix-auto', findings: [blocking('F1')], createdAt: new Date('2026-10-26T10:00:00Z') })
    await reviews.create({ workbenchId: 'w1', taskCode: 'OPX-1', cycle: 1, round: 2, state: 'running', decision: null, sessionId: 'adv-9', findings: [], createdAt: new Date('2026-10-26T11:00:00Z') })
    await failOrphanReviews('w1', 'O app reiniciou')
    const orphan = reviews.docs.find((doc) => doc.round === 2)!
    expect(orphan).toMatchObject({ state: 'failed', decision: 'failed', error: 'O app reiniciou', sessionId: null, pendingSessionDeletion: 'adv-9' })
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('adversarial-review-updated', { workbenchId: 'w1' })
    const history = [...reviews.docs].reverse().map((doc) => ({ cycle: doc.cycle as number, round: doc.round as number, decision: doc.decision as never }))
    expect(planRound(history)).toMatchObject({ cycle: 1, round: 2 })
  })

  it('sem rodada órfã, nada muda', async () => {
    await reviews.create({ workbenchId: 'w1', cycle: 1, round: 1, state: 'done', decision: 'approved', findings: [] })
    await failOrphanReviews('w1', 'x')
    expect(reviews.docs[0]).toMatchObject({ state: 'done', decision: 'approved' })
    expect(mocks.publishAppEvent).not.toHaveBeenCalled()
  })

  it('exclusão da mesa exclui as sessões que as rodadas ainda seguram', async () => {
    await reviews.create({ workbenchId: 'w1', cycle: 1, round: 1, state: 'failed', sessionId: null, pendingSessionDeletion: 'adv-1', findings: [] })
    await reviews.create({ workbenchId: 'w2', cycle: 1, round: 1, state: 'failed', sessionId: null, pendingSessionDeletion: 'adv-2', findings: [] })
    await removeWorkbenchReviewSessions('w1')
    expect(mocks.sessionRemove).toHaveBeenCalledTimes(1)
    expect(mocks.sessionRemove).toHaveBeenCalledWith({ sessionID: 'adv-1' }, expect.anything())
    expect(reviews.docs[0]).toMatchObject({ pendingSessionDeletion: null })
    expect(reviews.docs[1]).toMatchObject({ pendingSessionDeletion: 'adv-2' })
  })
})

describe('lista paginada das rodadas (página Agente Adversário)', () => {
  const seed = async () => {
    for (let index = 0; index < 5; index += 1)
      await reviews.create({ workbenchId: `w${index}`, centralId: index < 3 ? 'c1' : 'c2', taskId: `t${index}`, taskCode: `OPX-${index}`, taskTitle: `Tarefa ${index}`, cycle: 1, round: 1, level: 'balanced', state: index === 4 ? 'failed' : 'done', decision: index === 4 ? 'failed' : 'approved', findings: [], createdAt: new Date(2026, 9, 1 + index) })
  }

  it('mais recentes primeiro, com página, total e as centrais do filtro', async () => {
    await seed()
    const first = await listAdversarialReviews({ page: 1, limit: 2 })
    expect(first.items.map((item) => item.taskCode)).toEqual(['OPX-4', 'OPX-3'])
    expect(first).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3, centrals: [{ id: 'c1', projectName: 'App' }] })
    const last = await listAdversarialReviews({ page: 3, limit: 2 })
    expect(last.items.map((item) => item.taskCode)).toEqual(['OPX-0'])
  })

  it('recorta por situação e central (o total é do recorte)', async () => {
    await seed()
    expect((await listAdversarialReviews({ states: ['failed'] })).items.map((item) => item.taskCode)).toEqual(['OPX-4'])
    const byCentral = await listAdversarialReviews({ centrals: ['c1'] })
    expect(byCentral.total).toBe(3)
    expect(byCentral.totalPages).toBe(1)
  })
})
