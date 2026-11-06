import { describe, expect, it } from 'vitest'
import { buildTriggerStates, dueFire, nextFireAt, parseBrasiliaLocal } from '@/features/routine-agents/recurrence'
import { checkRunLimits, liveWaitBudgetMs, TOKEN_LIMIT_MESSAGE, ACTIVE_LIMIT_MESSAGE, WAITING_LIMIT_MESSAGE } from '@/features/routine-agents/limits'
import { fifoOrder, freeSlots } from '@/features/routine-agents/slots'
import { slugifyRoutineName, uniqueRoutineSlug, routineNameKey } from '@/features/routine-agents/slug'
import { canCancelRun, occupiesSlot } from '@/features/routine-agents/status'
import { EMPTY_ROUTINE_LIMITS, DEFAULT_ROUTINE_AGENT_INPUT, routineAgentInputSchema, routineEntryInputSchema, type RoutineTrigger } from '@/features/routine-agents/schemas'

/** Regras puras dos agentes rotineiros (OPE-130): recorrência em Brasília, limites, vagas, slug e contrato. */

const at = (iso: string) => new Date(iso)

describe('recorrência dos gatilhos (horário de Brasília)', () => {
  it('diário às 08:00 de Brasília cai às 11:00 UTC; depois do horário vai para o dia seguinte', () => {
    const daily: RoutineTrigger = { id: 'd', enabled: true, kind: 'daily', time: '08:00' }
    expect(nextFireAt(daily, at('2026-11-05T10:00:00Z'))?.toISOString()).toBe('2026-11-05T11:00:00.000Z')
    expect(nextFireAt(daily, at('2026-11-05T11:00:00Z'))?.toISOString()).toBe('2026-11-06T11:00:00.000Z')
  })

  it('dias da semana pulam os dias não escolhidos (5/11/2026 é quinta)', () => {
    const weekly: RoutineTrigger = { id: 'w', enabled: true, kind: 'weekly', days: [1], time: '09:30' }
    expect(nextFireAt(weekly, at('2026-11-05T12:00:00Z'))?.toISOString()).toBe('2026-11-09T12:30:00.000Z')
  })

  it('a cada N minutos conta do último disparo; único vale uma vez', () => {
    const every: RoutineTrigger = { id: 'i', enabled: true, kind: 'interval', every: 15, unit: 'minutes' }
    expect(nextFireAt(every, at('2026-11-05T10:05:00Z'), at('2026-11-05T10:00:00Z'))?.toISOString()).toBe('2026-11-05T10:15:00.000Z')
    const once: RoutineTrigger = { id: 'o', enabled: true, kind: 'once', at: '2026-11-10T14:00' }
    expect(nextFireAt(once, at('2026-11-05T10:00:00Z'))?.toISOString()).toBe('2026-11-10T17:00:00.000Z')
    expect(nextFireAt(once, at('2026-11-05T10:00:00Z'), at('2026-11-10T17:00:00Z'))).toBeNull()
    expect(parseBrasiliaLocal('nada')).toBeNull()
  })

  it('várias janelas perdidas geram UM disparo, com o atraso, e o próximo a partir de agora', () => {
    const every: RoutineTrigger = { id: 'i', enabled: true, kind: 'interval', every: 1, unit: 'hours' }
    const fire = dueFire(every, at('2026-11-05T05:00:00Z'), at('2026-11-05T10:00:00Z'))
    expect(fire?.delayMs).toBe(5 * 3_600_000)
    expect(fire?.nextAt?.toISOString()).toBe('2026-11-05T11:00:00.000Z')
    expect(dueFire(every, at('2026-11-05T11:00:00Z'), at('2026-11-05T10:00:00Z'))).toBeNull()
    expect(dueFire({ ...every, enabled: false }, at('2026-11-05T05:00:00Z'), at('2026-11-05T10:00:00Z'))).toBeNull()
  })

  it('salvar mantém o horário do gatilho igual e recalcula o alterado', () => {
    const daily: RoutineTrigger = { id: 'd', enabled: true, kind: 'daily', time: '08:00' }
    const previous = [{ trigger: daily, nextAt: at('2026-11-06T11:00:00Z'), lastFiredAt: at('2026-11-05T11:00:00Z') }]
    const same = buildTriggerStates([daily], previous, at('2026-11-05T12:00:00Z'))
    expect(same[0]).toEqual(previous[0])
    const changed = buildTriggerStates([{ ...daily, time: '20:00' }], previous, at('2026-11-05T12:00:00Z'))
    expect(changed[0]!.nextAt?.toISOString()).toBe('2026-11-05T23:00:00.000Z')
    expect(changed[0]!.lastFiredAt).toBeNull()
  })
})

