import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Ferramentas internas da execução e o fecho do turno (OPE-130). */

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { EXECUTAR: 'EXECUTAR', ABORTAR: 'ABORTAR', APROVAR: 'APROVAR', DEVOLVER: 'DEVOLVER' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: vi.fn(async () => undefined) }))

import { beginActivation, resetActivationsForTests, stopActivation } from '@/features/routine-agents/server/hub'
import { routineControlTools } from '@/features/routine-agents/server/tools/internal'
import { activationVerdict } from '@/features/routine-agents/server/runs'
import { EMPTY_ROUTINE_LIMITS } from '@/features/routine-agents/schemas'

const NOW = new Date('2026-11-05T10:00:00Z')
const env = (overrides: Partial<Parameters<typeof routineControlTools>[0]> = {}) => {
  const activation = beginActivation({ runId: 'r'.repeat(24), agentId: 'a'.repeat(24), baseTokens: 0, baseActiveMs: 0 })
  const phases: string[] = []
  const tools = routineControlTools({ activation, limits: EMPTY_ROUTINE_LIMITS, confirmIrreversible: true, setPhase: async (phase) => void phases.push(phase), now: () => NOW, ...overrides })
  const tool = (name: string) => tools.find((item) => item.name === name)!
  return { activation, phases, tools, tool }
}
const ctx = { sessionId: '', actorId: 'local' }

beforeEach(() => resetActivationsForTests())
afterEach(() => vi.useRealTimers())

describe('ferramentas internas', () => {
  it('hibernar agenda a retomada (mínimo de 1 min) com o motivo e encerra o turno', async () => {
    const { activation, tool } = env()
    await tool('hibernate').execute({ minutes: 1, reason: 'esperar a vaga abrir' }, ctx)
    expect(activation.outcome).toEqual({ kind: 'hibernate', at: new Date('2026-11-05T10:01:00Z'), reason: 'esperar a vaga abrir' })
    // `at` no passado também respeita o mínimo.
    const second = env()
    await second.tool('hibernate').execute({ at: '2026-11-05T09:00:00Z', reason: 'x' }, ctx)
    expect((second.activation.outcome as { at: Date }).at.toISOString()).toBe('2026-11-05T10:01:00.000Z')
  })

  it('confirmação só existe com o switch ligado e deixa a ação pendente', async () => {
    const on = env()
    await on.tool('request_confirmation').execute({ summary: 'Enviar candidatura à vaga 42' }, ctx)
    expect(on.activation.outcome).toMatchObject({ kind: 'confirmation', action: { summary: 'Enviar candidatura à vaga 42', kind: 'request' } })
    expect(env({ confirmIrreversible: false }).tools.map((item) => item.name)).not.toContain('request_confirmation')
  })

  it('espera viva marca Esperando e volta para Executando; estourada pede hibernação', async () => {
    vi.useFakeTimers()
    const { activation, phases, tool } = env({ limits: { ...EMPTY_ROUTINE_LIMITS, maxLiveWaitMinutes: 1 } })
    const waiting = tool('wait').execute({ seconds: 120, reason: 'página carregar' }, ctx)
    await vi.advanceTimersByTimeAsync(60_000)
    const result = (await waiting) as { status: string }
    expect(phases).toEqual(['waiting', 'running'])
    expect(result.status).toBe('live_wait_exhausted')
    expect(activation.outcome).toEqual({ kind: 'live-wait-exceeded' })
  })

  it('cancelar interrompe a espera viva na hora', async () => {
    const { activation, tool } = env()
    const waiting = tool('wait').execute({ seconds: 600, reason: 'x' }, ctx)
    stopActivation(activation.runId, 'canceled')
    await waiting
    expect(activation.stopReason).toBe('canceled')
  })
})

describe('fecho do turno', () => {
  const ok = { error: null, text: 'último texto' }

  it('cancelado, limite de tokens e tempo ativo vencem o resto', () => {
    expect(activationVerdict({ outcome: { kind: 'finish', report: 'ok' }, stopReason: 'canceled' }, ok, NOW).status).toBe('canceled')
    expect(activationVerdict({ outcome: null, stopReason: 'tokens' }, ok, NOW)).toEqual({ status: 'error', error: 'Limite de tokens atingido' })
    expect(activationVerdict({ outcome: null, stopReason: 'active' }, ok, NOW).error).toBe('Tempo máximo de execução ativa atingido')
  })

  it('concluir, hibernar e confirmar viram os status da tabela', () => {
    expect(activationVerdict({ outcome: { kind: 'finish', report: 'Feito' }, stopReason: null }, ok, NOW)).toEqual({ status: 'completed', report: 'Feito' })
    expect(activationVerdict({ outcome: { kind: 'hibernate', at: NOW, reason: 'r' }, stopReason: null }, ok, NOW)).toMatchObject({ status: 'hibernating', hibernation: { reason: 'r' } })
    expect(activationVerdict({ outcome: { kind: 'confirmation', action: { summary: 's', kind: 'request', toolName: null, toolLabel: null, input: null, displayInput: null } }, stopReason: null }, ok, NOW).status).toBe('awaiting_confirmation')
  })

  it('espera viva estourada sem hibernação → hiberna com reverificação em 1 min', () => {
    const verdict = activationVerdict({ outcome: { kind: 'live-wait-exceeded' }, stopReason: null }, ok, NOW)
    expect(verdict.status).toBe('hibernating')
    expect(verdict.hibernation?.at.toISOString()).toBe('2026-11-05T10:01:00.000Z')
  })

  it('falha do motor vira Erro; sem concluir, conclui com o último texto e um aviso', () => {
    expect(activationVerdict({ outcome: null, stopReason: null }, { error: 'Serviço OpenCode indisponível', text: '' }, NOW)).toEqual({ status: 'error', error: 'Serviço OpenCode indisponível' })
    expect(activationVerdict({ outcome: null, stopReason: null }, ok, NOW)).toMatchObject({ status: 'completed', report: 'último texto', warning: expect.stringContaining('sem chamar') })
  })
})
