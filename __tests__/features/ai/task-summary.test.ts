import { describe, expect, it } from 'vitest'
import { buildTaskSummaryInstructions, buildTaskSummaryPrompt, needsSummary, taskSummarySourceHash, toSummaryLine } from '@/features/ai/task-summary'

describe('toSummaryLine', () => {
  it('pega a primeira linha com conteúdo e remove marcações de Markdown', () => {
    expect(toSummaryLine('Adiciona **botão** de exportar', 140)).toBe('Adiciona botão de exportar')
    expect(toSummaryLine('\n\nCorrige o `login`', 140)).toBe('Corrige o login')
  })

  it('descarta cercas de código', () => {
    expect(toSummaryLine('```\nCorrige o login\n```', 140)).toBe('Corrige o login')
  })

  it('colapsa espaços e corta no tamanho máximo', () => {
    expect(toSummaryLine('  a    b   ', 140)).toBe('a b')
    expect(toSummaryLine('x'.repeat(20), 10)).toBe('x'.repeat(10))
  })

  it('corta em limite de palavra quando houver espaço (não termina no meio)', () => {
    expect(toSummaryLine('Implementar agente de IA para gerar resumos', 20)).toBe('Implementar agente…')
  })

  it('saída só com espaços vira string vazia', () => {
    expect(toSummaryLine('\n   \n', 140)).toBe('')
  })
})

describe('needsSummary', () => {
  const base = { title: 'Botão de exportar', description: 'Corpo da tarefa' }

  it('sem resumo precisa gerar', () => {
    expect(needsSummary({ ...base, summary: null, summarySourceHash: null })).toBe(true)
    expect(needsSummary({ ...base, summary: '   ', summarySourceHash: 'x' })).toBe(true)
  })

  it('resumo com a mesma fonte não precisa; fonte diferente (ou hash divergente) precisa', () => {
    const hash = taskSummarySourceHash(base)
    expect(needsSummary({ ...base, summary: 'Resumo', summarySourceHash: hash })).toBe(false)
    expect(needsSummary({ ...base, summary: 'Resumo', summarySourceHash: 'outro' })).toBe(true)
    expect(needsSummary({ ...base, summary: 'Resumo', summarySourceHash: taskSummarySourceHash({ title: 'Mudou', description: 'Corpo da tarefa' }) })).toBe(true)
  })
})

describe('prompt e instruções', () => {
  it('monta o Markdown da tarefa com código, tipo, prioridade, projeto e descrição', () => {
    const prompt = buildTaskSummaryPrompt({ code: 'OPX-7', title: 'Botão de exportar', description: 'Corpo', taskType: 'feature', priority: 'high', projectName: 'Portal' })
    expect(prompt).toContain('# Tarefa OPX-7: Botão de exportar')
    expect(prompt).toContain('Nova Funcionalidade')
    expect(prompt).toContain('Portal')
    expect(prompt).toContain('## Descrição')
  })

  it('instruções pedem uma única linha no tamanho máximo escolhido', () => {
    const instructions = buildTaskSummaryInstructions({ instructions: 'Resuma a tarefa.', maxLength: 100 })
    expect(instructions).toContain('Resuma a tarefa.')
    expect(instructions).toContain('UMA única linha')
    expect(instructions).toContain('100 caracteres')
  })
})
