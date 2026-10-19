import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  events: [] as { id: string; payload: Record<string, unknown> }[],
  dropIdle: vi.fn(async () => undefined),
  prepare: vi.fn(async () => undefined),
}))

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/agentic/server/hub', () => ({
  prepareHub: mocks.prepare,
  dropIdlePrWatchEvents: mocks.dropIdle,
  publishWorkbenchEvent: (id: string, payload: Record<string, unknown>) => {
    mocks.events.push({ id, payload })
    return payload
  },
}))

import { startPrWatchReport } from '@/features/agentic/server/pr-watch-report'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.events.length = 0
  mocks.prepare.mockResolvedValue(undefined)
})

describe('startPrWatchReport', () => {
  it('publica os passos ao vivo e grava a verificação inteira no fim', async () => {
    const report = await startPrWatchReport('w1', 7, '2026-10-16T12:02:00.000Z')
    report.step('Consultando o PR #7 no GitHub…')
    report.step('Sem conflito de merge', 'success')
    await report.finish('action', 'Conflito de merge → resolvendo automaticamente')
    report.step('depois do fim')
    await report.finish('idle', 'segunda vez')

    expect(mocks.prepare).toHaveBeenCalledWith('w1')
    const types = mocks.events.map((event) => event.payload.type)
    expect(types).toEqual(['pr-watch-step', 'pr-watch-step', 'pr-watch'])
    const checkIds = new Set(mocks.events.map((event) => event.payload.checkId))
    expect(checkIds.size).toBe(1)
    expect(mocks.events[2]!.payload).toMatchObject({
      prNumber: 7,
      outcome: 'action',
      summary: 'Conflito de merge → resolvendo automaticamente',
      nextCheckAt: '2026-10-16T12:02:00.000Z',
      steps: [expect.objectContaining({ text: 'Consultando o PR #7 no GitHub…', level: 'info' }), expect.objectContaining({ text: 'Sem conflito de merge', level: 'success' })],
    })
    // Só a verificação sem novidade apaga as anteriores sem novidade.
    expect(mocks.dropIdle).not.toHaveBeenCalled()
    expect(report.finished).toBe(true)
  })

  it('sem novidade: apaga as verificações sem novidade anteriores antes de gravar', async () => {
    const report = await startPrWatchReport('w1', 7, null)
    await report.finish('idle', 'Nada a fazer')
    expect(mocks.dropIdle).toHaveBeenCalledWith('w1')
    expect(mocks.events.at(-1)!.payload).toMatchObject({ type: 'pr-watch', outcome: 'idle' })
  })

  it('falha antes do fim fecha com erro; depois do fim vira aviso', async () => {
    const first = await startPrWatchReport('w1', 7, null)
    await first.fail('Falha ao consultar o PR no GitHub: HTTP 502')
    expect(mocks.events.at(-1)!.payload).toMatchObject({ type: 'pr-watch', outcome: 'error' })
    expect(mocks.events.at(-2)!.payload).toMatchObject({ type: 'pr-watch-step', level: 'error', text: 'Falha ao consultar o PR no GitHub: HTTP 502' })

    const second = await startPrWatchReport('w1', 7, null)
    await second.finish('action', 'PR mergeado → concluindo a mesa')
    await second.fail('erro ao concluir')
    expect(mocks.events.at(-1)!.payload).toEqual({ type: 'notice', level: 'error', message: 'Acompanhamento do PR #7: erro ao concluir' })
  })

  it('erro ao preparar a saída não interrompe o acompanhamento (relato silencioso)', async () => {
    mocks.prepare.mockRejectedValueOnce(new Error('sem banco'))
    const report = await startPrWatchReport('w1', 7, null)
    report.step('x')
    await report.finish('idle', 'Nada a fazer')
    expect(mocks.events).toHaveLength(0)
    expect(report.finished).toBe(true)
  })
})
