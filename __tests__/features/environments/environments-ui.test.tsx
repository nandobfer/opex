/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { DeployEvent, DeployStreamEvent, EnvironmentDeploySummaryDto, EnvironmentDto, UnmanagedProjectDto } from '@/features/environments/types'

/** Ambientes: linha com ações, opções de máquina com o PC fechado, mover e não gerenciados. */

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  deploys: { isLoading: false, isError: false, data: [] as unknown[], error: null, refetch: vi.fn() },
  readNdjson: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/environments/hooks/useEnvironments', () => ({
  useEnvironmentAction: () => ({ mutate: mocks.action, isPending: false }),
  useEnvironmentDeploys: () => mocks.deploys,
}))
vi.mock('@/lib/ndjson-client', () => ({ readNdjson: mocks.readNdjson }))
vi.mock('@/features/integrations/components/IntegrationConsole', () => ({ IntegrationConsole: () => <div data-testid="console" /> }))

import { EnvironmentRow } from '@/features/environments/components/EnvironmentRow'
import { MoveDialog } from '@/features/environments/components/MoveDialog'
import { UnmanagedList } from '@/features/environments/components/UnmanagedList'
import { DeployLog } from '@/features/environments/components/DeployLog'
import { DeployHistoryDialog } from '@/features/environments/components/DeployHistoryDialog'
import { formatDuration, formValuesOf, groupByMachine, healthOf, machineOptions, moveWarning, slugify, versionLabel } from '@/features/environments/view'

