import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ config: vi.fn(), publish: vi.fn(), detect: vi.fn(), rpc: vi.fn(), shell: vi.fn(), now: vi.fn() }))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: mocks.config }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), request: vi.fn(), response: vi.fn() }) }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/host-metrics/server/rpc', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/features/host-metrics/server/rpc')>()), detectHtopPlugin: vi.fn(), callHtopRpc: vi.fn() }))
vi.mock('@/features/host-metrics/server/shell', () => ({ readHostMetricsShell: vi.fn() }))

import { getHostMetrics, heartbeatThresholdMs, refreshHostMetrics, runHostMetricsRefresh, setHostMetricsDepsForTests } from '@/features/host-metrics/server/service'
import { isHtopPluginActive } from '@/features/host-metrics/server/rpc'

const usage = (percent: number, total = 100) => ({ percent, used: (percent / 100) * total, total })
const stats = (cpu = 10) => ({ cpu: usage(cpu, 8), memory: usage(40, 32e9), swap: usage(5, 8e9), disk: usage(60, 1e12) })

const SHELL = [
  'cpu  100 0 100 700 100 0 0 0 0 0',
  'cpu  150 0 150 750 150 0 0 0 0 0',
  '@@meminfo',
  'MemTotal: 1000 kB',
  'MemAvailable: 500 kB',
  'SwapTotal: 0 kB',
  'SwapFree: 0 kB',
  '@@df',
  'Filesystem 1-blocks Used Available Capacity Mounted on',
  '/dev/sda 1000 100 900 10% /',
  '@@cores',
  '4',
].join('\n')

let clock = Date.parse('2026-11-06T12:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  clock = Date.parse('2026-11-06T12:00:00.000Z')
  mocks.now.mockImplementation(() => clock)
  setHostMetricsDepsForTests({ detect: mocks.detect, rpc: mocks.rpc, shell: mocks.shell, now: mocks.now })
  mocks.config.mockImplementation(async (id: string) =>
    id === 'crons' ? { schedulerEnabled: true, jobs: [{ id: 'host-metrics-refresh', enabled: true, schedule: { type: 'interval', seconds: 10 } }] } : { baseUrl: 'http://opencode:4999' },
  )
  mocks.publish.mockResolvedValue(undefined)
  mocks.detect.mockResolvedValue(true)
  mocks.rpc.mockResolvedValue(stats())
})

describe('refreshHostMetrics', () => {
  it('lê pelo RPC do opencode-htop e publica o DTO inteiro', async () => {
    const dto = await refreshHostMetrics()
    expect(dto.state).toBe('ok')
    expect(dto.metrics?.memory.percent).toBe(40)
    expect(dto.checkedAt).toBe('2026-11-06T12:00:00.000Z')
    expect(dto.staleAfterMs).toBe(30_000)
    expect(mocks.shell).not.toHaveBeenCalled()
    expect(mocks.publish).toHaveBeenCalledWith('host-metrics-updated', dto)
  })

  it('plugin ausente: cai para o shell (parser puro)', async () => {
    mocks.detect.mockResolvedValue(false)
    mocks.shell.mockResolvedValue(SHELL)
    const dto = await refreshHostMetrics()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(dto.state).toBe('ok')
    expect(dto.metrics?.cpu.percent).toBe(50)
    expect(dto.metrics?.swap.total).toBe(0)
  })

  it('RPC falhando no uso cai para o shell e só volta ao plugin quando a detecção expira', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('rpc.unavailable'))
    mocks.shell.mockResolvedValue(SHELL)
    expect((await refreshHostMetrics()).metrics?.cpu.percent).toBe(50)
    clock += 10_000
    await refreshHostMetrics()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.shell).toHaveBeenCalledTimes(2)
    clock += 60_000
    expect((await refreshHostMetrics()).metrics?.cpu.percent).toBe(10)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('falha nos dois: estado de erro mantendo a última leitura boa', async () => {
    await refreshHostMetrics()
    mocks.rpc.mockRejectedValue(new Error('x'))
    mocks.shell.mockRejectedValue(new Error('shell'))
    clock += 10_000
    const dto = await refreshHostMetrics()
    expect(dto.state).toBe('error')
    expect(dto.message).toBe('Não foi possível ler os recursos do servidor pelo OpenCode.')
    expect(dto.metrics?.memory.percent).toBe(40)
    expect(dto.checkedAt).toBe('2026-11-06T12:00:00.000Z')
    expect(dto.attemptedAt).toBe('2026-11-06T12:00:10.000Z')
  })

  it('leitura inválida do plugin (total 0) também cai para o shell', async () => {
    mocks.rpc.mockResolvedValue({ ...stats(), disk: usage(0, 0) })
    mocks.shell.mockResolvedValue(SHELL)
    expect((await refreshHostMetrics()).metrics?.disk.total).toBe(1000)
  })

  it('OpenCode sem URL: unconfigured, sem chamar nada', async () => {
    mocks.config.mockImplementation(async (id: string) => (id === 'crons' ? { schedulerEnabled: true, jobs: [] } : { baseUrl: '' }))
    const dto = await refreshHostMetrics()
    expect(dto.state).toBe('unconfigured')
    expect(dto.message).toBe('Configure o OpenCode em Integrações para ver os recursos do servidor.')
    expect(mocks.detect).not.toHaveBeenCalled()
  })

  it('leituras simultâneas usam uma chamada só', async () => {
    let release!: (value: unknown) => void
    mocks.rpc.mockReturnValue(new Promise((done) => (release = done)))
    const first = refreshHostMetrics()
    const second = refreshHostMetrics()
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1))
    release(stats())
    expect(await first).toBe(await second)
  })

  it('publica só quando muda, ou a cada 20 s com os mesmos números', async () => {
    await refreshHostMetrics()
    clock += 10_000
    mocks.rpc.mockResolvedValue(stats(10.3))
    await refreshHostMetrics()
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    clock += 10_000
    await refreshHostMetrics()
    expect(mocks.publish).toHaveBeenCalledTimes(2)
    clock += 1_000
    mocks.rpc.mockResolvedValue(stats(40))
    await refreshHostMetrics()
    expect(mocks.publish).toHaveBeenCalledTimes(3)
  })

  it('prazo de desatualizado acompanha o intervalo da rotina', async () => {
    mocks.config.mockImplementation(async (id: string) =>
      id === 'crons' ? { schedulerEnabled: true, jobs: [{ id: 'host-metrics-refresh', enabled: true, schedule: { type: 'interval', minutes: 1 } }] } : { baseUrl: 'http://opencode:4999' },
    )
    expect((await refreshHostMetrics()).staleAfterMs).toBe(125_000)
  })

  it('getHostMetrics lê na hora sem resultado em memória e depois usa a memória', async () => {
    await getHostMetrics()
    await getHostMetrics()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(await runHostMetricsRefresh()).toBe('CPU 10%, RAM 40%, swap 5%, disco 60%')
  })
})

