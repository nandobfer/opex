import { describe, expect, it } from 'vitest'
import { buildCaseState, buildDigestPrompt, MENTOR_DIGEST_INSTRUCTIONS, MENTOR_DIGEST_MAX_CASES, parseDigestAnswer } from '@/features/adversarial-agent/mentor/digest'

/** OPE-165: casos extraídos pelo digestor do Agente Mentor. */

const caseJson = (overrides: Record<string, unknown> = {}) => ({ lesson: 'Extraia o componente compartilhado antes de reaproveitar o layout', evidence: ['Não copie o markup'], nature: 'negative', scope: 'this_project', detection: 'Procure markup duplicado no diff', ...overrides })

describe('digestor do Agente Mentor', () => {
  it('lê os casos (com cerca json e objetos aninhados)', () => {
    const parsed = parseDigestAnswer(`Segue:\n\`\`\`json\n${JSON.stringify({ cases: [caseJson(), caseJson({ nature: 'positive', scope: 'any_project', detection: null })] })}\n\`\`\``)
    expect(parsed!.cases).toHaveLength(2)
    expect(parsed!.discarded).toBe(0)
    expect(parsed!.cases[0]).toMatchObject({ nature: 'negative', scope: 'this_project', detection: 'Procure markup duplicado no diff' })
  })

  it('casos sem evidência ou inválidos saem e são contados; sem o JSON, null', () => {
    expect(parseDigestAnswer(JSON.stringify({ cases: [caseJson({ evidence: [] }), caseJson({ nature: 'talvez' }), caseJson()] }))).toMatchObject({ discarded: 2, cases: [expect.anything()] })
    expect(parseDigestAnswer(JSON.stringify({ cases: [] }))).toEqual({ cases: [], discarded: 0 })
    expect(parseDigestAnswer('sem json')).toBeNull()
  })

  it('F3: textos longos e evidências demais são cortados, não recusados', () => {
    const long = parseDigestAnswer(JSON.stringify({ cases: [caseJson({ lesson: 'L'.repeat(5000), evidence: Array.from({ length: 12 }, (_, index) => `${index}${'e'.repeat(2000)}`), detection: 'd'.repeat(3000) })] }))!
    expect(long.discarded).toBe(0)
    expect(long.cases[0]!.lesson).toHaveLength(3000)
    expect(long.cases[0]!.evidence).toHaveLength(8)
    expect(long.cases[0]!.evidence[0]).toHaveLength(1500)
    expect(long.cases[0]!.detection).toHaveLength(1500)
  })

  it('F3: acima do teto técnico (folgado), o excedente é contado em discarded', () => {
    const many = Array.from({ length: MENTOR_DIGEST_MAX_CASES + 5 }, () => caseJson())
    const parsed = parseDigestAnswer(JSON.stringify({ cases: many }))!
    expect(parsed.cases).toHaveLength(MENTOR_DIGEST_MAX_CASES)
    expect(parsed.discarded).toBe(5)
    expect(MENTOR_DIGEST_MAX_CASES).toBeGreaterThanOrEqual(100)
  })

  it('F1: um caso por lista (target sugerido) e casos de obsolescência com as memórias existentes no prompt', () => {
    expect(MENTOR_DIGEST_INSTRUCTIONS).toContain('UM CASO POR LISTA DE DESTINO')
    expect(MENTOR_DIGEST_INSTRUCTIONS).toContain('OBSOLESCÊNCIA')
    const parsed = parseDigestAnswer(JSON.stringify({ cases: [caseJson({ target: 'adversarial' }), caseJson({ target: 'inexistente' })] }))!
    expect(parsed.cases.map((item) => item.target)).toEqual(['adversarial', null])
    const prompt = buildDigestPrompt('[Dono] oi', [{ target: 'developer-central', memories: [{ id: 'm_c1', summary: 'Pasta de providers' }] }, { target: 'adversarial', memories: [] }])
    expect(prompt).toContain('developer-central (Agente desenvolvedor — da central):\n- m_c1 · Pasta de providers')
    expect(prompt).toContain('adversarial (Agente Adversário):\n(nenhuma)')
    expect(buildCaseState(caseJson({ target: 'adversarial' }) as never, { code: 'OPE-1', title: 'T' })).toMatchObject({ listaSugeridaPeloDigestor: 'Agente Adversário' })
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
