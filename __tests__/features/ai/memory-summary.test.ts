import { describe, expect, it } from 'vitest'
import { buildSummaryInstructions, fallbackSummary, normalizeText, parseFormattedMemory, truncateAtWord } from '@/features/ai/memory-summary'
import { SUMMARY_SAFETY_MAX_LENGTH } from '@/features/ai/constants'
import { memoryInputSchema, memorySummarySettingsSchema, DEFAULT_MEMORY_SUMMARY_SETTINGS } from '@/features/ai/schemas'

describe('Resumo de memórias (puro)', () => {
  it('interpreta o JSON do modelo, tolerando cercas e texto em volta', () => {
    expect(parseFormattedMemory('Claro!\n```json\n{"texto": "Use  pt-BR.\\n\\n\\nSempre.", "resumo": "- **Idioma** pt-BR\\nextra"}\n```')).toEqual({ texto: 'Use pt-BR.\n\nSempre.', resumo: 'Idioma pt-BR' })
    expect(parseFormattedMemory('sem json')).toBeNull()
    expect(parseFormattedMemory('{"texto": "", "resumo": "x"}')).toBeNull()
  })

  it('regressão: o resumo da IA maior que o tamanho configurado fica inteiro; só o teto de segurança corta', () => {
    const long = 'Usar o design da tarefa de referência como base visual nas próximas telas do módulo'
    expect(long.length).toBeGreaterThan(80)
    expect(parseFormattedMemory(JSON.stringify({ texto: 'Texto.', resumo: long }))?.resumo).toBe(long)
    // Acima do máximo configurável (200) continua inteiro: o teto de segurança é separado da orientação.
    const above = 'palavra '.repeat(29).trim()
    expect(above.length).toBeGreaterThan(200)
    expect(parseFormattedMemory(JSON.stringify({ texto: 'Texto.', resumo: above }))?.resumo).toBe(above)
    const runaway = parseFormattedMemory(JSON.stringify({ texto: 'Texto.', resumo: 'palavra '.repeat(200) }))!.resumo
    expect(runaway.length).toBeLessThanOrEqual(SUMMARY_SAFETY_MAX_LENGTH)
    expect(runaway.length).toBeGreaterThan(900)
    expect(runaway.endsWith('…')).toBe(true)
  })

  it('resumo de reserva: primeira frase, cortada em limite de palavra', () => {
    expect(fallbackSummary('Responda sempre em pt-BR. Seja breve.', 80)).toBe('Responda sempre em pt-BR')
    expect(truncateAtWord('integração com o provedor externo', 20)).toBe('integração com o…')
    expect(normalizeText('  a   b \r\n\r\n\r\n c ')).toBe('a b\n\nc')
  })

  it('as instruções pedem o JSON com o tamanho máximo do resumo', () => {
    expect(buildSummaryInstructions('Revise.', 60)).toContain('no máximo 60 caracteres')
  })

  it('schemas: texto de 3 a 2.000 caracteres; ligado exige provedor e modelo', () => {
    expect(memoryInputSchema.safeParse({ texto: 'ab' }).success).toBe(false)
    expect(memoryInputSchema.safeParse({ texto: 'x'.repeat(2001) }).success).toBe(false)
    expect(memoryInputSchema.safeParse({ texto: 'abc' }).success).toBe(true)
    expect(memorySummarySettingsSchema.safeParse(DEFAULT_MEMORY_SUMMARY_SETTINGS).success).toBe(true)
    expect(memorySummarySettingsSchema.safeParse({ ...DEFAULT_MEMORY_SUMMARY_SETTINGS, enabled: true }).success).toBe(false)
    expect(memorySummarySettingsSchema.safeParse({ ...DEFAULT_MEMORY_SUMMARY_SETTINGS, maxLength: 20 }).success).toBe(false)
  })
})
