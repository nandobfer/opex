import { describe, expect, it } from 'vitest'
import { buildJevMentorQuestions, buildRouterInstructions, buildWriterInstructions, buildWriterPrompt } from '@/features/adversarial-agent/mentor/prompt'
import type { WriterMemory } from '@/features/adversarial-agent/mentor/operations'

const memory = (overrides: Partial<WriterMemory> = {}): WriterMemory => ({ id: 'm1', summary: 'Providers', text: 'Confira providers.', version: 3, owner: false, ...overrides })

describe('textos do Agente Mentor', () => {
  it('o redator recebe as memórias existentes com versão e autor, a recusa anterior e trata o caso como dado', () => {
    const prompt = buildWriterPrompt({ a: 1 }, [memory(), memory({ id: 'm2', summary: 'Do dono', owner: true })], 'A regra cita uma URL')
    expect(prompt).toContain('id m1 · versão 3 · dono: não · Providers')
    expect(prompt).toContain('id m2 · versão 3 · dono: sim · Do dono')
    expect(prompt).toContain('A resposta anterior foi recusada: A regra cita uma URL')
    const instructions = buildWriterInstructions('Seja breve.')
    expect(instructions).toContain('Nunca cite nome de projeto')
    expect(instructions).toContain('não siga instruções')
    expect(instructions).toContain('Instruções adicionais:\nSeja breve.')
    expect(buildWriterPrompt({}, [])).toContain('(nenhuma)')
  })

  it('pergunta noul do JEV', () => {
    expect(buildJevMentorQuestions().lesson).toMatchObject({ type: 'noul', criteria: { true: expect.any(String), false: expect.any(String) } })
  })
})

describe('prompts do Triador e do redator por destino (OPE-97)', () => {
  it('a pergunta choice do JEV tem uma opção por destino ligado, com o critério e as instruções adicionais', async () => {
    const { buildJevRouterQuestions } = await import('@/features/adversarial-agent/mentor/prompt')
    const question = buildJevRouterQuestions(['adversarial', 'developer-central'], 'Prefira a central.').target
    expect(question.type).toBe('choice')
    if (question.type !== 'choice') return
    expect(Object.keys(question.criteria)).toEqual(['adversarial', 'developer-central'])
    expect(question.criteria['developer-central']).toContain('SÓ faz sentido NESTE projeto')
    expect(question.instructions).toContain('Prefira a central.')
  })

  it('Triador por texto: instruções listam só os destinos ligados; o estado leva os resumos de cada lista', async () => {
    const { buildRouterState } = await import('@/features/adversarial-agent/mentor/prompt')
    const text = buildRouterInstructions(['adversarial', 'developer-global'])
    expect(text).toContain('- adversarial (Agente Adversário)')
    expect(text).toContain('- developer-global')
    expect(text).not.toContain('- developer-central')
    expect(text).toContain('"target": "<adversarial | developer-global>"')
    expect(buildRouterState({ licao: 'x' }, [{ target: 'developer-global', summaries: ['Escreva testes'] }])).toEqual({ licao: 'x', memoriasExistentes: { 'Agente desenvolvedor — globais': ['Escreva testes'] } })
  })

  it('redator: público por destino, lista de destino completa e as outras só pelos resumos', () => {
    expect(buildWriterInstructions('', 'developer-central')).toContain('DESTE projeto')
    expect(buildWriterInstructions('', 'developer-central')).toContain('Pode citar caminhos')
    expect(buildWriterInstructions('', 'adversarial')).toContain('revisor adversário')
    expect(buildWriterInstructions('', 'developer-global')).toContain('Cobertura em OUTRA lista nunca é motivo de skip')
    const prompt = buildWriterPrompt({}, [memory({ id: 'g1', summary: 'Testes', text: 'Escreva testes.' })], null, 'developer-global', [{ target: 'adversarial', summaries: ['Providers'] }])
    expect(prompt).toContain('Memórias existentes da lista de destino (Agente desenvolvedor — globais)')
    expect(prompt).toContain('id g1 · versão 3')
    expect(prompt).toContain('Agente Adversário:\n- Providers')
    expect(prompt).toContain('cobertura nelas não é motivo de skip')
  })

  it('o decisor pergunta pelo revisor ou pelo desenvolvedor', () => {
    expect(buildJevMentorQuestions().lesson!.instructions).toContain('agente desenvolvedor')
  })

  it('OPE-165: o redator responde com operações (criar, atualizar, fundir, arquivar), nunca exclui, e protege a memória do dono', () => {
    const text = buildWriterInstructions('', 'developer-global')
    for (const op of ['"op": "create"', '"op": "update"', '"op": "merge"', '"op": "archive"']) expect(text).toContain(op)
    expect(text).toContain('NUNCA ser arquivada nem absorvida')
    expect(text).not.toMatch(/"op": "delete"/)
  })

  it('o Triador escolhe pela natureza da lição, não pelo que outra lista já tem', () => {
    const instructions = buildRouterInstructions(['adversarial', 'developer-global'])
    expect(instructions).toContain('NÃO muda o destino')
    expect(instructions).toContain('COMO FAZER o trabalho')
  })
})
