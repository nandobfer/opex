import { describe, expect, it } from 'vitest'
import { MENTOR_LEVELS } from '@/features/adversarial-agent/mentor/constants'
import { mentorThreshold, parseDeciderAnswer, parseWriterAnswer, passesThreshold, resolveWriterAction } from '@/features/adversarial-agent/mentor/decision'

describe('decisões do Agente Mentor', () => {
  it('limiar sobe do Generoso ao Implacável; a nota no limiar passa', () => {
    const thresholds = MENTOR_LEVELS.map(mentorThreshold)
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b))
    expect(mentorThreshold('balanced')).toBe(0.65)
    expect(passesThreshold(0.65, 'balanced')).toBe(true)
    expect(passesThreshold(0.64, 'balanced')).toBe(false)
    expect(passesThreshold(0.7, 'relentless')).toBe(false)
  })

  it('lê a nota do decisor (com ou sem cerca json) e recusa resposta inválida', () => {
    expect(parseDeciderAnswer('```json\n{"score": 0.8, "reason": "genérico"}\n```')).toEqual({ score: 0.8, reason: 'genérico' })
    expect(parseDeciderAnswer('Nota: {"score": "0.3"}')).toEqual({ score: 0.3, reason: '' })
    expect(parseDeciderAnswer('{"score": 3}')).toBeNull()
    expect(parseDeciderAnswer('sem json')).toBeNull()
  })

  it('lê create, update e skip do redator', () => {
    expect(parseWriterAnswer('{"action":"create","text":"Regra nova","reason":"novo"}')).toEqual({ action: 'create', text: 'Regra nova', reason: 'novo' })
    expect(parseWriterAnswer('{"action":"update","memoryId":"m1","text":"Regra fundida"}')).toMatchObject({ action: 'update', memoryId: 'm1' })
    expect(parseWriterAnswer('{"action":"skip","reason":"já coberta"}')).toEqual({ action: 'skip', reason: 'já coberta' })
    expect(parseWriterAnswer('{"action":"update","text":"sem id"}')).toBeNull()
    expect(parseWriterAnswer('{"action":"apagar"}')).toBeNull()
  })

  it('update de memória que não existe mais vira create', () => {
    expect(resolveWriterAction({ action: 'update', memoryId: 'm1', text: 'R', reason: '' }, ['m1'])).toEqual({ action: 'update', memoryId: 'm1', text: 'R' })
    expect(resolveWriterAction({ action: 'update', memoryId: 'm9', text: 'R', reason: '' }, ['m1'])).toEqual({ action: 'create', memoryId: null, text: 'R' })
  })
})