const env = (overrides: Partial<EnvironmentDto> = {}): EnvironmentDto => ({
  id: 'e1',
  name: 'Loja',
  slug: 'loja',
  source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' },
  envKeys: ['TOKEN'],
  ports: [4100],
  healthUrl: null,
  buildOn: 'server',
  runOn: 'server',
  limits: { mode: 'shared', memoryGb: null, cpus: null, swapGb: null },
  limitsConfigured: false,
  deployedLimits: null,
  deployedOn: { buildOn: 'server', runOn: 'server' },
  deployedVersion: '1.43.0',
  lastDeploy: null,
  services: [{ service: 'app', container: 'loja-app-1', state: 'running', status: 'Up', ports: '', cpu: '1.5%', memory: '120MiB / 8GiB', version: '1.44.0', limits: null }],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('regras de tela', () => {
  it('agrupa pela máquina de execução, saúde e slug sugerido', () => {
    const groups = groupByMachine([env(), env({ id: 'e2', deployedOn: null, runOn: 'pc' })])
    expect([groups.server.length, groups.pc.length]).toEqual([1, 1])
    expect(healthOf(env())).toBe('running')
    expect(healthOf(env({ services: [], deployedOn: null }))).toBe('never')
    expect(slugify('Loja Virtual — Homologação')).toBe('loja-virtual-homologacao')
  })

  it('PC fechado: opção desabilitada com o motivo', () => {
    expect(machineOptions(false, 'Túnel fechado')[1]).toMatchObject({ value: 'pc', disabled: true, title: 'Túnel fechado' })
    expect(machineOptions(true, null)[1]!.disabled).toBe(false)
  })

  it('edição: variáveis voltam só com o nome (valor vazio mantém)', () => {
    expect(formValuesOf(env(), { centralId: '', projectName: '' }).env).toEqual([{ key: 'TOKEN', value: '' }])
  })

  it('aviso do mover: mesma porta derruba antes; volumes não migram', () => {
    expect(moveWarning(env(), 'pc')).toContain('derrubado na origem antes')
    expect(moveWarning(env({ ports: [] }), 'pc')).toContain('Sobe no destino')
    expect(moveWarning(env(), 'server')).toBeNull()
  })
})

describe('linha do ambiente', () => {
  it('mostra estado, CPU/RAM e dispara levantar/derrubar; apagar pede confirmação fora', () => {
    const onIntent = vi.fn()
    render(<EnvironmentRow env={env()} pcAvailable onIntent={onIntent} />)
    expect(screen.getByText('No ar')).toBeTruthy()
    expect(screen.getByText(/CPU 1.5% · RAM 120MiB/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Derrubar' }))
    expect(mocks.action).toHaveBeenCalledWith({ action: 'down' }, expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(onIntent).toHaveBeenCalledWith({ kind: 'delete' })
    // Limites não lidos: nada de texto nem selo.
    expect(document.body.textContent).not.toContain('limites:')
    expect(screen.queryByText(/faça Deploy/)).toBeNull()
  })

  it('limites aplicados na linha; salvos diferentes dos aplicados pedem Deploy (OPE-193)', () => {
    const applied = { memoryGb: 4, swapGb: null, cpus: 2 }
    const services = [{ ...env().services[0]!, limits: applied }]
    render(<EnvironmentRow env={env({ services, limitsConfigured: true, deployedLimits: { mode: 'shared', ...applied }, limits: { mode: 'shared', ...applied } })} pcAvailable onIntent={vi.fn()} />)
    expect(screen.getByText(/limites: RAM 4 GiB · swap padrão · 2 CPUs/)).toBeTruthy()
    expect(screen.queryByText(/faça Deploy/)).toBeNull()
    cleanup()
    render(<EnvironmentRow env={env({ services, limitsConfigured: true, deployedLimits: { mode: 'shared', ...applied }, limits: { mode: 'shared', memoryGb: 8, swapGb: null, cpus: 2 } })} pcAvailable onIntent={vi.fn()} />)
    expect(screen.getByText('Limites salvos diferem dos aplicados: faça Deploy')).toBeTruthy()
    cleanup()
    // Nunca implantado: não há o que comparar.
    render(<EnvironmentRow env={env({ services, deployedOn: null, limitsConfigured: true, limits: { mode: 'shared', memoryGb: 8, swapGb: null, cpus: 2 } })} pcAvailable onIntent={vi.fn()} />)
    expect(screen.queryByText(/faça Deploy/)).toBeNull()
  })

  it('serviços do compose (OPE-211): resumo dos ajustes implantados e o selo quando os salvos diferem', () => {
    const app = { service: 'app', image: 'nginx:1.27', command: null, entrypoint: null, environment: null, labels: null, ports: null, volumes: null, restart: 'always' as const, healthcheck: null, dependsOn: null }
    const deployed = { services: [app], yaml: '' }
    render(<EnvironmentRow env={env({ composeOverrides: deployed, deployedComposeOverrides: deployed })} pcAvailable onIntent={vi.fn()} onOpenDeploy={vi.fn()} />)
    expect(screen.getByText(/serviços: app imagem nginx:1\.27 · 2 ajustes/)).toBeTruthy()
    expect(screen.queryByText(/Ajustes dos serviços salvos diferem/)).toBeNull()
    cleanup()
    render(<EnvironmentRow env={env({ composeOverrides: { services: [{ ...app, restart: null }], yaml: '' }, deployedComposeOverrides: deployed })} pcAvailable onIntent={vi.fn()} onOpenDeploy={vi.fn()} />)
    expect(screen.getByText('Ajustes dos serviços salvos diferem dos implantados: faça Deploy')).toBeTruthy()
    cleanup()
    render(<EnvironmentRow env={env({ deployedOn: null, composeOverrides: deployed })} pcAvailable onIntent={vi.fn()} onOpenDeploy={vi.fn()} />)
    expect(screen.queryByText(/Ajustes dos serviços salvos diferem/)).toBeNull()
  })

  it('ambiente no PC com o túnel fechado: ações bloqueadas', () => {
    render(<EnvironmentRow env={env({ runOn: 'pc', deployedOn: { buildOn: 'pc', runOn: 'pc' } })} pcAvailable={false} onIntent={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Levantar' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: /Redeploy/ }).hasAttribute('disabled')).toBe(true)
  })
})

const deploy = (overrides: Partial<EnvironmentDeploySummaryDto> = {}): EnvironmentDeploySummaryDto => ({
  id: 'd1',
  kind: 'deploy',
  status: 'success',
  ref: 'main',
  commit: 'abc123def4567890',
  buildOn: 'pc',
  runOn: 'server',
  error: null,
  startedAt: '2026-10-28T15:27:58.000Z',
  finishedAt: '2026-10-28T15:31:10.000Z',
  durationMs: 192_000,
  version: '1.44.0',
  skipBuild: true,
  resumed: true,
  ...overrides,
})

describe('versão e histórico de deploys', () => {
  it('versão: a dos containers no ar (por serviço quando diferem); sem ela, a do último deploy', () => {
    expect(versionLabel(env())).toEqual({ text: 'v1.44.0', live: true })
    const two = env({ services: [...env().services, { ...env().services[0]!, service: 'worker', version: '1.40.0' }] })
    expect(versionLabel(two)!.text).toBe('app v1.44.0 · worker v1.40.0')
    expect(versionLabel(env({ services: [] }))).toEqual({ text: 'v1.43.0', live: false })
    expect(versionLabel(env({ services: [], deployedVersion: null }))).toBeNull()
    expect([formatDuration(45_000), formatDuration(192_000), formatDuration(3_900_000)]).toEqual(['45 s', '3 min 12 s', '1 h 05 min'])
  })

  it('a linha mostra a versão e o Histórico fica disponível mesmo durante o deploy', () => {
    const onIntent = vi.fn()
    render(<EnvironmentRow env={env({ lastDeploy: deploy({ status: 'running', finishedAt: null, durationMs: null }) })} pcAvailable onIntent={onIntent} />)
    expect(screen.getByText('v1.44.0')).toBeTruthy()
    expect(screen.getByText('Implantando')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Levantar' }).hasAttribute('disabled')).toBe(true)
    // "Último deploy …" leva à página do log (OPE-208: antes abria a gaveta).
    expect(screen.getByRole('link', { name: /Último deploy em andamento/ }).getAttribute('href')).toBe('/ambientes/deploys/d1')
    const history = screen.getByRole('button', { name: 'Histórico' })
    expect(history.hasAttribute('disabled')).toBe(false)
    fireEvent.click(history)
    expect(onIntent).toHaveBeenCalledWith({ kind: 'history' })
  })

  it('histórico: data, duração, build → execução, resultado, ref@commit, versão, marcas e erro; a linha é o link para a página do log', () => {
    mocks.deploys.data = [deploy(), deploy({ id: 'd2', kind: 'move', status: 'failed', durationMs: 45_000, ref: 'feature', commit: null, error: 'Sobe no servidor falhou (código 1)', skipBuild: false, resumed: false, version: null })]
    render(<DeployHistoryDialog env={env()} onClose={vi.fn()} />)
    expect(screen.getAllByText(/28\/10\/2026/, { selector: 'span' })).toHaveLength(2)
    expect(screen.getByText('· 3 min 12 s')).toBeTruthy()
    expect(screen.getByText('· 45 s')).toBeTruthy()
    expect(screen.getAllByText('Build no pc → execução no servidor')).toHaveLength(2)
    expect(screen.getByText('main @ abc123de', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText('v1.44.0')).toBeTruthy()
    expect(screen.getByText('Build reaproveitado')).toBeTruthy()
    expect(screen.getByText('Recuperado após reinício')).toBeTruthy()
    expect(screen.getByText('Mover')).toBeTruthy()
    expect(screen.getByText('Sobe no servidor falhou (código 1)')).toBeTruthy()
    expect(screen.getByText('Mover').closest('a')!.getAttribute('href')).toBe('/ambientes/deploys/d2')
  })

  it('histórico vazio', () => {
    mocks.deploys.data = []
    render(<DeployHistoryDialog env={env()} onClose={vi.fn()} />)
    expect(screen.getByText('Nenhum deploy ainda')).toBeTruthy()
  })
})

describe('log do deploy ao vivo', () => {
  afterEach(() => vi.useRealTimers())

  it('regressão: a conexão cai (o app reiniciou) → reconecta e mostra o status final, sem "Falhou"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mocks.readNdjson.mockRejectedValueOnce(new TypeError('network error')).mockImplementationOnce(async (_path: string, onEvent: (event: DeployEvent) => void) => {
      onEvent({ type: 'log', text: 'Deploy de Loja\n' })
      onEvent({ type: 'status', status: 'success', error: null })
    })
    render(<DeployLog deployId="d1" />)
    expect(await screen.findByText('Reconectando ao servidor…')).toBeTruthy()
    expect(screen.queryByText(/Falhou/)).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(await screen.findByText('Concluído')).toBeTruthy()
    expect(mocks.readNdjson).toHaveBeenCalledTimes(2)
  })

  it('regressão: o limite de reconexão conta desde a queda, não desde a abertura do log (build longo)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let drop!: () => void
    mocks.readNdjson
      .mockImplementationOnce(async (_path: string, onEvent: (event: DeployEvent) => void) => {
        onEvent({ type: 'log', text: 'Build no servidor\n' })
        await new Promise<void>((resolve) => (drop = resolve))
        throw new TypeError('network error')
      })
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockImplementationOnce(async (_path: string, onEvent: (event: DeployEvent) => void) => onEvent({ type: 'status', status: 'success', error: null }))
    render(<DeployLog deployId="d1" />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000)
    })
    await act(async () => drop())
    expect(await screen.findByText('Reconectando ao servidor…')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(screen.queryByText(/Sem conexão com o servidor/)).toBeNull()
    expect(screen.getByText('Reconectando ao servidor…')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(await screen.findByText('Concluído')).toBeTruthy()
  })

  it('sem conseguir reconectar por mais de 3 min desde a queda: desiste com a mensagem', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mocks.readNdjson.mockRejectedValue(new TypeError('network error'))
    render(<DeployLog deployId="d1" />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(190_000)
    })
    expect(await screen.findByText(/Sem conexão com o servidor/)).toBeTruthy()
    mocks.readNdjson.mockReset()
  })

  it('stream que fecha sem status (outro processo cuida do deploy) também reconecta', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mocks.readNdjson.mockImplementationOnce(async (_path: string, onEvent: (event: DeployEvent) => void) => onEvent({ type: 'log', text: 'parcial\n' })).mockImplementationOnce(async (_path: string, onEvent: (event: DeployEvent) => void) => {
      onEvent({ type: 'status', status: 'failed', error: 'Sobe no servidor falhou (código 1)' })
    })
    render(<DeployLog deployId="d1" />)
    expect(await screen.findByText('Reconectando ao servidor…')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(await screen.findByText('Falhou: Sobe no servidor falhou (código 1)')).toBeTruthy()
  })
})

describe('barra de progresso do deploy (OPE-202)', () => {
  afterEach(() => vi.useRealTimers())

  const START = '2026-11-26T15:00:00.000Z'
  const meta = (estimateMs: number | null, serverNow = new Date().toISOString()): DeployStreamEvent => ({ type: 'meta', startedAt: START, serverNow, estimateMs, sampleSize: estimateMs === null ? 0 : 5, initial: false })
  /** Stream que entrega os eventos e fica aberto até `finish` (deploy em andamento). */
  function liveStream(events: DeployStreamEvent[]) {
    let push!: (event: DeployStreamEvent) => void
    let finish!: () => void
    mocks.readNdjson.mockImplementationOnce(async (_path: string, onEvent: (event: DeployStreamEvent) => void) => {
      push = onEvent
      for (const event of events) onEvent(event)
      await new Promise<void>((resolve) => (finish = resolve))
    })
    return { push: (event: DeployStreamEvent) => push(event), finish: () => finish() }
  }
  const progressbar = () => screen.queryByRole('progressbar')

  it('em andamento com estimativa: % coerente, decorrido e restante', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(Date.parse(START) + 72_000))
    liveStream([meta(200_000), { type: 'log', text: 'Build\n' }])
    render(<DeployLog deployId="d1" />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(progressbar()!.getAttribute('aria-valuenow')).toBe('36')
    expect(progressbar()!.getAttribute('aria-label')).toMatch(/tempo decorrido sobre a duração prevista/)
    expect(screen.getByText(/há 01:1\d · restam ~02:0\d/)).toBeTruthy()
  })

  it.each([
    ['atrasado 2 min', -120_000],
    ['adiantado 2 min', 120_000],
  ])('relógio do navegador %s em relação ao servidor: o decorrido segue o servidor', async (_label, offset) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const serverNow = new Date(Date.parse(START) + 72_000)
    vi.setSystemTime(new Date(serverNow.getTime() + offset))
    liveStream([meta(200_000, serverNow.toISOString())])
    render(<DeployLog deployId="d1" />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(progressbar()!.getAttribute('aria-valuenow')).toBe('36')
    expect(screen.getByText(/há 01:1\d · restam ~02:0\d/)).toBeTruthy()
  })

  it('sem histórico: barra indeterminada, sem aria-valuenow, só o decorrido', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(Date.parse(START) + 72_000))
    liveStream([meta(null)])
    render(<DeployLog deployId="d1" />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(progressbar()!.hasAttribute('aria-valuenow')).toBe(false)
    expect(screen.getByText(/^há 01:1\d$/)).toBeTruthy()
  })

  it('ao concluir ou falhar a barra sai de cena e o status final continua', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const ok = liveStream([meta(200_000)])
    render(<DeployLog deployId="d1" />)
    expect(await screen.findByRole('progressbar')).toBeTruthy()
    await act(async () => ok.push({ type: 'status', status: 'success', error: null }))
    expect(screen.getByText('Concluído')).toBeTruthy()
    expect(progressbar()).toBeNull()
    cleanup()
    const bad = liveStream([meta(200_000)])
    render(<DeployLog deployId="d2" />)
    expect(await screen.findByRole('progressbar')).toBeTruthy()
    await act(async () => bad.push({ type: 'status', status: 'failed', error: 'up -d falhou' }))
    expect(screen.getByText('Falhou: up -d falhou')).toBeTruthy()
    expect(progressbar()).toBeNull()
  })

  it('deploy já encerrado (aberto pelo histórico, sem meta): nenhuma barra', async () => {
    mocks.readNdjson.mockImplementationOnce(async (_path: string, onEvent: (event: DeployStreamEvent) => void) => {
      onEvent({ type: 'log', text: 'tudo\n' })
      onEvent({ type: 'status', status: 'success', error: null })
    })
    render(<DeployLog deployId="d1" />)
    expect(await screen.findByText('Concluído')).toBeTruthy()
    expect(progressbar()).toBeNull()
  })

  it('reconexão com um novo meta não zera o relógio (segue o startedAt absoluto)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(Date.parse(START) + 72_000))
    mocks.readNdjson.mockImplementationOnce(async (_path: string, onEvent: (event: DeployStreamEvent) => void) => {
      onEvent(meta(null))
      throw new TypeError('network error')
    })
    liveStream([meta(null)])
    render(<DeployLog deployId="d1" />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100)
    })
    expect(mocks.readNdjson).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/^há 01:1\d$/)).toBeTruthy()
  })
})

