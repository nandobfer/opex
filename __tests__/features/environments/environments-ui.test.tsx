/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { DeployEvent, EnvironmentDeploySummaryDto, EnvironmentDto, UnmanagedProjectDto } from '@/features/environments/types'

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
import { DeployDrawer } from '@/features/environments/components/DeployDrawer'
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
  deployedOn: { buildOn: 'server', runOn: 'server' },
  deployedVersion: '1.43.0',
  lastDeploy: null,
  services: [{ service: 'app', container: 'loja-app-1', state: 'running', status: 'Up', ports: '', cpu: '1.5%', memory: '120MiB / 8GiB', version: '1.44.0' }],
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
    render(<EnvironmentRow env={env()} pcAvailable onIntent={onIntent} onOpenDeploy={vi.fn()} />)
    expect(screen.getByText('No ar')).toBeTruthy()
    expect(screen.getByText(/CPU 1.5% · RAM 120MiB/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Derrubar' }))
    expect(mocks.action).toHaveBeenCalledWith({ action: 'down' }, expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(onIntent).toHaveBeenCalledWith({ kind: 'delete' })
  })

  it('ambiente no PC com o túnel fechado: ações bloqueadas', () => {
    render(<EnvironmentRow env={env({ runOn: 'pc', deployedOn: { buildOn: 'pc', runOn: 'pc' } })} pcAvailable={false} onIntent={vi.fn()} onOpenDeploy={vi.fn()} />)
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
    render(<EnvironmentRow env={env({ lastDeploy: deploy({ status: 'running', finishedAt: null, durationMs: null }) })} pcAvailable onIntent={onIntent} onOpenDeploy={vi.fn()} />)
    expect(screen.getByText('v1.44.0')).toBeTruthy()
    expect(screen.getByText('Implantando')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Levantar' }).hasAttribute('disabled')).toBe(true)
    const history = screen.getByRole('button', { name: 'Histórico' })
    expect(history.hasAttribute('disabled')).toBe(false)
    fireEvent.click(history)
    expect(onIntent).toHaveBeenCalledWith({ kind: 'history' })
  })

  it('histórico: data, duração, build → execução, resultado, ref@commit, versão, marcas e erro; a linha abre o log', () => {
    mocks.deploys.data = [deploy(), deploy({ id: 'd2', kind: 'move', status: 'failed', durationMs: 45_000, ref: 'feature', commit: null, error: 'Sobe no servidor falhou (código 1)', skipBuild: false, resumed: false, version: null })]
    const onOpenDeploy = vi.fn()
    render(<DeployHistoryDialog env={env()} onClose={vi.fn()} onOpenDeploy={onOpenDeploy} />)
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
    fireEvent.click(screen.getByText('Mover'))
    expect(onOpenDeploy).toHaveBeenCalledWith('d2')
  })

  it('histórico vazio', () => {
    mocks.deploys.data = []
    render(<DeployHistoryDialog env={env()} onClose={vi.fn()} onOpenDeploy={vi.fn()} />)
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
    render(<DeployDrawer deployId="d1" title="Loja" onClose={vi.fn()} />)
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
    render(<DeployDrawer deployId="d1" title="Loja" onClose={vi.fn()} />)
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
    render(<DeployDrawer deployId="d1" title="Loja" onClose={vi.fn()} />)
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
    render(<DeployDrawer deployId="d1" title="Loja" onClose={vi.fn()} />)
    expect(await screen.findByText('Reconectando ao servidor…')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(await screen.findByText('Falhou: Sobe no servidor falhou (código 1)')).toBeTruthy()
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
