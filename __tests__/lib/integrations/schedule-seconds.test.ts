import { describe, expect, it } from 'vitest'
import { describeSchedule, intervalMs, isSecondsSchedule, nextRunAt, scheduleSignature, validateSchedule } from '@/lib/integrations/schedule'
import { scheduleSchema } from '@/features/integrations/schemas/integration.schema'

describe('agendamento em segundos (OPE-145)', () => {
  it('intervalo em segundos: grade de 10 s, descrição e assinatura próprias', () => {
    const schedule = { type: 'interval' as const, seconds: 10 }
    expect(isSecondsSchedule(schedule)).toBe(true)
    expect(intervalMs(schedule)).toBe(10_000)
    expect(nextRunAt(schedule, new Date('2026-11-06T12:00:03.000Z')).toISOString()).toBe('2026-11-06T12:00:10.000Z')
    expect(nextRunAt(schedule, new Date('2026-11-06T12:00:10.000Z')).toISOString()).toBe('2026-11-06T12:00:20.000Z')
    expect(describeSchedule(schedule)).toBe('A cada 10 segundos')
    expect(describeSchedule({ type: 'interval', seconds: 120 })).toBe('A cada 2 minutos')
    expect(scheduleSignature(schedule)).toBe('interval:10s')
  })

  it('valida o mínimo de 10 s e o máximo de 1 h', () => {
    expect(validateSchedule({ type: 'interval', seconds: 10 })).toBeNull()
    expect(validateSchedule({ type: 'interval', seconds: 9 })).toMatch(/entre 10 e 3600/)
    expect(validateSchedule({ type: 'interval', seconds: 3601 })).toMatch(/segundos/)
  })

  it('rotinas em minutos continuam iguais', () => {
    const schedule = { type: 'interval' as const, minutes: 5 }
    expect(isSecondsSchedule(schedule)).toBe(false)
    expect(intervalMs(schedule)).toBe(300_000)
    expect(scheduleSignature(schedule)).toBe('interval:5')
    expect(describeSchedule(schedule)).toBe('A cada 5 minutos')
    expect(nextRunAt(schedule, new Date('2026-11-06T12:01:00.000Z')).toISOString()).toBe('2026-11-06T12:05:00.000Z')
  })

  it('schema aceita minutos ou segundos (um só) e recusa abaixo de 10 s', () => {
    expect(scheduleSchema.parse({ type: 'interval', seconds: 10 })).toEqual({ type: 'interval', seconds: 10 })
    expect(scheduleSchema.parse({ type: 'interval', minutes: 3 })).toEqual({ type: 'interval', minutes: 3 })
    expect(scheduleSchema.safeParse({ type: 'interval', seconds: 5 }).success).toBe(false)
    expect(scheduleSchema.safeParse({ type: 'interval', seconds: 10, minutes: 1 }).success).toBe(false)
    expect(scheduleSchema.safeParse({ type: 'interval' }).success).toBe(false)
    const daily = scheduleSchema.safeParse({ type: 'daily', time: '25:00' })
    expect(daily.success).toBe(false)
    expect(daily.error?.issues[0]?.message).toBe('Horário inválido (HH:mm)')
  })
})
