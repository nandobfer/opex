import { describe, expect, it } from 'vitest'
import { formatNumberBR, parseBankingInputBR } from '@/lib/format'

describe('formatação numérica pt-BR (cópia do Smart Desk)', () => {
  it('formata com milhar e casas fixas', () => {
    expect(formatNumberBR(1234.5)).toBe('1.234,50')
    expect(formatNumberBR(0)).toBe('0,00')
  })

  it('entrada bancária: dígitos entram pelos centavos; vazio = 0', () => {
    expect(parseBankingInputBR('1234')).toBe(12.34)
    expect(parseBankingInputBR('R$ 1.234,567')).toBe(12345.67)
    expect(parseBankingInputBR('')).toBe(0)
    expect(parseBankingInputBR('1234', 4)).toBe(0.1234)
  })
})
