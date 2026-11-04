import { describe, expect, it } from 'vitest'
import {
  COLOR_MATRIX,
  COLOR_MATRIX_COLUMNS,
  DEFAULT_FAVORITE_COLORS,
  HEX_COLOR_MESSAGE,
  LEGACY_COLOR_HEX,
  colorValueSchema,
  contrastRatio,
  hasLowContrast,
  hexColorSchema,
  hexToHslTriplet,
  normalizeColor,
  parseHexColor,
  readableTextOn,
} from '@/lib/colors'

describe('hexToHslTriplet', () => {
  it('converte para o triplet HSL dos tokens do tema', () => {
    expect(hexToHslTriplet('#8000FF')).toBe('270 100% 50%')
    expect(hexToHslTriplet('#FFFFFF')).toBe('0 0% 100%')
    expect(hexToHslTriplet('#000000')).toBe('0 0% 0%')
    expect(hexToHslTriplet('#FF0000')).toBe('0 100% 50%')
  })
})

describe('hex', () => {
  it('aceita #RRGGBB em minúsculas e com espaços, devolvendo em maiúsculas', () => {
    expect(hexColorSchema.parse(' #8000ff ')).toBe('#8000FF')
    expect(parseHexColor('a78bfa')).toBe('#A78BFA')
  })

  it('rejeita formatos inválidos com a mensagem pt-BR', () => {
    for (const value of ['#FFF', '8000FF', '#GGGGGG', '#8000FF0', '']) {
      const result = hexColorSchema.safeParse(value)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe(HEX_COLOR_MESSAGE)
    }
    expect(parseHexColor('#12')).toBeNull()
  })
})

describe('cores antigas (paleta nomeada)', () => {
  it('nome antigo vira o hex equivalente; hex passa; desconhecido vira null', () => {
    expect(normalizeColor('sky')).toBe('#38BDF8')
    expect(normalizeColor('#38bdf8')).toBe('#38BDF8')
    expect(normalizeColor('azul')).toBeNull()
    expect(normalizeColor('toString')).toBeNull()
    expect(normalizeColor(null)).toBeNull()
  })

  it('o schema gravado aceita o nome antigo (API e Agente Opex) e o converte', () => {
    expect(colorValueSchema.parse('emerald')).toBe('#34D399')
    expect(colorValueSchema.safeParse('azul').success).toBe(false)
  })

  it('as favoritas padrão são as cores antigas, com os mesmos nomes', () => {
    expect(DEFAULT_FAVORITE_COLORS.map((item) => item.color)).toEqual(Object.values(LEGACY_COLOR_HEX))
    expect(DEFAULT_FAVORITE_COLORS[0]).toEqual({ color: '#A78BFA', name: 'Violeta' })
  })
})

describe('grade e contraste', () => {
  it('grade de 5 tons por matiz, sem cores repetidas', () => {
    expect(COLOR_MATRIX).toHaveLength(5)
    expect(COLOR_MATRIX.every((row) => row.length === COLOR_MATRIX_COLUMNS)).toBe(true)
    const all = COLOR_MATRIX.flat().map((item) => item.color)
    expect(new Set(all).size).toBe(all.length)
  })

  it('avisa as cores que somem no fundo escuro', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21)
    expect(hasLowContrast('#3F3F46')).toBe(true)
    expect(hasLowContrast('#A78BFA')).toBe(false)
    expect(readableTextOn('#FCD34D')).toBe('dark')
    expect(readableTextOn('#6D28D9')).toBe('light')
  })
})
