import { describe, expect, it } from 'vitest'
import { describeSchedule, nextRunAt, scheduleSignature, validateSchedule } from '@/lib/integrations/schedule'

/** Brasília = UTC-3 (sem horário de verão). */
const brt = (iso: string) => new Date(`${iso}-03:00`)

describe('nextRunAt (issue #604)', () => {
  it('diário: mesmo dia quando o horário ainda não passou em Brasília', () => {
    // 10:00 BRT de 22/09 → 17:30 BRT do mesmo dia.
    expect(nextRunAt({ type: 'daily', time: '17:30' }, brt('2026-09-22T10:00:00')).toISOString()).toBe(
      '2026-09-22T20:30:00.000Z',
    )
  })

  it('diário: pula para o dia seguinte quando o horário já passou (estritamente depois)', () => {
    expect(nextRunAt({ type: 'daily', time: '17:30' }, brt('2026-09-22T17:30:00')).toISOString()).toBe(
      '2026-09-23T20:30:00.000Z',
    )
  })

  it('diário: interpreta o horário em Brasília mesmo quando já é outro dia em UTC', () => {
    // 22:00 BRT de 22/09 = 01:00 UTC de 23/09 → 08:00 BRT de 23/09.
    expect(nextRunAt({ type: 'daily', time: '08:00' }, brt('2026-09-22T22:00:00')).toISOString()).toBe(
      '2026-09-23T11:00:00.000Z',
    )
  })

  it('intervalo: alinhado a uma grade fixa, igual em qualquer instância', () => {
    const from = new Date('2026-09-22T12:07:31.000Z')
    expect(nextRunAt({ type: 'interval', minutes: 5 }, from).toISOString()).toBe('2026-09-22T12:10:00.000Z')
    expect(nextRunAt({ type: 'interval', minutes: 5 }, new Date('2026-09-22T12:10:00.000Z')).toISOString()).toBe(
      '2026-09-22T12:15:00.000Z',
    )
  })

  it('semanal: próximo dia permitido, atravessando o fim de semana', () => {
    // Sexta 25/09/2026 às 19:00 BRT, somente segundas às 09:00 → segunda 28/09.
    expect(nextRunAt({ type: 'weekly', days: [1], time: '09:00' }, brt('2026-09-25T19:00:00')).toISOString()).toBe(
      '2026-09-28T12:00:00.000Z',
    )
  })

  it('mensal: dia 31 vira o último dia de meses curtos', () => {
    expect(nextRunAt({ type: 'monthly', day: 31, time: '06:00' }, brt('2027-02-10T00:00:00')).toISOString()).toBe(
      '2027-02-28T09:00:00.000Z',
    )
  })

  it('mensal: vira o ano quando o dia de dezembro já passou', () => {
    expect(nextRunAt({ type: 'monthly', day: 1, time: '00:00' }, brt('2026-12-15T00:00:00')).toISOString()).toBe(
      '2027-01-01T03:00:00.000Z',
    )
  })
})

describe('validateSchedule / describeSchedule / scheduleSignature', () => {
  it('rejeita horários e parâmetros inválidos com mensagens em pt-BR', () => {
    expect(validateSchedule({ type: 'daily', time: '25:00' })).toMatch(/horário válido/)
    expect(validateSchedule({ type: 'interval', minutes: 0 })).toMatch(/intervalo/)
    expect(validateSchedule({ type: 'weekly', days: [], time: '08:00' })).toMatch(/dia da semana/)
    expect(validateSchedule({ type: 'monthly', day: 32, time: '08:00' })).toMatch(/dia do mês/)
    expect(validateSchedule({ type: 'daily', time: '08:00' })).toBeNull()
  })

  it('descreve os agendamentos de forma legível', () => {
    expect(describeSchedule({ type: 'interval', minutes: 5 })).toBe('A cada 5 minutos')
    expect(describeSchedule({ type: 'interval', minutes: 120 })).toBe('A cada 2 horas')
    expect(describeSchedule({ type: 'daily', time: '17:30' })).toBe('Todos os dias às 17:30')
    expect(describeSchedule({ type: 'weekly', days: [5, 1, 2, 3, 4], time: '08:00' })).toBe('De segunda a sexta às 08:00')
    expect(describeSchedule({ type: 'weekly', days: [1, 3], time: '08:00' })).toBe('Segunda e Quarta às 08:00')
    expect(describeSchedule({ type: 'monthly', day: 10, time: '06:00' })).toBe('Todo dia 10 do mês às 06:00')
  })

  it('a assinatura ignora a ordem dos dias e muda quando o agendamento muda', () => {
    expect(scheduleSignature({ type: 'weekly', days: [3, 1], time: '08:00' })).toBe(
      scheduleSignature({ type: 'weekly', days: [1, 3], time: '08:00' }),
    )
    expect(scheduleSignature({ type: 'daily', time: '08:00' })).not.toBe(scheduleSignature({ type: 'daily', time: '09:00' }))
  })
})