describe('mover e não gerenciados', () => {
  it('mover para o PC mostra o aviso e manda build/execução', () => {
    render(<MoveDialog env={env()} pcAvailable pcReason={null} onClose={vi.fn()} onStarted={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('radio', { name: 'PC' })[1]!)
    expect(screen.getByText(/derrubado na origem antes/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mover e implantar' }))
    expect(mocks.action).toHaveBeenCalledWith({ action: 'move', buildOn: 'server', runOn: 'pc' }, expect.anything())
  })

  it('projetos não gerenciados com e sem git, com a ação Adotar', () => {
    const projects: UnmanagedProjectDto[] = [
      { machine: 'server', projectName: 'loja', workingDir: '/home/u/loja', configFiles: ['/home/u/loja/docker-compose.yml'], git: true, containers: 2, running: 1 },
      { machine: 'pc', projectName: 'scratch', workingDir: '/tmp/scratch', configFiles: ['/tmp/scratch/compose.yml'], git: false, containers: 1, running: 1 },
    ]
    const onAdopt = vi.fn()
    render(<UnmanagedList projects={projects} onAdopt={onAdopt} />)
    expect(screen.getByText('sem git')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Adotar' })[1]!)
    expect(onAdopt).toHaveBeenCalledWith(projects[1])
  })
})
