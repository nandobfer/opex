import { describe, expect, it } from 'vitest'
import { formatBytes, hostMetricsHash, hostMetricsLevel, isHostMetricsStale, normalizeHostMetrics, parseShellMetrics, staleAfterMsFor } from '@/features/host-metrics/logic'
import type { HostMetrics, HostMetricsDto } from '@/features/host-metrics/schemas'

const shellOutput = ({ swapTotal = 8388604, swapFree = 8388604, df = '/dev/sda2 1000000000000 400000000000 500000000000 45% /' } = {}) =>
  [
    'cpu  100 0 100 700 100 0 0 0 0 0',
    'cpu  150 0 150 750 150 0 0 0 0 0',
    '@@meminfo',
    'MemTotal:       32000000 kB',
    'MemFree:         4000000 kB',
    'MemAvailable:    8000000 kB',
    `SwapTotal:       ${swapTotal} kB`,
    `SwapFree:        ${swapFree} kB`,
    '@@df',
    'Filesystem 1-blocks Used Available Capacity Mounted on',
    df,
    '@@cores',
    '8',
  ].join('\n')

const metrics = (over: Partial<Record<keyof HostMetrics, number>> = {}): HostMetrics => ({
  cpu: { percent: over.cpu ?? 10, used: 1, total: 8 },
  memory: { percent: over.memory ?? 20, used: 1, total: 100 },
  swap: { percent: over.swap ?? 30, used: 1, total: over.swap === -1 ? 0 : 100 },
  disk: { percent: over.disk ?? 40, used: 1, total: 100 },
})

const dto = (over: Partial<HostMetricsDto> = {}): HostMetricsDto => ({
  state: 'ok',
  message: null,
  metrics: metrics(),
  checkedAt: '2026-11-06T12:00:00.000Z',
  attemptedAt: '2026-11-06T12:00:00.000Z',
  staleAfterMs: 30_000,
  ...over,
})
const at = (iso: string) => Date.parse(iso)

describe('parseShellMetrics (mesma conta do opencode-htop)', () => {
  it('CPU pelo delta de /proc/stat, RAM por MemAvailable, disco = total − livre', () => {
    const result = parseShellMetrics(shellOutput())
    // delta total 200, idle (idle+iowait) delta 100 → 50%
    expect(result.cpu).toEqual({ percent: 50, used: 4, total: 8 })
    expect(result.memory.total).toBe(32000000 * 1024)
    expect(result.memory.percent).toBe(75)
    expect(result.swap.percent).toBe(0)
    expect(result.disk).toEqual({ percent: 50, used: 500000000000, total: 1000000000000 })
  })

  it('sem swap: total 0 fica válido', () => {
    const result = parseShellMetrics(shellOutput({ swapTotal: 0, swapFree: 0 }))
    expect(result.swap).toEqual({ percent: 0, used: 0, total: 0 })
  })

  it('/proc truncado ou df sem total é leitura inválida', () => {
    expect(() => parseShellMetrics('cpu  1 2 3 4\n@@meminfo')).toThrow()
    expect(() => parseShellMetrics(shellOutput().replace(/MemTotal.*\n/, ''))).toThrow(/meminfo/)
    expect(() => parseShellMetrics(shellOutput({ df: '/dev/sda2 0 0 0 0% /' }))).toThrow(/df/)
  })
})

describe('normalizeHostMetrics', () => {
  it('limita a 0–100 e recusa RAM ou disco com total 0', () => {
    const fixed = normalizeHostMetrics({ ...metrics(), cpu: { percent: 140, used: 9, total: 8 }, disk: { percent: -3, used: 0, total: 10 } })
    expect(fixed.cpu.percent).toBe(100)
    expect(fixed.disk.percent).toBe(0)
    expect(() => normalizeHostMetrics({ ...metrics(), memory: { percent: 0, used: 0, total: 0 } })).toThrow()
    expect(() => normalizeHostMetrics({ ...metrics(), disk: { percent: 0, used: 0, total: 0 } })).toThrow()
  })
})

describe('bolinha do servidor (hostMetricsLevel)', () => {
  const now = at('2026-11-06T12:00:10.000Z')
  it('pior caso entre CPU, RAM, swap e disco', () => {
    expect(hostMetricsLevel(dto(), now)).toBe('ok')
    expect(hostMetricsLevel(dto({ metrics: metrics({ memory: 60 }) }), now)).toBe('warning')
    expect(hostMetricsLevel(dto({ metrics: metrics({ disk: 85, memory: 70 }) }), now)).toBe('critical')
  })

  it('sem swap, o swap fica fora do cálculo', () => {
    const noSwap = metrics()
    noSwap.swap = { percent: 99, used: 0, total: 0 }
    expect(hostMetricsLevel(dto({ metrics: noSwap }), now)).toBe('ok')
  })

  it('cinza (null) carregando, com erro, sem configuração ou desatualizado', () => {
    expect(hostMetricsLevel(undefined, now)).toBeNull()
    expect(hostMetricsLevel(dto({ state: 'error' }), now)).toBeNull()
    expect(hostMetricsLevel(dto({ state: 'unconfigured', metrics: null }), now)).toBeNull()
    expect(hostMetricsLevel(dto(), at('2026-11-06T12:00:31.000Z'))).toBeNull()
  })
})

describe('prazo de desatualizado', () => {
  it('30 s ou 2 × intervalo + 5 s, o maior', () => {
    expect(staleAfterMsFor(null)).toBe(30_000)
    expect(staleAfterMsFor(10_000)).toBe(30_000)
    expect(staleAfterMsFor(60_000)).toBe(125_000)
    expect(isHostMetricsStale(dto({ staleAfterMs: 125_000 }), at('2026-11-06T12:01:00.000Z'))).toBe(false)
    expect(isHostMetricsStale(dto({ checkedAt: null }), at('2026-11-06T12:00:00.000Z'))).toBe(true)
  })
})

describe('hostMetricsHash e formatBytes', () => {
  it('só muda com o percentual arredondado ou o estado', () => {
    const base = hostMetricsHash(dto())
    expect(hostMetricsHash(dto({ checkedAt: '2026-11-06T12:00:05.000Z', metrics: { ...metrics(), cpu: { percent: 10.2, used: 3, total: 8 } } }))).toBe(base)
    expect(hostMetricsHash(dto({ metrics: metrics({ cpu: 11 }) }))).not.toBe(base)
    expect(hostMetricsHash(dto({ state: 'error' }))).not.toBe(base)
  })

  it('GB com 1 casa e TB a partir de 1.000 GB', () => {
    expect(formatBytes(25_199_177_728)).toBe('25,2 GB')
    expect(formatBytes(999_000_000_000)).toBe('999,0 GB')
    expect(formatBytes(1_500_000_000_000)).toBe('1,5 TB')
  })
})
