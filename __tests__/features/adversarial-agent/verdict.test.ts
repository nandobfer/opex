import { describe, expect, it } from 'vitest'
import { countBySeverity, evaluateFindings, parseDisputes, parseReviewOutput, reachesThreshold, sortFindings, type RawFinding } from '@/features/adversarial-agent/verdict'

const finding = (overrides: Partial<RawFinding> = {}): RawFinding => ({
  id: 'F1',
  severity: 'high',
  category: 'bug',
  title: 'Falha ao salvar',
  file: 'src/a.ts',
  line: 10,
  evidence: 'await save()',
  scenario: 'Quando o usuário salva sem rede',
  suggestion: 'Tratar o erro',
  inDiff: true,
  carriedOver: false,
  introducedByFix: false,
  ...overrides,
})

describe('parseReviewOutput', () => {
  it('lê o último bloco JSON, descarta achados inválidos e ids repetidos', () => {
    const output = [
      'Resumo da revisão.',
      '```json',
      JSON.stringify({ summary: 'Um bug', findings: [finding(), finding({ title: 'repetido' }), { id: 'F2', severity: 'gigante', title: 'sev inválida vira nit' }, { severity: 'high' }], previous: [{ id: 'F0', status: 'resolved' }] }),
      '```',
    ].join('\n')
    const parsed = parseReviewOutput(output)!
    expect(parsed.summary).toBe('Um bug')
    expect(parsed.findings.map((item) => item.id)).toEqual(['F1', 'F2'])
    expect(parsed.findings[0]!.title).toBe('Falha ao salvar')
    expect(parsed.findings[1]!.severity).toBe('nit')
    expect(parsed.previous).toEqual([{ id: 'F0', status: 'resolved', note: '' }])
  })

  it('sem JSON é null (a rodada falha)', () => {
    expect(parseReviewOutput('Achei problemas, mas esqueci o formato.')).toBeNull()
  })
})

describe('evaluateFindings · o app decide o bloqueio', () => {
  it('cada nível bloqueia a partir da sua severidade', () => {
    expect(reachesThreshold('high', 'liberal')).toBe(false)
    expect(reachesThreshold('critical', 'liberal')).toBe(true)
    expect(reachesThreshold('medium', 'balanced')).toBe(true)
    expect(reachesThreshold('low', 'balanced')).toBe(false)
    expect(reachesThreshold('nit', 'relentless')).toBe(true)
  })

  it('abaixo do limiar vira sugestão sem motivo de trava', () => {
    const [result] = evaluateFindings([finding({ severity: 'low' })], 'balanced', 1)
    expect(result).toMatchObject({ blocking: false, demotedReason: null })
  })

  it('travas: estilo fora do Implacável, fora do diff e sem evidência concreta não bloqueiam', () => {
    const results = evaluateFindings(
      [finding({ id: 'S', category: 'style', severity: 'critical' }), finding({ id: 'D', inDiff: false }), finding({ id: 'E', scenario: '' })],
      'strict',
      1,
    )
    expect(results.map((item) => item.blocking)).toEqual([false, false, false])
    expect(results.map((item) => item.demotedReason)).toEqual(['Estilo só bloqueia no nível Implacável', 'Fora do código alterado nesta mesa', 'Sem arquivo, evidência e cenário concretos'])
    expect(evaluateFindings([finding({ category: 'style', severity: 'nit' })], 'relentless', 1)[0]!.blocking).toBe(true)
  })

  it('rodada de correção: achado novo só bloqueia se crítico ou criado pela correção', () => {
    const results = evaluateFindings(
      [finding({ id: 'N' }), finding({ id: 'C', carriedOver: true }), finding({ id: 'X', introducedByFix: true }), finding({ id: 'K', severity: 'critical' })],
      'balanced',
      2,
    )
    expect(results.map((item) => [item.id, item.blocking])).toEqual([
      ['N', false],
      ['C', true],
      ['X', true],
      ['K', true],
    ])
  })

  it('ordena bloqueantes primeiro e conta por severidade', () => {
    const results = evaluateFindings([finding({ id: 'L', severity: 'low' }), finding({ id: 'H' })], 'balanced', 1)
    expect(sortFindings(results).map((item) => item.id)).toEqual(['H', 'L'])
    expect(countBySeverity(results)).toEqual({ critical: 0, high: 1, medium: 0, low: 1, nit: 0 })
  })
})

describe('parseDisputes', () => {
  it('lê as contestações do implementador; sem bloco, lista vazia', () => {
    expect(parseDisputes('Corrigi F1.\n```json\n{"disputes":[{"id":"F2","reason":"É intencional"}]}\n```')).toEqual([{ id: 'F2', reason: 'É intencional' }])
    expect(parseDisputes('Corrigi tudo.')).toEqual([])
  })
})
