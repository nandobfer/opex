import { describe, expect, it } from 'vitest'

import { REFINEMENT_PROTOCOL, REFINEMENT_SPEC_HEADING } from '@/features/refinement/constants'
import { extractTechnicalSpec } from '@/features/refinement/logic'
import { buildRefinementInstructions, buildRefinementPrompt } from '@/features/refinement/prompt'
import { DEFAULT_TASK_REFINEMENT_SETTINGS } from '@/features/ai/schemas'
import type { TaskDetailDto } from '@/features/tasks/types'

describe('extractTechnicalSpec', () => {
  it('extrai o corpo da última seção de especificação técnica', () => {
    const text = `Uma introdução.\n\n${REFINEMENT_SPEC_HEADING}\n\n# Tarefa\n- critério de aceite\n- edge case`
    expect(extractTechnicalSpec(text)).toBe('# Tarefa\n- critério de aceite\n- edge case')
  })

  it('usa a última ocorrência (a especificação é reescrita a cada rodada)', () => {
    const text = `${REFINEMENT_SPEC_HEADING}\n\nversão antiga\n\n${REFINEMENT_SPEC_HEADING}\n\nversão nova`
    expect(extractTechnicalSpec(text)).toBe('versão nova')
  })

  it('para no próximo título de nível 2', () => {
    const text = `${REFINEMENT_SPEC_HEADING}\n\nespecificação\n\n## Dúvidas\n- nada`
    expect(extractTechnicalSpec(text)).toBe('especificação')
  })

  it('sem a seção ou com corpo vazio, devolve null', () => {
    expect(extractTechnicalSpec('texto sem a seção')).toBeNull()
    expect(extractTechnicalSpec(`${REFINEMENT_SPEC_HEADING}\n\n   `)).toBeNull()
  })
})

describe('buildRefinementInstructions', () => {
  it('sempre acrescenta o protocolo com a cobertura exigida (aceite, localização e edge cases)', () => {
    const instructions = buildRefinementInstructions({ instructions: 'Minhas regras.' })
    expect(instructions).toContain('Minhas regras.')
    expect(instructions).toContain(REFINEMENT_PROTOCOL)
    expect(instructions).toContain('critérios de aceite')
    expect(instructions).toContain('localização da mudança')
    expect(instructions).toContain('casos de borda')
    expect(instructions).toContain(REFINEMENT_SPEC_HEADING)
  })
})

describe('buildRefinementPrompt', () => {
  const task = {
    code: 'OPX-1',
    title: 'Ajustar login',
    taskType: null,
    priority: 'medium',
    project: { id: 'p1', name: 'Opex', repo: 'org/opex', sigla: 'OPX' },
    createdAt: null,
    issue: null,
    totalTimeLogged: 0,
    description: 'Ajustar a tela de login.',
    technicalSpec: null,
    comments: [{ id: 'c1', content: 'Usar tokens', createdAt: null }],
    history: [],
    timeLogs: [],
  } as unknown as TaskDetailDto

  it('inclui a tarefa em Markdown e o convite à primeira rodada', () => {
    const prompt = buildRefinementPrompt(task, DEFAULT_TASK_REFINEMENT_SETTINGS.include)
    expect(prompt).toContain('# Tarefa OPX-1: Ajustar login')
    expect(prompt).toContain('Ajustar a tela de login.')
    expect(prompt).toContain('primeira rodada de perguntas')
  })

  it('respeita o que enviar (sem comentários)', () => {
    const prompt = buildRefinementPrompt(task, { comments: false, history: false })
    expect(prompt).not.toContain('Usar tokens')
  })
})
