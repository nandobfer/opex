import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostResult } from '@/features/local-docker/server/shell'

/** Disco dos containers (OPE-211): cache de 5 min por máquina, uma leitura por vez, a lista nunca espera. */

const mocks = vi.hoisted(() => ({ publish: vi.fn(async () => undefined), warn: vi.fn() }))
vi.mock('@/features/environments/server/settings', () => ({ publishEnvironment: mocks.publish, envLog: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }))

import { DISK_USAGE_TTL_MS, diskUsageFor, pendingDiskUsage, resetDiskUsageCache } from '@/features/environments/server/disk-usage'

const OUTPUT = ['loja-app-1\t41kB (virtual 1.47GB)', '---', '[]', '---', '/loja-app-1\t[]'].join('\n')

function host(result: HostResult | Error = { exitCode: 0, output: OUTPUT }) {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  const run = vi.fn(async () => {
    await gate
    if (result instanceof Error) throw result
    return result
  })
  return { run, release }
}

beforeEach(() => resetDiskUsageCache())
afterEach(() => vi.clearAllMocks())

describe('diskUsageFor', () => {
  it('primeira vez: devolve null na hora (não espera) e dispara uma leitura só, mesmo com duas chamadas', async () => {
    const { run, release } = host()
    expect(diskUsageFor('server', 'x', run, 1_000)).toBeNull()
    expect(diskUsageFor('server', 'x', run, 1_001)).toBeNull()
    expect(run).toHaveBeenCalledTimes(1)
    release()
    await pendingDiskUsage('server')
    const read = diskUsageFor('server', 'x', run, 2_000)
    expect(read!.values.get('loja-app-1')!.bytes).toBe(41_000)
    // Ao terminar, avisa a tela pelo evento do módulo.
    expect(mocks.publish).toHaveBeenCalledWith(null, 'usage')
  })

  it('o cache vale 5 min: dentro dele não lê de novo; vencido, lê em segundo plano e devolve a anterior', async () => {
    const { run, release } = host()
    release()
    diskUsageFor('server', 'x', run, 0)
    await pendingDiskUsage('server')
    expect(run).toHaveBeenCalledTimes(1)
    diskUsageFor('server', 'x', run, DISK_USAGE_TTL_MS - 1)
    expect(run).toHaveBeenCalledTimes(1)
    const stale = diskUsageFor('server', 'x', run, DISK_USAGE_TTL_MS + 1)
    expect(run).toHaveBeenCalledTimes(2)
    expect(stale!.values.size).toBe(1)
    await pendingDiskUsage('server')
  })

  it('uma falha não derruba a lista: fica null, registra no log e só tenta de novo depois da validade', async () => {
    const { run, release } = host(new Error('Docker fora'))
    release()
    expect(diskUsageFor('pc', 'ctx', run, 0)).toBeNull()
    await pendingDiskUsage('pc')
    expect(mocks.warn).toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(diskUsageFor('pc', 'ctx', run, 10)).toBeNull()
    expect(run).toHaveBeenCalledTimes(1)
    diskUsageFor('pc', 'ctx', run, DISK_USAGE_TTL_MS + 1)
    expect(run).toHaveBeenCalledTimes(2)
    await pendingDiskUsage('pc')
  })

  it('cada máquina tem o seu cache', async () => {
    const { run, release } = host()
    release()
    diskUsageFor('server', 'x', run, 0)
    diskUsageFor('pc', 'ctx', run, 0)
    expect(run).toHaveBeenCalledTimes(2)
    await Promise.all([pendingDiskUsage('server'), pendingDiskUsage('pc')])
  })
})
