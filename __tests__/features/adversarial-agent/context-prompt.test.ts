import { describe, expect, it } from 'vitest'
import { buildContextSections, plannedSectionTitles, renderContext } from '@/features/adversarial-agent/context'
import { buildAdversarialInstructions, buildFixPrompt, buildReviewPrompt } from '@/features/adversarial-agent/prompt'
import { DEFAULT_ADVERSARIAL_CONTEXT, type AdversarialContext } from '@/features/adversarial-agent/schemas'
import type { TaskDetailDto } from '@/features/tasks/types'

const task = {
  id: 't1',
  code: 'OPX-1',
  title: 'Exportar CSV',
  priority: 'medium',
  taskType: null,
  project: { id: 'p1', name: 'App' },
  description: 'Exportar a lista em CSV',
  technicalSpec: 'Usar stream',
  comments: [{ authorName: 'Ana', createdAt: null, content: 'Incluir cabeçalho' }],
  history: [],
  timeLogs: [],
  attachmentsCount: 2,
  summary: 'Exporta CSV',
  tags: ['relatorios'],
} as unknown as TaskDetailDto

const attachments = [{ name: 'modelo.csv' }, { name: 'grande.zip' }]

const plans = [
  { version: 1, text: '# Plano 1', feedback: null },
  { version: 2, text: '# Plano 2', feedback: 'Faltou o cabeçalho' },
]

const with_ = (patch: (context: AdversarialContext) => void): AdversarialContext => {
  const context = structuredClone(DEFAULT_ADVERSARIAL_CONTEXT)
  patch(context)
  return context
}

describe('contexto do adversário', () => {
  it('padrão: só a tarefa essencial e os nomes dos anexos; nada da mesa', () => {
    const sections = buildContextSections(DEFAULT_ADVERSARIAL_CONTEXT, { task, plans, centralInstructions: 'Use pnpm', previous: null, attachments })
    expect(sections.map((section) => section.title)).toEqual(['Dados da tarefa', 'Descrição', 'Especificação técnica', 'Anexos'])
    expect(sections[0]!.body).toContain('- Projeto: App')
  })

  it('sem anexos (a tarefa só traz o contador), a seção Anexos não entra', () => {
    const titles = buildContextSections(DEFAULT_ADVERSARIAL_CONTEXT, { task, plans, centralInstructions: '', previous: null }).map((section) => section.title)
    expect(titles).not.toContain('Anexos')
  })

  it('cada chave liga a sua seção (plano, histórico do plano, pedido do ciclo, instruções da central, comentários, resumo)', () => {
    const context = with_((value) => {
      value.task = { ...value.task, basics: false, description: false, technicalSpec: false, comments: true, insights: true, attachments: 'none' }
      value.workbench = { approvedPlan: true, planHistory: true, cycleFeedback: true, centralInstructions: true }
    })
    const sections = buildContextSections(context, { task, plans, centralInstructions: 'Use pnpm', previous: null, attachments, tagLabels: ['Relatórios'] })
    expect(sections.map((section) => section.title)).toEqual([
      'Resumo e tags (Opex)',
      'Comentários',
      'Plano aprovado (versão 2)',
      'Versões anteriores do plano',
      'Pedido de correção deste ciclo (prévia, PR ou usuário)',
      'Instruções da central para a implementação',
    ])
    const rendered = renderContext(sections)
    expect(rendered).toContain('Faltou o cabeçalho')
    expect(rendered).toContain('- Tags: Relatórios')
    expect(rendered).toContain('### Ana')
  })

  it('anexos como arquivo marcam os que foram anexados', () => {
    const context = with_((value) => {
      value.task.attachments = 'files'
    })
    const section = buildContextSections(context, { task, plans: [], centralInstructions: '', previous: null, attachments, attachedFiles: ['modelo.csv'] }).find((item) => item.title === 'Anexos')!
    expect(section.body).toContain('📎 modelo.csv')
    expect(section.body).toContain('- grande.zip')
  })

  it('rodada anterior: achados bloqueantes e contestações só com a chave ligada', () => {
    const previous = { round: 1, findings: [{ id: 'F1', severity: 'high' as const, title: 'Sem tratamento', file: 'a.ts', line: 3, scenario: 'Sem rede', suggestion: '' }], disputes: [{ id: 'F1', reason: 'Já tratado no caller' }], userText: null }
    const on = renderContext(buildContextSections(DEFAULT_ADVERSARIAL_CONTEXT, { task: null, plans: [], centralInstructions: '', previous }))
    expect(on).toContain('Rodada anterior (1)')
    expect(on).toContain('Já tratado no caller')
    const off = with_((value) => {
      value.rounds.previousFindings = false
    })
    expect(buildContextSections(off, { task: null, plans: [], centralInstructions: '', previous })).toEqual([])
  })

  it('a aba Contexto lista as seções configuradas', () => {
    expect(plannedSectionTitles(DEFAULT_ADVERSARIAL_CONTEXT)).toContain('Anexos (só os nomes)')
    expect(plannedSectionTitles(with_((value) => (value.workbench.approvedPlan = true)))).toContain('Plano aprovado')
  })
})

describe('mensagens do adversário', () => {
  it('as instruções proíbem testes e alterações, trazem o nível e as memórias', () => {
    const text = buildAdversarialInstructions({ level: 'tolerant', instructions: 'Foque em segurança', memories: ['X é intencional'] })
    expect(text).toContain('NUNCA rode testes, build, typecheck, lint')
    expect(text).toContain('NUNCA altere arquivos')
    expect(text).toContain('Nível de criticidade: Tolerante')
    expect(text).toContain('Foque em segurança')
    expect(text).toContain('X é intencional')
  })

  it('a partir da 2ª rodada pede para conferir os anteriores e não trocar de objetivo', () => {
    const first = buildReviewPrompt({ code: 'OPX-1', title: 'CSV', worktreePath: '/w', branch: 'feat/opx-1', baseBranch: 'main', round: 1, context: '' })
    expect(first).toContain('git -C /w diff origin/main...HEAD')
    expect(first).not.toContain('Rodada 1')
    const second = buildReviewPrompt({ code: 'OPX-1', title: 'CSV', worktreePath: '/w', branch: 'feat/opx-1', baseBranch: 'main', round: 2, context: '## Dados' })
    expect(second).toContain('Rodada 2 (depois de uma correção)')
    expect(second).toContain('Não troque de objetivo')
  })

  it('o pedido de correção traz os achados, a orientação do usuário e o formato das contestações', () => {
    const text = buildFixPrompt({
      round: 1,
      worktreePath: '/w',
      userText: 'Use o helper X',
      findings: [{ id: 'F1', severity: 'high', category: 'bug', title: 'Sem tratamento', file: 'a.ts', line: 3, evidence: 'x', scenario: 'Sem rede', suggestion: 'try/catch', inDiff: true, carriedOver: false, introducedByFix: false, blocking: true, demotedReason: null }],
    })
    expect(text).toContain('### F1 · Alto · Sem tratamento')
    expect(text).toContain('Use o helper X')
    expect(text).toContain('"disputes"')
    expect(text).toContain('NÃO faça push')
  })
})
