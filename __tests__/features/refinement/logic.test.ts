import { describe, expect, it } from 'vitest'

import { REFINEMENT_PROTOCOL, REFINEMENT_SPEC_HEADING } from '@/features/refinement/constants'
import { extractTechnicalSpec, refinementWaitingReason } from '@/features/refinement/logic'
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

  it('aceita variantes do título (nível, caixa e acento)', () => {
    expect(extractTechnicalSpec('### Especificação Técnica\n\nalgo')).toBe('algo')
    expect(extractTechnicalSpec('## Especificacao tecnica\n\nalgo')).toBe('algo')
    expect(extractTechnicalSpec('####   ESPECIFICAÇÃO   TÉCNICA\n\nalgo\n\n##### sub\nmais')).toBe('algo\n\n##### sub\nmais')
  })

  it('não confunde um título de nível superior com a seção', () => {
    // `### Especificação técnica` termina no próximo `## ` (nível igual ou mais alto).
    const text = '### Especificação técnica\n\nespecificação\n\n## Outra seção\nignorar'
    expect(extractTechnicalSpec(text)).toBe('especificação')
  })

  it('sem a seção ou com corpo vazio, devolve null', () => {
    expect(extractTechnicalSpec('texto sem a seção')).toBeNull()
    expect(extractTechnicalSpec(`${REFINEMENT_SPEC_HEADING}\n\n   `)).toBeNull()
    expect(extractTechnicalSpec('')).toBeNull()
  })
})

describe('REFINEMENT_PROTOCOL', () => {
  it('manda usar a ferramenta de perguntas `question` e não escrever as perguntas como texto', () => {
    expect(REFINEMENT_PROTOCOL).toContain('`question`')
    expect(REFINEMENT_PROTOCOL).toContain('NUNCA escreva as perguntas como texto')
  })

  it('exige a cobertura de aceite, localização e edge cases sob o título canônico', () => {
    expect(REFINEMENT_PROTOCOL).toContain('critérios de aceite')
    expect(REFINEMENT_PROTOCOL).toContain('localização da mudança')
    expect(REFINEMENT_PROTOCOL).toContain('casos de borda')
    expect(REFINEMENT_PROTOCOL).toContain(REFINEMENT_SPEC_HEADING)
  })
})

describe('refinementWaitingReason', () => {
  const base = { runState: 'idle' as const, pendingPermissions: 0, pendingForms: 0, resolved: false }

  it('não espera nada enquanto o agente trabalha', () => {
    expect(refinementWaitingReason({ ...base, runState: 'running' })).toBeNull()
  })

  it('aguardando pergunta/permissão tem prioridade sobre o restante', () => {
    expect(refinementWaitingReason({ ...base, pendingForms: 1 })).toContain('responder uma pergunta')
    expect(refinementWaitingReason({ ...base, pendingPermissions: 1 })).toContain('permitir uma ação')
  })

  it('esclarecido quando resolvido', () => {
    expect(refinementWaitingReason({ ...base, resolved: true })).toContain('esclarecida')
  })

  it('parou sem concluir quando ocioso e sem a especificação', () => {
    expect(refinementWaitingReason(base)).toContain('use Continuar')
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

  it('inclui a tarefa em Markdown e o convite à primeira rodada pela ferramenta de perguntas', () => {
    const prompt = buildRefinementPrompt(task, DEFAULT_TASK_REFINEMENT_SETTINGS.include)
    expect(prompt).toContain('# Tarefa OPX-1: Ajustar login')
    expect(prompt).toContain('Ajustar a tela de login.')
    expect(prompt).toContain('primeira rodada de perguntas')
    expect(prompt).toContain('question')
  })

  it('respeita o que enviar (sem comentários)', () => {
    const prompt = buildRefinementPrompt(task, { comments: false, history: false })
    expect(prompt).not.toContain('Usar tokens')
  })
})
