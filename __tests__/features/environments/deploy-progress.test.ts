import { describe, expect, it } from 'vitest'
import { DEPLOY_PROGRESS_CAP, deployProgress, formatElapsed } from '@/features/environments/deploy-progress'

/** Ambientes: barra de progresso da gaveta de deploy — decorrido sobre a estimativa (OPE-202). */

const START = '2026-11-26T15:00:00.000Z'
const at = (seconds: number) => new Date(START).getTime() + seconds * 1000

describe('formatElapsed', () => {
  it('mm:ss até 1 h, h:mm:ss depois, negativo vira 00:00', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(59_999)).toBe('00:59')
    expect(formatElapsed(72_000)).toBe('01:12')
    expect(formatElapsed(3_723_000)).toBe('1:02:03')
    expect(formatElapsed(-5_000)).toBe('00:00')
  })
})

describe('deployProgress', () => {
  it('com estimativa: % proporcional e o restante', () => {
    const view = deployProgress({ startedAt: START, estimateMs: 200_000, initial: false, now: at(72) })
    expect(view.percent).toBeCloseTo(36)
    expect(view.overdue).toBe(false)
    expect(view.detail).toBe('há 01:12 · restam ~02:08')
  })

  it('estimativa inicial (1–2 amostras) avisa no texto', () => {
    expect(deployProgress({ startedAt: START, estimateMs: 200_000, initial: true, now: at(72) }).detail).toBe('há 01:12 · restam ~02:08 (estimativa inicial)')
  })

  it('passou do previsto: trava em 99% e troca o texto', () => {
    const view = deployProgress({ startedAt: START, estimateMs: 240_000, initial: false, now: at(312) })
    expect(view.percent).toBe(DEPLOY_PROGRESS_CAP)
    expect(view.overdue).toBe(true)
    expect(view.detail).toBe('há 05:12 · mais que o previsto (~04:00)')
  })

  it('nunca passa de 99% antes do status final, mesmo perto da estimativa', () => {
    expect(deployProgress({ startedAt: START, estimateMs: 100_000, initial: false, now: at(99.9) }).percent).toBeLessThanOrEqual(DEPLOY_PROGRESS_CAP)
  })

  it('sem estimativa: indeterminada, só o decorrido', () => {
    const view = deployProgress({ startedAt: START, estimateMs: null, initial: false, now: at(72) })
    expect(view.percent).toBeNull()
    expect(view.detail).toBe('há 01:12')
  })

  it('regressão: o decorrido vem do relógio (agora − início), não de ticks somados', () => {
    // Um único redesenho depois de 10 min (aba em segundo plano, tick atrasado) mostra o tempo real.
    expect(deployProgress({ startedAt: START, estimateMs: null, initial: false, now: at(600) }).detail).toBe('há 10:00')
  })
})
