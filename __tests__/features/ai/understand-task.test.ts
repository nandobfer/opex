import { describe, expect, it } from 'vitest'
import type { TaskDetailDto } from '@/features/tasks/types'
import { buildUnderstandDraftPrompt, buildUnderstandTaskInstructions, buildUnderstandTaskPrompt, type UnderstandDraftInput } from '@/features/ai/understand-task'
import { applyUnderstandEvent, finishUnderstandStream, INITIAL_UNDERSTAND_STATE } from '@/features/ai/understand-stream'
import { DEFAULT_UNDERSTAND_TASK_SETTINGS } from '@/features/ai/schemas'

const task = (overrides: Partial<TaskDetailDto> = {}): TaskDetailDto => ({
  id: 't1',
  code: 'GO-DEV-42',
  title: 'Exportar pedidos',
  status: 'development',
  order: 0,
  taskType: 'feature',
  priority: 'high',
  product: { id: 'p1', name: 'Portal' },
  workPackage: null,
  assignee: null,
  commitUrl: null,
  pullRequestUrl: null,
  archived: false,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: null,
  description: 'Gerar CSV dos pedidos do dia',
  technicalSpec: null,
  businessContext: 'Financeiro precisa conciliar',
  acceptanceCriteria: ['Arquivo com cabeçalho'],
  createdBy: { id: 'u1', name: 'Ana' },
  linkedRequest: null,
  linkedImprovement: null,
  implementationPlan: { steps: ['Criar rota', 'Gerar CSV'], complexity: 'low', relatedFiles: ['src/x.ts'], generatedAt: null, generatedBy: null },
  comments: [{ id: 'c1', content: 'Usar ponto e vírgula', author: { id: 'u2', name: 'Bruno', email: null }, createdAt: '2026-10-02T12:00:00.000Z' }],
  history: [{ id: 'h1', action: 'status', description: 'Moveu para A fazer', performedBy: { id: 'u1', name: 'Ana' }, createdAt: '2026-10-02T13:00:00.000Z' }],
  attachments: [{ id: 'a1', name: 'layout.xlsx', size: 10, createdAt: null }],
  timeLogs: [{ id: 'l1', user: null, startTime: '2026-10-03T12:00:00.000Z', endTime: null, duration: 30, description: 'Análise', active: false }],
  totalTimeLogged: 30,
  platformUrl: 'https://go.sipal.com.br/x',
  ...overrides,
})

describe('entrada de "Entender tarefas"', () => {
  it('envia os dados principais, descrição, contexto, critérios e os nomes dos anexos', () => {
    const prompt = buildUnderstandTaskPrompt(task(), DEFAULT_UNDERSTAND_TASK_SETTINGS.include)
    expect(prompt).toContain('# Tarefa GO-DEV-42: Exportar pedidos')
    expect(prompt).toContain('- Tipo: ')
    expect(prompt).toContain('- Produto: Portal')
    expect(prompt).toContain('Gerar CSV dos pedidos do dia')
    expect(prompt).toContain('Financeiro precisa conciliar')
    expect(prompt).toContain('- Arquivo com cabeçalho')
    expect(prompt).toContain('- layout.xlsx')
    expect(prompt).not.toContain('## Especificação técnica')
  })

  it('comentários, histórico, apontamentos e plano só entram quando ligados', () => {
    const all = buildUnderstandTaskPrompt(task(), { comments: true, history: true, timeLogs: true, plan: true })
    expect(all).toContain('Usar ponto e vírgula')
    expect(all).toContain('Moveu para A fazer')
    expect(all).toContain('(30 min): Análise')
    expect(all).toContain('1. Criar rota')

    const none = buildUnderstandTaskPrompt(task(), { comments: false, history: false, timeLogs: false, plan: false })
    for (const text of ['Usar ponto e vírgula', 'Moveu para A fazer', 'Análise', 'Criar rota']) expect(none).not.toContain(text)
  })

  it('textos longos são cortados', () => {
    const prompt = buildUnderstandTaskPrompt(task({ description: 'x'.repeat(7000) }), DEFAULT_UNDERSTAND_TASK_SETTINGS.include)
    expect(prompt).toContain('… (cortado)')
  })

  it('instruções: seções fixas ou texto livre', () => {
    const sections = buildUnderstandTaskInstructions({ instructions: 'Seja claro.', responseFormat: 'sections' })
    expect(sections.startsWith('Seja claro.')).toBe(true)
    expect(sections).toContain('Resumo; O que precisa ser feito; Pontos de atenção e riscos; Dúvidas para o solicitante')
    expect(buildUnderstandTaskInstructions({ instructions: 'Seja claro.', responseFormat: 'free' })).toContain('organizando o texto como achar melhor')
  })
})