describe('limites da execução', () => {
  it('critério aprovado (OPE-130, limite por tokens): o teto de tokens vira Erro "Limite de tokens atingido"', () => {
    const limits = { ...EMPTY_ROUTINE_LIMITS, maxTokens: 1_000 }
    expect(checkRunLimits({ activeMs: 0, waitingMs: 0, tokens: 999 }, limits, 'active')).toEqual({ kind: 'ok' })
    expect(checkRunLimits({ activeMs: 0, waitingMs: 0, tokens: 1_000 }, limits, 'active')).toEqual({ kind: 'error', code: 'TOKENS', message: TOKEN_LIMIT_MESSAGE })
  })

  it('critério aprovado (OPE-130, D3): o tempo ativo conta Executando + Esperando; a espera parada expira', () => {
    const limits = { ...EMPTY_ROUTINE_LIMITS, maxActiveMinutes: 10, maxWaitingMinutes: 60 }
    expect(checkRunLimits({ activeMs: 10 * 60_000, waitingMs: 0, tokens: 0 }, limits, 'active')).toMatchObject({ kind: 'error', message: ACTIVE_LIMIT_MESSAGE })
    expect(checkRunLimits({ activeMs: 0, waitingMs: 60 * 60_000, tokens: 0 }, limits, 'parked')).toEqual({ kind: 'expired', message: WAITING_LIMIT_MESSAGE })
    expect(checkRunLimits({ activeMs: 99e9, waitingMs: 99e9, tokens: 99e9 }, EMPTY_ROUTINE_LIMITS, 'active')).toEqual({ kind: 'ok' })
  })

  it('espera viva máxima sem valor vale 10 min', () => {
    expect(liveWaitBudgetMs(EMPTY_ROUTINE_LIMITS)).toBe(10 * 60_000)
    expect(liveWaitBudgetMs({ maxLiveWaitMinutes: 3 })).toBe(3 * 60_000)
  })
})

describe('vagas e fila', () => {
  it('só Executando e Esperando ocupam vaga; a fila anda por ordem de chegada', () => {
    expect(occupiesSlot('running')).toBe(true)
    expect(occupiesSlot('waiting')).toBe(true)
    expect(occupiesSlot('hibernating')).toBe(false)
    expect(occupiesSlot('awaiting_confirmation')).toBe(false)
    expect(freeSlots(2, 1, 5)).toBe(1)
    expect(freeSlots(2, 2, 5)).toBe(0)
    expect(freeSlots(null, 9, 3)).toBe(3)
    expect(fifoOrder([{ id: 'b', queuedAt: '2026-11-05T10:01:00Z' }, { id: 'a', queuedAt: '2026-11-05T10:00:00Z' }]).map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('cancelar existe em todos os status não finais', () => {
    expect(canCancelRun('hibernating')).toBe(true)
    expect(canCancelRun('completed')).toBe(false)
  })
})

describe('slug e contrato', () => {
  it('o slug nasce do nome, sem acento; "global" é reservado e a colisão ganha sufixo', () => {
    expect(slugifyRoutineName('Vagas — Empresa Ação!')).toBe('vagas-empresa-acao')
    expect(uniqueRoutineSlug('Global', new Set())).toBe('global-2')
    expect(uniqueRoutineSlug('Vagas', new Set(['vagas']))).toBe('vagas-2')
    expect(routineNameKey('  Vagás  X ')).toBe('vagas x')
  })

  it('o schema exige nome, objetivo e o modelo do motor; entrada vazia é recusada', () => {
    const result = routineAgentInputSchema.safeParse({ ...DEFAULT_ROUTINE_AGENT_INPUT, name: 'A' })
    expect(result.success).toBe(false)
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['name', 'objective', 'opex.provider', 'opex.model']))
    expect(routineAgentInputSchema.safeParse({ ...DEFAULT_ROUTINE_AGENT_INPUT, name: 'Agente', objective: 'Fazer', engine: 'opencode', opencode: { ...DEFAULT_ROUTINE_AGENT_INPUT.opencode, model: 'anthropic/claude' } }).success).toBe(true)
    expect(routineEntryInputSchema.safeParse({ text: '   ', target: 'agent' }).success).toBe(false)
  })
})
