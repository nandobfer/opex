import { describe, expect, it } from 'vitest'
import { containerUsage, EMPTY_USAGE, environmentUsage, memoryUsedBytes, parseDockerBytes, parsePercent, usageDetail, type ContainerUsageDto, type MachineCapacity, type UsageCell } from '@/features/environments/resource-usage'

/** Uso de CPU, RAM, swap e disco dos containers e do ambiente (OPE-211): base no limite, senão na máquina. */

const GIB = 1024 ** 3
const HOST: MachineCapacity = { cpus: 8, memoryGb: 32, swapGb: 4, disk: { totalBytes: 400 * GIB, usedBytes: 100 * GIB } }
const usage = (overrides: Partial<ContainerUsageDto> = {}): ContainerUsageDto => ({ ...EMPTY_USAGE, cpuPercent: 50, memoryBytes: 512 * 1024 ** 2, swapBytes: 0, diskBytes: GIB, diskCheckedAt: '2026-11-28T10:00:00.000Z', ...overrides })
const NO_LIMIT = { memoryGb: null, swapGb: null, cpus: null }
const valueOf = (cell: UsageCell) => (cell.kind === 'value' ? cell.value : null)

describe('parsers', () => {
  it('parseDockerBytes: B, kB, MiB, GiB, GB e decimais', () => {
    expect(parseDockerBytes('0B')).toBe(0)
    expect(parseDockerBytes('512kB')).toBe(512_000)
    expect(parseDockerBytes('120MiB')).toBe(120 * 1024 ** 2)
    expect(parseDockerBytes('1.5GiB')).toBe(Math.round(1.5 * GIB))
    expect(parseDockerBytes('1.47GB')).toBe(1_470_000_000)
    expect(parseDockerBytes('--')).toBeNull()
    expect(memoryUsedBytes('171.1MiB / 4GiB')).toBe(Math.round(171.1 * 1024 ** 2))
    expect(parsePercent('12.50%')).toBe(12.5)
    expect(parsePercent(null)).toBeNull()
  })
})

describe('containerUsage', () => {
  it('sem limite: % sobre a máquina (CPU, RAM, swap e disco)', () => {
    const set = containerUsage({ running: true, usage: usage(), limits: NO_LIMIT }, HOST)
    expect(valueOf(set.cpu)).toMatchObject({ base: 'machine', used: 0.5, total: 8, percent: 6.25 })
    expect(valueOf(set.memory)).toMatchObject({ base: 'machine', percent: (0.5 / 32) * 100 })
    expect(valueOf(set.swap)).toMatchObject({ base: 'machine', total: 4 * GIB, percent: 0 })
    expect(valueOf(set.disk)).toMatchObject({ base: 'machine', used: GIB, total: 400 * GIB, percent: 0.25 })
  })

  it('com limite: % sobre o limite aplicado', () => {
    const set = containerUsage({ running: true, usage: usage({ cpuPercent: 150, swapBytes: 256 * 1024 ** 2 }), limits: { memoryGb: 1, swapGb: 1, cpus: 2 } }, HOST)
    expect(valueOf(set.cpu)).toMatchObject({ base: 'limit', total: 2, percent: 75 })
    expect(valueOf(set.memory)).toMatchObject({ base: 'limit', total: GIB, percent: 50 })
    expect(valueOf(set.swap)).toMatchObject({ base: 'limit', percent: 25 })
  })

  it('CPU acima de 100% numa máquina com várias CPUs fica limitada a 100', () => {
    expect(valueOf(containerUsage({ running: true, usage: usage({ cpuPercent: 300 }), limits: { ...NO_LIMIT, cpus: 1 } }, HOST).cpu)!.percent).toBe(100)
  })

  it('sem swap na máquina (ou limite 0): "Sem swap"; parado: sem CPU/RAM, com o disco', () => {
    expect(containerUsage({ running: true, usage: usage(), limits: NO_LIMIT }, { ...HOST, swapGb: 0 }).swap).toEqual({ kind: 'empty', reason: 'no-swap' })
    expect(containerUsage({ running: true, usage: usage(), limits: { memoryGb: 1, swapGb: 0, cpus: null } }, HOST).swap).toEqual({ kind: 'empty', reason: 'no-swap' })
    const stopped = containerUsage({ running: false, usage: usage(), limits: NO_LIMIT }, HOST)
    expect(stopped.cpu).toEqual({ kind: 'empty', reason: 'stopped' })
    expect(stopped.disk.kind).toBe('value')
  })

  it('disco nunca lido: "lendo…"; swap não lido: "não lido"', () => {
    const set = containerUsage({ running: true, usage: usage({ diskBytes: null, diskCheckedAt: null, swapBytes: null }), limits: NO_LIMIT }, HOST)
    expect(set.disk).toEqual({ kind: 'empty', reason: 'reading' })
    expect(set.swap).toEqual({ kind: 'empty', reason: 'unread' })
  })
})

describe('environmentUsage', () => {
  it('todos com limite: a base é a soma dos limites', () => {
    const set = environmentUsage(
      [
        { running: true, usage: usage({ memoryBytes: GIB / 2 }), limits: { memoryGb: 1, swapGb: null, cpus: 1 } },
        { running: true, usage: usage({ memoryBytes: GIB / 2 }), limits: { memoryGb: 1, swapGb: null, cpus: 1 } },
      ],
      HOST,
    )
    expect(valueOf(set.memory)).toMatchObject({ base: 'limit', used: GIB, total: 2 * GIB, percent: 50 })
    expect(valueOf(set.cpu)).toMatchObject({ base: 'limit', total: 2 })
  })

  it('algum sem limite: a base é a máquina', () => {
    const set = environmentUsage(
      [
        { running: true, usage: usage(), limits: { memoryGb: 1, swapGb: null, cpus: null } },
        { running: true, usage: usage(), limits: NO_LIMIT },
      ],
      HOST,
    )
    expect(valueOf(set.memory)).toMatchObject({ base: 'machine', total: 32 * GIB })
  })

  it('um volume compartilhado conta uma vez só no total', () => {
    const shared = { name: 'dados', bytes: 10 * GIB }
    const set = environmentUsage(
      [
        { running: true, usage: usage({ diskBytes: 11 * GIB, volumes: [shared] }), limits: NO_LIMIT },
        { running: true, usage: usage({ diskBytes: 12 * GIB, volumes: [shared] }), limits: NO_LIMIT },
      ],
      HOST,
    )
    expect(valueOf(set.disk)!.used).toBe(13 * GIB)
  })

  it('detalhe da barra diz a base', () => {
    expect(usageDetail('memory', { percent: 30, used: 300 * 1024 ** 2, total: GIB, base: 'limit' }, 'server')).toBe('300 MiB de 1 GiB (limite)')
    expect(usageDetail('cpu', { percent: 15, used: 1.2, total: 8, base: 'machine' }, 'server')).toBe('1,2 de 8 CPUs (servidor)')
    expect(usageDetail('disk', { percent: 1, used: GIB, total: 400 * GIB, base: 'machine' }, 'pc')).toBe('1 GiB de 400 GiB (PC)')
  })
})
