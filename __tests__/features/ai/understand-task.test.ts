import { describe, expect, it } from 'vitest'
import type { TaskDetailDto } from '@/features/tasks/types'
import { buildUnderstandTaskInstructions, buildUnderstandTaskPrompt } from '@/features/ai/understand-task'
import { applyUnderstandEvent, finishUnderstandStream, INITIAL_UNDERSTAND_STATE } from '@/features/ai/understand-stream'
import { DEFAULT_UNDERSTAND_TASK_SETTINGS } from '@/features/ai/schemas'

const task = (overrides: Partial<TaskDetailDto> = {}): TaskDetailDto => ({
  id: 't1',
  code: 'OPX-42',
  columnId: 'doing',
  order: 0,
  title: 'Exportar pedidos',
  taskType: 'feature',
  priority: 'high',
  archived: false,
  project: { id: 'p1', name: 'Portal', repo: 'sipal/portal', sigla: 'POR' },
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: null,
  description: 'Gerar CSV dos pedidos do dia',
  technicalSpec: 'Usar streaming',
  comments: [{ id: 'c1', content: 'Usar ponto e vírgula', createdAt: '2026-10-02T12:00:00.000Z' }],
  history: [{ id: 'h1', action: 'movida', description: 'Moveu para A fazer', createdAt: '2026-10-02T13:00:00.000Z' }],
  timeLogs: [{ id: 'l1', startTime: '2026-10-03T12:00:00.000Z', endTime: null, duration: 30, description: 'Análise', active: false, agent: 'plan', model: null, costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }],
  totalTimeLogged: 30,
  ...overrides,
})

describe('entrada de "Entender tarefas"', () => {
  it('envia os dados principais, descrição e especificação técnica', () => {
    const prompt = buildUnderstandTaskPrompt(task(), DEFAULT_UNDERSTAND_TASK_SETTINGS.include)
    expect(prompt).toContain('# Tarefa OPX-42: Exportar pedidos')
    expect(prompt).toContain('- Tipo: ')
    expect(prompt).toContain('- Projeto: Portal')
    expect(prompt).toContain('Gerar CSV dos pedidos do dia')
    expect(prompt).toContain('Usar streaming')
    expect(prompt).toContain('- Horas apontadas: 0.5 h')
  })

  it('comentários, histórico e apontamentos só entram quando ligados', () => {
    const all = buildUnderstandTaskPrompt(task(), { comments: true, history: true, timeLogs: true })
    expect(all).toContain('Usar ponto e vírgula')
    expect(all).toContain('Moveu para A fazer')
    expect(all).toContain('(30 min): Análise')

    const none = buildUnderstandTaskPrompt(task(), { comments: false, history: false, timeLogs: false })
    for (const text of ['Usar ponto e vírgula', 'Moveu para A fazer', 'Análise']) expect(none).not.toContain(text)
  })

  it('textos longos são cortados', () => {
    const prompt = buildUnderstandTaskPrompt(task({ description: 'x'.repeat(7000) }), DEFAULT_UNDERSTAND_TASK_SETTINGS.include)
    expect(prompt).toContain('… (cortado)')
  })

  it('contexto integral (mesa e refinamento) envia descrição e especificação inteiras', () => {
    const long = 'y'.repeat(7000)
    const full = buildUnderstandTaskPrompt(task({ description: long, technicalSpec: long }), DEFAULT_UNDERSTAND_TASK_SETTINGS.include, { fullText: true })
    expect(full).toContain(long)
    expect(full).not.toContain('cortado')
  })

  it('instruções: seções fixas ou texto livre', () => {
    const sections = buildUnderstandTaskInstructions({ instructions: 'Seja claro.', responseFormat: 'sections' })
    expect(sections.startsWith('Seja claro.')).toBe(true)
    expect(sections).toContain('Resumo; O que precisa ser feito; Pontos de atenção e riscos; Dúvidas para o solicitante')
    expect(buildUnderstandTaskInstructions({ instructions: 'Seja claro.', responseFormat: 'free' })).toContain('organizando o texto como achar melhor')
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
