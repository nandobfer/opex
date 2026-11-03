import { describe, expect, it } from 'vitest'
import { invalidScheduleMarker, scheduleToUtcCron, utcCronToSchedule, utcOffsetMinutes, validateCron } from '@/features/engramind/schedule-cron'

/** OPE-117: `consolidation.schedule` (cron UTC do Engramind) ↔ `Schedule` das Rotinas (Brasília). */

const AT = new Date('2026-11-03T12:00:00Z')
const cron = (schedule: Parameters<typeof scheduleToUtcCron>[0]) => {
  const result = scheduleToUtcCron(schedule, AT)
  if (!result.ok) throw new Error(result.error)
  return result.cron
}

describe('agendamento da consolidação em cron UTC', () => {
  it('o fuso de Brasília vale +180 minutos (calculado pelo fuso)', () => {
    expect(utcOffsetMinutes(AT)).toBe(180)
  })

  it('diário: 00:00 de Brasília é 03:00 UTC (o padrão do Engramind "0 3 * * *")', () => {
    expect(cron({ type: 'daily', time: '00:00' })).toBe('0 3 * * *')
    expect(utcCronToSchedule('0 3 * * *', AT)).toEqual({ type: 'daily', time: '00:00' })
  })

  it('diário com virada de dia: 22:30 de Brasília é 01:30 UTC do dia seguinte', () => {
    expect(cron({ type: 'daily', time: '22:30' })).toBe('30 1 * * *')
    expect(utcCronToSchedule('30 1 * * *', AT)).toEqual({ type: 'daily', time: '22:30' })
  })

  it('semanal: a virada desloca os dias da semana (sexta 22:00 → sábado 01:00 UTC) e volta igual', () => {
    expect(cron({ type: 'weekly', days: [5], time: '22:00' })).toBe('0 1 * * 6')
    expect(cron({ type: 'weekly', days: [6], time: '23:00' })).toBe('0 2 * * 0')
    expect(utcCronToSchedule('0 1 * * 6', AT)).toEqual({ type: 'weekly', days: [5], time: '22:00' })
    expect(cron({ type: 'weekly', days: [1, 3], time: '09:00' })).toBe('0 12 * * 1,3')
  })

  it('mensal: dia 10 às 22:00 vira dia 11 às 01:00 UTC; dia 31 às 22:00 não é representável', () => {
    expect(cron({ type: 'monthly', day: 10, time: '22:00' })).toBe('0 1 11 * *')
    expect(utcCronToSchedule('0 1 11 * *', AT)).toEqual({ type: 'monthly', day: 10, time: '22:00' })
    expect(scheduleToUtcCron({ type: 'monthly', day: 31, time: '22:00' }, AT)).toMatchObject({ ok: false })
    expect(scheduleToUtcCron({ type: 'monthly', day: 30, time: '08:00' }, AT)).toMatchObject({ ok: false })
  })

  it('intervalo: divisores de 60 min e de 24 h; o resto é recusado com a mensagem', () => {
    expect(cron({ type: 'interval', minutes: 15 })).toBe('*/15 * * * *')
    expect(cron({ type: 'interval', minutes: 60 })).toBe('0 * * * *')
    expect(cron({ type: 'interval', minutes: 360 })).toBe('0 */6 * * *')
    expect(scheduleToUtcCron({ type: 'interval', minutes: 45 }, AT)).toMatchObject({ ok: false, error: expect.stringContaining('divisor') })
    expect(utcCronToSchedule('*/15 * * * *', AT)).toEqual({ type: 'interval', minutes: 15 })
    expect(utcCronToSchedule('0 */6 * * *', AT)).toEqual({ type: 'interval', minutes: 360 })
  })

  it('cron que não cabe no editor abre no modo avançado (null)', () => {
    expect(utcCronToSchedule('0 3 1-15 * *', AT)).toBeNull()
    expect(utcCronToSchedule('0 3 * 1 *', AT)).toBeNull()
    expect(utcCronToSchedule('5,35 3 * * *', AT)).toBeNull()
  })

  it('validação do modo avançado: 5 campos, sem apelidos e com intervalos', () => {
    expect(validateCron('0 3 * * *')).toBeNull()
    expect(validateCron('*/5 1-3 * * 1,5')).toBeNull()
    expect(validateCron('@daily')).toContain('Apelidos')
    expect(validateCron('0 3 * *')).toContain('5 campos')
    expect(validateCron('0 25 * * *')).toContain('fora do intervalo')
    expect(validateCron('')).toContain('Informe')
  })
})

describe('marcador de agendamento inválido (OPE-117)', () => {
  it('a validação recusa o marcador com a mensagem da conversão (o Salvar fica bloqueado)', () => {
    expect(validateCron(invalidScheduleMarker('Mensal só até o dia 28'))).toBe('Mensal só até o dia 28')
    expect(validateCron(invalidScheduleMarker(''))).toBe('Agendamento inválido')
    expect(utcCronToSchedule(invalidScheduleMarker('x'))).toBeNull()
  })
})