describe('chamadas penduradas não prendem o single-flight (F1)', () => {
  const hang = () => new Promise<never>(() => undefined)
  const shortDeadlines = { detect: 20, rpc: 20, shell: 20, read: 200 }

  it('plugin.list pendurado: cai para o shell no prazo', async () => {
    setHostMetricsDepsForTests({ detect: hang, rpc: mocks.rpc, shell: mocks.shell, now: mocks.now, deadlines: shortDeadlines })
    mocks.shell.mockResolvedValue(SHELL)
    const dto = await refreshHostMetrics()
    expect(dto.state).toBe('ok')
    expect(dto.metrics?.cpu.percent).toBe(50)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('RPC e shell pendurados: a leitura falha, o pending libera e a seguinte funciona', async () => {
    const rpc = vi.fn(hang)
    const shell = vi.fn(hang)
    setHostMetricsDepsForTests({ detect: mocks.detect, rpc, shell, now: mocks.now, deadlines: shortDeadlines })
    const failed = await refreshHostMetrics()
    expect(failed.state).toBe('error')
    expect(failed.message).toBe('Não foi possível ler os recursos do servidor pelo OpenCode.')

    shell.mockResolvedValue(SHELL)
    const next = await refreshHostMetrics()
    expect(next.state).toBe('ok')
    expect(shell).toHaveBeenCalledTimes(2)
  })

  it('leitura inteira pendurada (ex.: config) estoura o teto e libera', async () => {
    setHostMetricsDepsForTests({ detect: mocks.detect, rpc: mocks.rpc, shell: mocks.shell, now: mocks.now, deadlines: { ...shortDeadlines, read: 30 } })
    mocks.config.mockImplementation(async (id: string) => (id === 'crons' ? { schedulerEnabled: true, jobs: [] } : hang()))
    expect((await refreshHostMetrics()).state).toBe('error')
    mocks.config.mockImplementation(async (id: string) => (id === 'crons' ? { schedulerEnabled: true, jobs: [] } : { baseUrl: 'http://opencode:4999' }))
    expect((await refreshHostMetrics()).state).toBe('ok')
  })
})

describe('heartbeat com folga (F2)', () => {
  it('limiar = 20 s − intervalo/2 (mínimo 0)', () => {
    expect(heartbeatThresholdMs(10_000)).toBe(15_000)
    expect(heartbeatThresholdMs(null)).toBe(15_000)
    expect(heartbeatThresholdMs(60_000)).toBe(0)
  })

  it('leituras com duração variável e números estáveis publicam a cada ~20 s, nunca a 30 s', async () => {
    const publishedAt: number[] = []
    mocks.publish.mockImplementation(async () => void publishedAt.push(clock))
    // Leituras que terminam a cada 10 s, ora antes ora depois (RPC rápido x shell lento).
    const steps = [9_950, 10_040, 9_300, 10_700, 9_960, 9_990, 10_000, 9_400]
    await refreshHostMetrics()
    for (const step of steps) {
      clock += step
      await refreshHostMetrics()
    }
    const gaps = publishedAt.slice(1).map((value, index) => value - publishedAt[index]!)
    expect(gaps.length).toBeGreaterThan(2)
    for (const gap of gaps) expect(gap).toBeLessThan(25_000)
  })
})

describe('isHtopPluginActive', () => {
  it('exige o plugin ativo e com RPC', () => {
    expect(isHtopPluginActive([{ id: 'opencode-htop', features: { rpc: true }, state: { status: 'active' } }])).toBe(true)
    expect(isHtopPluginActive([{ source: { type: 'local', path: '/home/u/code/opencode-htop' }, features: { rpc: true }, state: { status: 'active' } }])).toBe(true)
    expect(isHtopPluginActive([{ id: 'opencode-htop', features: {}, state: { status: 'active' } }])).toBe(false)
    expect(isHtopPluginActive([{ id: 'opencode-htop', features: { rpc: true }, state: { status: 'failed' } }])).toBe(false)
    expect(isHtopPluginActive([])).toBe(false)
  })
})
