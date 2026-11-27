import { describe, expect, it } from 'vitest'
import { listCostOf } from '@/lib/ai/pricing/compute'
import { deepseekPrice, deepseekTableModel, isDeepseekPeak, parseHolidayList } from '@/lib/ai/pricing/deepseek'

/**
 * OPE-203: tabela oficial do DeepSeek (api-docs.deepseek.com/quick_start/pricing, 26/11/2026). Pico: seg–sex, 01–04h e
 * 06–10h UTC, pelo início da chamada; fins de semana e feriados chineses (lista editável) são fora de pico.
 */

// 23/11/2026 é segunda-feira; 28/11/2026 é sábado.
const monday = (time: string) => new Date(`2026-11-23T${time}:00Z`)

describe('janela de pico do DeepSeek (UTC)', () => {
  it.each([
    ['00:59', false],
    ['01:00', true],
    ['03:59', true],
    ['04:00', false],
    ['05:59', false],
    ['06:00', true],
    ['09:59', true],
    ['10:00', false],
  ])('segunda %s → pico %s', (time, peak) => {
    expect(isDeepseekPeak(monday(time))).toBe(peak)
  })

  it('sábado e domingo são fora de pico, inclusive dentro das janelas', () => {
    expect(isDeepseekPeak(new Date('2026-11-28T02:00:00Z'))).toBe(false)
    expect(isDeepseekPeak(new Date('2026-11-29T07:00:00Z'))).toBe(false)
  })

  it('feriado chinês da lista (calendário de Pequim) é fora de pico o dia inteiro', () => {
    const holidays = parseHolidayList('2026-11-23\nlixo, 2027-01-01')
    expect([...holidays]).toEqual(['2026-11-23', '2027-01-01'])
    expect(isDeepseekPeak(monday('02:00'), holidays)).toBe(false)
    // 23/11 07:00 UTC ainda é 23/11 em Pequim; 24/11 02:00 UTC é 24/11 (fora da lista): pico.
    expect(isDeepseekPeak(monday('07:00'), holidays)).toBe(false)
    expect(isDeepseekPeak(new Date('2026-11-24T02:00:00Z'), holidays)).toBe(true)
  })
})

describe('preço do DeepSeek', () => {
  const tokens = { input: 1_000_000, noCache: 600_000, cacheRead: 400_000, cacheWrite: 0, output: 1_000_000, reasoning: 200_000 }

  it('deepseek-flash no pico: cache US$ 0,006, sem cache US$ 0,30, saída US$ 1,20 por 1M', () => {
    const cost = listCostOf(tokens, deepseekPrice('deepseek-flash', monday('02:00'))!)
    expect(cost.usd).toBeCloseTo(0.6 * 0.3 + 0.4 * 0.006 + 1.2, 6)
    expect(cost.price).toMatchObject({ tier: 'peak', inputPerMTok: 0.3, cacheReadPerMTok: 0.006, outputPerMTok: 1.2 })
    expect(cost.source).toBe('deepseek-table')
  })

  it('deepseek-flash fora de pico custa a metade; o reasoning não é cobrado duas vezes', () => {
    const cost = listCostOf(tokens, deepseekPrice('deepseek-flash', monday('12:00'))!)
    expect(cost.usd).toBeCloseTo(0.6 * 0.15 + 0.4 * 0.003 + 0.6, 6)
    expect(cost.price?.tier).toBe('off-peak')
  })

  it('deepseek-v4-pro tem preço próprio e os nomes antigos do Flash usam o Flash', () => {
    expect(deepseekPrice('deepseek-v4-pro', monday('02:00'))!.tiers[0]!.rates).toMatchObject({ inputPerMTok: 1.32, cacheReadPerMTok: 0.044, outputPerMTok: 3.96 })
    expect(deepseekTableModel('deepseek-v4-flash')).toBe('deepseek-flash')
    expect(deepseekPrice('deepseek-chat', monday('02:00'))).toBeNull()
  })
})
