import { describe, expect, it } from 'vitest'
import { buildJevMentorQuestions, buildMentorState, buildWriterInstructions, buildWriterPrompt, type MentorCase } from '@/features/adversarial-agent/mentor/prompt'
import { DEFAULT_MENTOR_SETTINGS } from '@/features/adversarial-agent/mentor/schemas'

const caseOf = (overrides: Partial<MentorCase> = {}): MentorCase => ({
  sources: ['user', 'developer'],
  trigger: 'preview_correction',
  userMessage: 'Salvar o modelo derrubou o app',
  responses: [{ stage: 'implementing', text: 'Faltava o TooltipProvider' }],
  lessons: [{ problem: 'Crash', shouldHaveCaught: 'Provider ausente', why: 'Genérico' }],
  task: { code: 'OPE-746', title: 'Modelos' },
  adversarialVerdict: { summary: 'Aprovado', findings: [] },
  approvedPlan: '# Plano',
  ...overrides,
})

describe('textos do Agente Mentor', () => {
  it('o estado respeita as chaves de contexto', () => {
    const full = buildMentorState(caseOf(), DEFAULT_MENTOR_SETTINGS.context)
    expect(full).toMatchObject({ tipoDaMensagem: 'Correção da prévia', mensagemDoUsuario: 'Salvar o modelo derrubou o app', tarefa: { codigo: 'OPE-746' } })
    expect(full).not.toHaveProperty('planoAprovado')
    const none = buildMentorState(caseOf(), { userMessage: false, agentResponse: false, developerRequest: false, taskBasics: false, adversarialVerdict: false, approvedPlan: true })
    expect(Object.keys(none).sort()).toEqual(['origem', 'planoAprovado', 'tipoDaMensagem'])
  })

  it('corta respostas longas pelo fim', () => {
    const long = 'a'.repeat(30_000) + 'FIM'
    const state = buildMentorState(caseOf({ responses: [{ stage: 'implementing', text: long }] }), DEFAULT_MENTOR_SETTINGS.context)
    const text = (state.respostasDoAgente as { texto: string }[])[0]!.texto
    expect(text.length).toBeLessThan(13_000)
    expect(text.endsWith('FIM')).toBe(true)
  })

  it('o redator recebe as memórias existentes, a recusa anterior e trata o caso como dado', () => {
    const prompt = buildWriterPrompt({ a: 1 }, [{ id: 'm1', summary: 'Providers', text: 'Confira providers.' }], 'A regra cita uma URL')
    expect(prompt).toContain('id m1 · Providers')
    expect(prompt).toContain('A regra anterior foi recusada: A regra cita uma URL')
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
    expect(question.criteria['developer-central']).toContain('DESTE projeto')
    expect(question.instructions).toContain('Prefira a central.')
  })

  it('Triador por texto: instruções listam só os destinos ligados; o estado leva os resumos de cada lista', async () => {
    const { buildRouterInstructions, buildRouterState } = await import('@/features/adversarial-agent/mentor/prompt')
    const text = buildRouterInstructions(['adversarial', 'developer-global'])
    expect(text).toContain('- adversarial (Agente Adversário)')
    expect(text).toContain('- developer-global')
    expect(text).not.toContain('- developer-central')
    expect(text).toContain('"target": "<adversarial | developer-global>"')
    expect(buildRouterState({ origem: [] }, [{ target: 'developer-global', summaries: ['Escreva testes'] }])).toEqual({ origem: [], memoriasExistentes: { 'Agente desenvolvedor — globais': ['Escreva testes'] } })
  })

  it('redator: público por destino, lista de destino completa e as outras só pelos resumos', () => {
    expect(buildWriterInstructions('', 'developer-central')).toContain('DESTE projeto')
    expect(buildWriterInstructions('', 'developer-central')).toContain('Pode citar caminhos')
    expect(buildWriterInstructions('', 'adversarial')).toContain('revisor adversário')
    expect(buildWriterInstructions('', 'developer-global')).toContain('nunca grave a mesma regra em duas listas')
    const prompt = buildWriterPrompt({}, [{ id: 'g1', summary: 'Testes', text: 'Escreva testes.' }], null, 'developer-global', [{ target: 'adversarial', summaries: ['Providers'] }])
    expect(prompt).toContain('Memórias existentes da lista de destino (Agente desenvolvedor — globais)')
    expect(prompt).toContain('id g1 · Testes')
    expect(prompt).toContain('Agente Adversário:\n- Providers')
  })

  it('o decisor pergunta pelo revisor ou pelo desenvolvedor', () => {
    expect(buildJevMentorQuestions().lesson!.instructions).toContain('agente desenvolvedor')
  })
})
