import { describe, expect, it } from 'vitest'
import {
  estimateErrors,
  suggestionOutcome,
  summarizeAdversarial,
  summarizeBudgets,
  summarizeCatalog,
  summarizeConversations,
  summarizeDiagrams,
  summarizeEstimates,
  summarizeMentor,
  summarizeRefinements,
  summarizeReviews,
  type ReviewFacts,
} from '@/features/agent-metrics/logic/agents'
import { conversationStats } from '@/features/agent-metrics/server/conversations'
import { rollupRuns } from '@/features/agent-metrics/server/usage-daily'

describe('Orçamentista', () => {
  it('erro = |real − estimada| ÷ estimada; sem estimativa, estimativa 0 ou sem horas reais fica fora', () => {
    expect(estimateErrors([{ estimatedHours: 10, realHours: 12 }, { estimatedHours: 0, realHours: 5 }, { estimatedHours: null, realHours: 3 }, { estimatedHours: 4, realHours: null }])).toEqual([0.2])
  })

  it('média do erro e % dentro da margem configurável', () => {
    const tasks = [
      { estimatedHours: 10, realHours: 12 },
      { estimatedHours: 10, realHours: 15 },
    ]
    expect(summarizeEstimates(tasks, 20)).toEqual({ base: 2, meanErrorPercent: 35, withinMarginPercent: 50 })
    expect(summarizeEstimates(tasks, 50).withinMarginPercent).toBe(100)
    expect(summarizeEstimates([], 20)).toEqual({ base: 0, meanErrorPercent: null, withinMarginPercent: null })
  })

  it('orçamentos aprovados e prévias corrigidas', () => {
    expect(summarizeBudgets([{ approved: true, corrected: false }, { approved: false, corrected: true }])).toEqual({ base: 2, approvedPercent: 50, correctedPercent: 50 })
  })
})

describe('Catalogador', () => {
  it('cobertura, tags por tarefa (média sobre todas) e tags mais usadas', () => {
    const summary = summarizeCatalog([
      { summary: 'Resumo', tags: ['api', 'bug'] },
      { summary: '  ', tags: ['api'] },
      { summary: null, tags: [] },
      { summary: 'x', tags: null },
    ])
    expect(summary).toMatchObject({ base: 4, summaryPercent: 50, tagsPercent: 50, tagsPerTask: 0.75 })
    expect(summary.topTags[0]).toEqual({ key: 'api', count: 2 })
  })
})

describe('Refinador', () => {
  it('% concluídos entre os que terminaram (em andamento fica fora), perguntas e tempo', () => {
    const summary = summarizeRefinements([
      { refinementId: 'a', startedAt: 0, completed: true, abandoned: false, questions: 4, durationMs: 7_200_000 },
      { refinementId: 'b', startedAt: 0, completed: false, abandoned: true, questions: 2, durationMs: null },
      { refinementId: 'c', startedAt: 0, completed: false, abandoned: false, questions: 0, durationMs: null },
    ])
    expect(summary).toEqual({ base: 3, completedPercent: 50, questionsPerRefinement: 2, hoursToSpec: 2 })
  })
})

describe('Adversário e Mentor', () => {
  it('% de bloqueio, rodadas por mesa, % de bloqueios ignorados e achados por categoria', () => {
    const summary = summarizeAdversarial([
      { workbenchId: 'w1', at: 0, blocked: true, decision: 'skipped', categories: ['regression', 'bug'] },
      { workbenchId: 'w1', at: 0, blocked: true, decision: 'fix-auto', categories: ['bug'] },
      { workbenchId: 'w2', at: 0, blocked: false, decision: 'approved', categories: [] },
    ])
    expect(summary).toMatchObject({ base: 3, ignoredPercent: 50, roundsPerWorkbench: 1.5 })
    expect(summary.blockedPercent).toBeCloseTo(66.67, 1)
    expect(summary.categories[0]).toEqual({ key: 'bug', count: 2 })
  })

  it('Mentor: lições registradas contra descartadas, criadas/editadas, destinos e falhas', () => {
    const summary = summarizeMentor([
      { status: 'created', target: 'developer-global' },
      { status: 'updated', target: null },
      { status: 'discarded', target: null },
      { status: 'failed', target: null },
      { status: 'running', target: null },
    ])
    expect(summary).toMatchObject({ base: 4, created: 1, updated: 1, failurePercent: 25 })
    expect(summary.lessonPercent).toBeCloseTo(66.67, 1)
    expect(summary.targets.map((item) => item.key).sort()).toEqual(['adversarial', 'developer-global'])
  })
})

