import { describe, expect, it } from 'vitest'
import { buildCaseState, MENTOR_DIGEST_INSTRUCTIONS, MENTOR_DIGEST_MAX_CASES, parseDigestAnswer } from '@/features/adversarial-agent/mentor/digest'

/** OPE-165: casos extraídos pelo digestor do Agente Mentor. */

const caseJson = (overrides: Record<string, unknown> = {}) => ({ lesson: 'Extraia o componente compartilhado antes de reaproveitar o layout', evidence: ['Não copie o markup'], nature: 'negative', scope: 'this_project', detection: 'Procure markup duplicado no diff', ...overrides })

describe('digestor do Agente Mentor', () => {
  it('lê os casos (com cerca json e objetos aninhados)', () => {
    const parsed = parseDigestAnswer(`Segue:\n\`\`\`json\n${JSON.stringify({ cases: [caseJson(), caseJson({ nature: 'positive', scope: 'any_project', detection: null })] })}\n\`\`\``)
    expect(parsed).toHaveLength(2)
    expect(parsed![0]).toMatchObject({ nature: 'negative', scope: 'this_project', detection: 'Procure markup duplicado no diff' })
  })

  it('ignora casos sem evidência ou inválidos e devolve null sem o JSON', () => {
    expect(parseDigestAnswer(JSON.stringify({ cases: [caseJson({ evidence: [] }), caseJson({ nature: 'talvez' }), caseJson()] }))).toHaveLength(1)
    expect(parseDigestAnswer(JSON.stringify({ cases: [] }))).toEqual([])
    expect(parseDigestAnswer('sem json')).toBeNull()
  })

  it('limita a quantidade de casos ao teto técnico', () => {
    const many = Array.from({ length: MENTOR_DIGEST_MAX_CASES + 5 }, () => caseJson())
    expect(parseDigestAnswer(JSON.stringify({ cases: many }))).toHaveLength(MENTOR_DIGEST_MAX_CASES)
  })

  it('as instruções pedem lição negativa, evidência e proíbem hipótese abandonada e achado recusado', () => {
    expect(MENTOR_DIGEST_INSTRUCTIONS).toContain('NEGATIVAS')
    expect(MENTOR_DIGEST_INSTRUCTIONS).toContain('evidência citada')
    expect(MENTOR_DIGEST_INSTRUCTIONS).toContain('hipótese que o agente abandonou')
    expect(MENTOR_DIGEST_INSTRUCTIONS).toContain('recusado')
  })

  it('estado do caso para o decisor e o Triador', () => {
    expect(buildCaseState(caseJson() as never, { code: 'OPE-1', title: 'T' })).toMatchObject({ tarefa: { codigo: 'OPE-1' }, natureza: 'Negativa', escopo: 'Só este projeto', comoDetectar: 'Procure markup duplicado no diff' })
  })
})
