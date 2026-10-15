import { describe, expect, it } from 'vitest'
import { ESTIMATE_MAX_HOURS, estimateHoursToMinutes, formatEstimateDuration, parseEstimateDuration } from '@/features/tasks/estimate-duration'

describe('formatação da duração estimada (hh:mm)', () => {
  it('mostra as horas decimais em horas e minutos', () => {
    expect(formatEstimateDuration(1.5)).toBe('01:30')
    expect(formatEstimateDuration(2)).toBe('02:00')
    expect(formatEstimateDuration(0)).toBe('00:00')
    expect(formatEstimateDuration(0.25)).toBe('00:15')
    expect(formatEstimateDuration(100.25)).toBe('100:15')
    expect(formatEstimateDuration(ESTIMATE_MAX_HOURS)).toBe('10000:00')
  })

  it('trata valor negativo ou ausente como zero', () => {
    expect(formatEstimateDuration(-3)).toBe('00:00')
    expect(estimateHoursToMinutes(-1)).toBe(0)
    expect(estimateHoursToMinutes(Number.NaN)).toBe(0)
  })
})

describe('leitura da duração digitada (hh:mm)', () => {
  it('converte para as horas decimais do contrato', () => {
    expect(parseEstimateDuration('01:30')).toEqual({ status: 'valid', hours: 1.5, minutes: 90 })
    expect(parseEstimateDuration('00:01')).toEqual({ status: 'valid', hours: 1 / 60, minutes: 1 })
    expect(parseEstimateDuration('25:15')).toEqual({ status: 'valid', hours: 25.25, minutes: 1515 })
    expect(parseEstimateDuration('0:00')).toEqual({ status: 'valid', hours: 0, minutes: 0 })
    expect(parseEstimateDuration(' 02:00 ')).toEqual({ status: 'valid', hours: 2, minutes: 120 })
  })

  it('lê os minutos com um dígito (1:5 = 1:05)', () => {
    expect(parseEstimateDuration('1:5')).toEqual({ status: 'valid', hours: 1 + 5 / 60, minutes: 65 })
  })

  it('aceita o limite exato e recusa acima dele', () => {
    expect(parseEstimateDuration('10000:00')).toEqual({ status: 'valid', hours: 10000, minutes: 600_000 })
    expect(parseEstimateDuration('10000:01')).toEqual({ status: 'invalid', issue: 'range' })
    expect(parseEstimateDuration('99999:59')).toEqual({ status: 'invalid', issue: 'range' })
  })

  it('não acusa erro enquanto o usuário ainda digita', () => {
    expect(parseEstimateDuration('')).toEqual({ status: 'empty' })
    expect(parseEstimateDuration('   ')).toEqual({ status: 'empty' })
    expect(parseEstimateDuration('1')).toEqual({ status: 'incomplete' })
    expect(parseEstimateDuration('130')).toEqual({ status: 'incomplete' })
    expect(parseEstimateDuration('1:')).toEqual({ status: 'incomplete' })
  })

  it('recusa formatos fora de hh:mm, inclusive o decimal antigo', () => {
    for (const value of ['1.5', '1,5', '01:60', '-01:30', 'abc', '1:2:3', '01:30h', '1 :30', ':30']) {
      expect(parseEstimateDuration(value)).toEqual({ status: 'invalid', issue: 'format' })
    }
  })

  it('volta ao mesmo minuto depois do arredondamento de 2 casas do servidor', () => {
    for (const value of ['00:01', '00:59', '01:30', '01:31', '26:07', '26:13', '100:45']) {
      const parsed = parseEstimateDuration(value)
      if (parsed.status !== 'valid') throw new Error(`esperava uma duração válida: ${value}`)
      const stored = Math.round((parsed.hours + Number.EPSILON) * 100) / 100
      expect(formatEstimateDuration(stored)).toBe(value.padStart(5, '0'))
    }
  })
})