describe('Revisor', () => {
  const review = (overrides: Partial<ReviewFacts>): ReviewFacts => ({ id: 'r', prKey: 'org/app#1', at: 100, state: 'done', verdict: 'changes_requested', findings: null, durationMs: null, prOutcome: 'open', replannedExact: false, replannedApprox: false, firstOfPr: false, ...overrides })

  it('aceita = pedido de mudança seguido de replanejamento; descartada = PR mergeado sem isso; fechado sem merge não conta', () => {
    expect(suggestionOutcome(review({ replannedExact: true }), 0)).toBe('accepted')
    expect(suggestionOutcome(review({ prOutcome: 'merged' }), 0)).toBe('discarded')
    expect(suggestionOutcome(review({ prOutcome: 'closed' }), 0)).toBeNull()
    expect(suggestionOutcome(review({ verdict: 'approved', prOutcome: 'merged' }), 0)).toBeNull()
  })

  it('antes do registro exato vale a aproximação por PR; depois, só o evento exato', () => {
    expect(suggestionOutcome(review({ at: 50, replannedApprox: true, prOutcome: 'merged' }), 100)).toBe('accepted')
    expect(suggestionOutcome(review({ at: 150, replannedApprox: true, prOutcome: 'merged' }), 100)).toBe('discarded')
  })

  it('% de aprovação na 1ª revisão de cada PR, achados por revisão, duração e falhas', () => {
    const summary = summarizeReviews(
      [
        review({ id: 'a', prKey: 'x#1', at: 1, verdict: 'approved', findings: 2, durationMs: 120_000, firstOfPr: true }),
        review({ id: 'b', prKey: 'x#1', at: 2, verdict: 'changes_requested', findings: 4 }),
        review({ id: 'c', prKey: 'x#2', at: 3, verdict: 'changes_requested', state: 'done', firstOfPr: true }),
        review({ id: 'd', prKey: 'x#3', at: 4, state: 'failed', verdict: null }),
      ],
      null,
    )
    expect(summary).toMatchObject({ base: 4, firstApprovalPercent: 50, findingsPerReview: 3, durationMinutes: 2, failurePercent: 25 })
  })

  it('PR cuja 1ª revisão foi antes do período não conta: a aprovada da 2ª rodada não infla a taxa', () => {
    // PR #10: 1ª revisão (pedido de mudança) fora do período; só a 2ª (aprovada) está no período.
    const summary = summarizeReviews([review({ id: 'second', prKey: 'org/app#10', verdict: 'approved', firstOfPr: false })], null)
    expect(summary.firstApprovalPercent).toBeNull()
  })
})

describe('Opex e Maddox', () => {
  it('estatística da conversa: mensagens, respostas com erro, ferramentas com falha e confirmações', () => {
    const stats = conversationStats([
      { role: 'user', kind: 'message', parts: [] },
      { role: 'assistant', kind: 'message', status: 'complete', usage: { inputTokens: 10, outputTokens: 5 }, parts: [{ type: 'tool', name: 'create_task', state: 'done', confirmation: { status: 'confirmed' } }, { type: 'tool', name: 'create_task', state: 'error' }] },
      { role: 'assistant', kind: 'message', status: 'error', parts: [{ type: 'tool', name: 'delete_task', state: 'done', confirmation: { status: 'cancelled' } }] },
      { role: 'assistant', kind: 'confirmation', parts: [] },
    ])
    expect(stats).toMatchObject({ messages: 3, replies: 2, failedReplies: 1, confirmed: 1, cancelled: 1, inputTokens: 10, outputTokens: 5 })
    expect(stats.tools[0]).toEqual({ name: 'create_task', calls: 2, failures: 1 })
  })

  it('resumo: dono × portal, % confirmadas e ranking de ferramentas com % de falha', () => {
    const summary = summarizeConversations([
      { scope: 'owner', messages: 4, tools: [{ name: 'a', calls: 3, failures: 1 }], confirmed: 3, cancelled: 1, inputTokens: 10, outputTokens: 10, costUsd: null },
      { scope: 'portal', messages: 2, tools: [{ name: 'a', calls: 1, failures: 0 }], confirmed: 0, cancelled: 0, inputTokens: 0, outputTokens: 0, costUsd: null },
    ])
    expect(summary).toMatchObject({ base: 2, owner: 1, portal: 1, messagesPerConversation: 3, confirmedPercent: 75, tokensPerConversation: 10, costPerConversation: null })
    expect(summary.tools[0]).toMatchObject({ name: 'a', calls: 4, failures: 1, failurePercent: 25 })
  })
})

describe('Arquiteto e resumo diário', () => {
  it('tamanho e duração média dos diagramas', () => {
    expect(summarizeDiagrams([{ nodes: 10, edges: 8, durationMs: 120_000 }, { nodes: 6, edges: 4, durationMs: null }])).toEqual({ base: 2, nodes: 8, edges: 6, durationMinutes: 2 })
  })

  it('agrupa execuções por agente, dia de São Paulo, cliente e repositório', () => {
    const rows = rollupRuns([
      { agent: 'revisor', finishedAt: '2026-11-03T02:30:00Z', clientId: null, projectId: 'p', ok: true, inputTokens: 1, outputTokens: 2, costUsd: 0.5, durationMs: 10 },
      { agent: 'revisor', finishedAt: '2026-11-02T12:00:00Z', clientId: null, projectId: 'p', ok: false, inputTokens: null, outputTokens: null, costUsd: null, durationMs: null },
    ])
    // 02:30 UTC do dia 3 ainda é dia 2 em São Paulo.
    expect(rows).toEqual([{ agent: 'revisor', day: '2026-11-02', clientId: null, projectId: 'p', runs: 2, failures: 1, inputTokens: 1, outputTokens: 2, costUsd: 0.5, durationMs: 10 }])
  })
})

describe('filtros de cliente e repositório', () => {
  it('sem cliente ou sem repositório, o item sai quando o filtro correspondente está ativo', async () => {
    const { matchesFilters } = await import('@/features/agent-metrics/server/context')
    expect(matchesFilters({ clientIds: [], projectIds: [] }, { clientId: null, projectId: null })).toBe(true)
    expect(matchesFilters({ clientIds: ['c1'], projectIds: [] }, { clientId: null, projectId: 'p1' })).toBe(false)
    expect(matchesFilters({ clientIds: ['c1'], projectIds: ['p1'] }, { clientId: 'c1', projectId: 'p1' })).toBe(true)
    expect(matchesFilters({ clientIds: [], projectIds: ['p1'] }, { clientId: 'c1', projectId: null })).toBe(false)
  })
})