const draft = (overrides: Partial<UnderstandDraftInput> = {}): UnderstandDraftInput => ({
  code: 'GH-7',
  title: 'Botão de exportar',
  body: 'Quero exportar pedidos ![print](https://github.com/x.png)',
  issueTitle: 'Botão de exportar',
  issueBody: 'Quero exportar pedidos ![print](https://github.com/x.png)',
  repo: 'sipal/portal',
  number: 7,
  issueState: 'open',
  author: { login: 'ana', name: 'Ana', avatarUrl: null, developerName: 'Ana' },
  labels: ['bug'],
  issueType: 'Bug',
  milestone: null,
  assignees: ['bruno'],
  product: { id: 'p1', name: 'Portal' },
  taskType: 'bugfix',
  priority: 'urgent',
  assignee: null,
  workPackage: { id: 'w1', name: 'Sprint 3' },
  columnName: 'Triagem',
  imageCount: 1,
  comments: [{ id: 'c1', author: { login: 'bruno', name: null, avatarUrl: null }, body: 'Só no Chrome', createdAt: '2026-10-02T12:00:00.000Z' }],
  issueCreatedAt: '2026-10-01T12:00:00.000Z',
  ...overrides,
})

describe('entrada de "Entender tarefas" para rascunhos', () => {
  it('envia dados da issue, campos mapeados, corpo, contagem de imagens e comentários da issue', () => {
    const prompt = buildUnderstandDraftPrompt(draft(), { comments: true })
    expect(prompt).toContain('# Rascunho GH-7: Botão de exportar')
    expect(prompt).toContain('ainda não enviada ao Go! Sipal')
    expect(prompt).toContain('- Origem: issue sipal/portal#7 (aberta)')
    expect(prompt).toContain('- Autor da issue: Ana (@ana)')
    expect(prompt).toContain('- Labels: bug')
    expect(prompt).toContain('- Assignees no GitHub: @bruno')
    expect(prompt).toContain('- Prioridade: ')
    expect(prompt).toContain('- Pacote de trabalho: Sprint 3')
    expect(prompt).toContain('Quero exportar pedidos')
    expect(prompt).toContain('1 imagem(ns) no corpo da issue não foram enviadas.')
    expect(prompt).toContain('### @bruno')
    expect(prompt).toContain('Só no Chrome')
    // Sem edição, não repete o texto original.
    expect(prompt).not.toContain('Texto original da issue')
  })

  it('texto original entra só quando o rascunho foi editado; comentários desligados ficam de fora', () => {
    const prompt = buildUnderstandDraftPrompt(draft({ title: 'Exportar pedidos em CSV', body: 'Gerar CSV' }), { comments: false })
    expect(prompt).toContain('## Texto original da issue (antes das edições do rascunho)\nTítulo: Botão de exportar')
    expect(prompt).toContain('## Descrição\nGerar CSV')
    expect(prompt).not.toContain('Só no Chrome')
  })
})

describe('estado do modal', () => {
  it('acumula o texto, acompanha ferramentas e termina com o uso', () => {
    let state = applyUnderstandEvent(INITIAL_UNDERSTAND_STATE, { type: 'start', provider: 'opencode', model: 'a/b', agent: 'build' })
    state = applyUnderstandEvent(state, { type: 'reasoning' })
    expect(state.reasoning).toBe(true)
    state = applyUnderstandEvent(state, { type: 'tool', id: 't', name: 'read', state: 'running' })
    state = applyUnderstandEvent(state, { type: 'tool', id: 't', name: 'read', state: 'done' })
    state = applyUnderstandEvent(state, { type: 'delta', text: 'Olá' })
    state = applyUnderstandEvent(state, { type: 'delta', text: '!' })
    expect(state).toMatchObject({ status: 'running', text: 'Olá!', reasoning: false, tools: [{ id: 't', state: 'done' }] })
    state = applyUnderstandEvent(state, { type: 'done', finishReason: 'stop', durationMs: 900, usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, costUsd: null } })
    expect(state).toMatchObject({ status: 'done', durationMs: 900, usage: { totalTokens: 3 } })
  })

  it('stream que acaba sem done vira erro e preserva o texto parcial', () => {
    const partial = applyUnderstandEvent({ ...INITIAL_UNDERSTAND_STATE, status: 'running' }, { type: 'delta', text: 'meio' })
    expect(finishUnderstandStream(partial)).toMatchObject({ status: 'error', text: 'meio', error: expect.stringContaining('interrompida') })
    const done = { ...partial, status: 'done' as const }
    expect(finishUnderstandStream(done)).toBe(done)
  })
})
