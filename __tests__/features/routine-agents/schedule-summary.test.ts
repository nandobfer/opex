import { describe, expect, it } from 'vitest'
import { routineScheduleSummary } from '@/features/routine-agents/schedule-summary'
import type { RoutineTriggerDto } from '@/features/routine-agents/types'

/** OPE-213 (pedido do dono, 27/11/2026): gatilhos ligados e a próxima execução, na lista e na página do agente. */

const NOW = new Date('2026-11-04T15:00:00.000Z').getTime()
const daily: RoutineTriggerDto = { trigger: { id: 'd', enabled: true, kind: 'daily', time: '15:00' }, nextAt: '2026-11-04T18:00:00.000Z', lastFiredAt: null }
const interval: RoutineTriggerDto = { trigger: { id: 'i', enabled: true, kind: 'interval', every: 15, unit: 'minutes' }, nextAt: '2026-11-04T15:15:00.000Z', lastFiredAt: null }
const webhookOff: RoutineTriggerDto = { trigger: { id: 'w', enabled: false, kind: 'webhook' }, nextAt: null, lastFiredAt: null }

describe('routineScheduleSummary', () => {
  it('um chip por gatilho ligado (desligados ficam de fora), com o próximo horário na dica', () => {
    const summary = routineScheduleSummary({ status: 'active', schedule: [daily, interval, webhookOff], nextFireAt: '2026-11-04T15:15:00.000Z' }, NOW)
    expect(summary.chips.map((chip) => [chip.kind, chip.label])).toEqual([['daily', 'Diário às 15:00'], ['interval', 'A cada 15 min']])
    expect(summary.chips[0]!.title).toMatch(/Próximo disparo 04\/11\/2026/)
  })

  it('ativo com horário: "Próxima execução" com a data e o relativo', () => {
    const summary = routineScheduleSummary({ status: 'active', schedule: [interval], nextFireAt: '2026-11-04T15:15:00.000Z' }, NOW)
    expect(summary.next.tone).toBe('scheduled')
    expect(summary.next.label).toMatch(/^Próxima execução 04\/11\/2026 \d\d:15 \(em 15 minutos\)$/)
  })

  it('sem gatilhos ligados: "Só manual"; ativo sem horário: "Sem disparo agendado"', () => {
    const summary = routineScheduleSummary({ status: 'active', schedule: [webhookOff], nextFireAt: null }, NOW)
    expect(summary.chips.map((chip) => chip.label)).toEqual(['Só manual'])
    expect(summary.next).toEqual({ tone: 'none', label: 'Sem disparo agendado' })
  })

  it('pausado: sem disparos, mesmo com gatilhos', () => {
    const summary = routineScheduleSummary({ status: 'paused', schedule: [daily], nextFireAt: null }, NOW)
    expect(summary.next).toEqual({ tone: 'paused', label: 'Pausado: sem disparos' })
    expect(summary.chips[0]!.title).toBe('Sem próximo disparo')
  })
})
