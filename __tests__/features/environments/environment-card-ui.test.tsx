/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { ContainerPortDto } from '@/features/environments/container-ports'
import type { EnvironmentDeploySummaryDto, EnvironmentDto, PortalEnvironmentDto } from '@/features/environments/types'

/** Ambientes (OPE-211): card do dono e do portal, containers com as portas, menu de ações e faixa de aviso. */

const mocks = vi.hoisted(() => ({ action: vi.fn(), push: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/features/environments/hooks/useEnvironments', () => ({ useEnvironmentAction: () => ({ mutate: mocks.action, isPending: false }) }))

import { EnvironmentCard } from '@/features/environments/components/EnvironmentCard'
import { EnvironmentCardSkeleton } from '@/features/environments/components/card/EnvironmentCardSkeleton'
import { PortalEnvironmentCard } from '@/features/environments/portal/PortalEnvironmentCard'

const port = (overrides: Partial<ContainerPortDto> = {}): ContainerPortDto => ({ container: 3000, protocol: 'tcp', published: 4100, hostIp: null, reach: 'link', ...overrides })

const service = (overrides: Partial<EnvironmentDto['services'][number]> = {}): EnvironmentDto['services'][number] => ({
  service: 'app',
  container: 'loja-app-1',
  state: 'running',
  status: 'Up 3 hours',
  ports: '0.0.0.0:4100->3000/tcp',
  listen: [port()],
  cpu: '1.5%',
  memory: '120MiB / 8GiB',
  version: '1.44.0',
  limits: null,
  usage: { cpuPercent: 1.5, memoryBytes: 120 * 1024 ** 2, swapBytes: 0, diskBytes: 2 * 1024 ** 3, volumes: [], diskCheckedAt: '2026-11-28T10:00:00.000Z' },
  ...overrides,
})

const GIB = 1024 ** 3
const HOST = { cpus: 8, memoryGb: 8, swapGb: 4, disk: { totalBytes: 100 * GIB, usedBytes: 40 * GIB } }

const deploy = (overrides: Partial<EnvironmentDeploySummaryDto> = {}): EnvironmentDeploySummaryDto => ({
  id: 'd1',
  kind: 'deploy',
  status: 'success',
  ref: 'main',
  commit: 'abc123def4567890',
  buildOn: 'server',
  runOn: 'server',
  error: null,
  startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: 1000,
  version: '1.44.0',
  skipBuild: false,
  resumed: false,
  composeVersion: null,
  ...overrides,
})

const env = (overrides: Partial<EnvironmentDto> = {}): EnvironmentDto => ({
  id: 'e1',
  name: 'Loja',
  slug: 'loja',
  source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' },
  envKeys: [],
  ports: [4100],
  healthUrl: null,
  buildOn: 'server',
  runOn: 'server',
  limits: { mode: 'shared', memoryGb: null, cpus: null, swapGb: null },
  limitsConfigured: false,
  deployedLimits: null,
  composeOverrides: null,
  deployedComposeOverrides: null,
  deployedOn: { buildOn: 'server', runOn: 'server' },
  deployedVersion: '1.43.0',
  deployedComposeVersion: null,
  lastDeploy: deploy(),
  services: [service(), service({ service: 'db', container: 'loja-db-1', listen: [port({ container: 5432, published: null, reach: 'internal' })], cpu: null, memory: null })],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

const openMenu = (name = 'Loja') => fireEvent.pointerDown(screen.getByRole('button', { name: `Mais ações de ${name}` }), { button: 0, pointerType: 'mouse' })
const menuItem = (name: string) => screen.getByRole('menuitem', { name: new RegExp(`^${name}`) })

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('card do ambiente (dono)', () => {
  it('cabeçalho: estado, nome como link para editar, origem, onde está e a versão', () => {
    render(<EnvironmentCard env={env()} pcAvailable linkHost="192.168.0.64" onIntent={vi.fn()} />)
    expect(screen.getByText('No ar')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Loja' }).getAttribute('href')).toBe('/ambientes/e1/editar')
    expect(screen.getByText('Central')).toBeTruthy()
    expect(screen.getByText('v1.44.0')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Último deploy ok/ }).getAttribute('href')).toBe('/ambientes/deploys/d1')
    expect(screen.getByText('2/2 no ar')).toBeTruthy()
  })

  it('cada container com as portas: a publicada é link em aba nova e o copiar copia a URL', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<EnvironmentCard env={env()} pcAvailable linkHost="192.168.0.64" onIntent={vi.fn()} />)
    const app = document.querySelector('[data-service="app"]') as HTMLElement
    expect(app.textContent).toContain('3000/tcp')
    const link = within(app).getByRole('link', { name: 'Abrir http://192.168.0.64:4100' })
    expect(link.getAttribute('href')).toBe('http://192.168.0.64:4100')
    expect(link.getAttribute('target')).toBe('_blank')
    fireEvent.click(within(app).getByRole('button', { name: 'Copiar o link http://192.168.0.64:4100' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://192.168.0.64:4100'))
    expect(mocks.toast.success).toHaveBeenCalledWith('Link copiado.')
    // Porta só na rede do compose: texto, sem link nem copiar.
    const db = document.querySelector('[data-service="db"]') as HTMLElement
    expect(db.textContent).toContain('5432/tcp')
    expect(within(db).queryByRole('link')).toBeNull()
    expect(within(db).queryByRole('button')).toBeNull()
  })

  it('container sem porta declarada e ambiente nunca implantado', () => {
    render(<EnvironmentCard env={env({ services: [service({ listen: [] })] })} pcAvailable linkHost="h" onIntent={vi.fn()} />)
    expect(screen.getByText('sem porta declarada')).toBeTruthy()
    cleanup()
    render(<EnvironmentCard env={env({ services: [], deployedOn: null, lastDeploy: null })} pcAvailable linkHost="h" onIntent={vi.fn()} />)
    expect(screen.getByText('Nunca implantado')).toBeTruthy()
    expect(screen.getByText(/Nunca implantado: faça o deploy/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Logs/ }).hasAttribute('disabled')).toBe(true)
  })

  it('ações: Deploy e Logs visíveis; o resto no menu ⋯ (Levantar, Derrubar, Reiniciar, Histórico, Editar, Mover, Apagar)', () => {
    const onIntent = vi.fn()
    render(<EnvironmentCard env={env()} pcAvailable linkHost="h" onIntent={onIntent} />)
    expect(screen.getByRole('button', { name: /Redeploy/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Logs/ }))
    expect(mocks.action).toHaveBeenCalledWith({ action: 'logs' }, expect.anything())
    expect(screen.queryByRole('button', { name: 'Derrubar' })).toBeNull()
    openMenu()
    for (const label of ['Levantar', 'Derrubar', 'Reiniciar', 'Histórico de deploys', 'Editar', 'Mover', 'Apagar']) expect(menuItem(label)).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Compose/ })).toBeNull()
    fireEvent.click(menuItem('Derrubar'))
    expect(mocks.action).toHaveBeenCalledWith({ action: 'down' }, expect.anything())
    openMenu()
    fireEvent.click(menuItem('Apagar'))
    expect(onIntent).toHaveBeenCalledWith({ kind: 'delete' })
    openMenu()
    fireEvent.click(menuItem('Editar'))
    expect(mocks.push).toHaveBeenCalledWith('/ambientes/e1/editar')
  })

  it('itens desligados com o motivo: PC indisponível e nunca implantado; deploy em andamento desliga Editar', () => {
    render(<EnvironmentCard env={env({ runOn: 'pc', deployedOn: { buildOn: 'pc', runOn: 'pc' } })} pcAvailable={false} linkHost="h" onIntent={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Redeploy/ }).hasAttribute('disabled')).toBe(true)
    openMenu()
    expect(menuItem('Levantar').getAttribute('aria-disabled')).toBe('true')
    expect(menuItem('Levantar').textContent).toContain('PC indisponível')
    cleanup()
    render(<EnvironmentCard env={env({ deployedOn: null, services: [] })} pcAvailable linkHost="h" onIntent={vi.fn()} />)
    openMenu()
    expect(menuItem('Reiniciar').textContent).toContain('ainda não foi implantado')
    cleanup()
    render(<EnvironmentCard env={env({ lastDeploy: deploy({ status: 'running', finishedAt: null, durationMs: null }) })} pcAvailable linkHost="h" onIntent={vi.fn()} />)
    expect(screen.getByText('Implantando')).toBeTruthy()
    openMenu()
    expect(menuItem('Editar').getAttribute('aria-disabled')).toBe('true')
    expect(menuItem('Histórico de deploys').hasAttribute('aria-disabled')).toBe(false)
  })

  it('compose gerenciado: Compose no menu', () => {
    const onIntent = vi.fn()
    render(<EnvironmentCard env={env({ source: { kind: 'managed', projectName: 'loja', services: [], composeVersion: 3 }, deployedComposeVersion: 3 })} pcAvailable linkHost="h" onIntent={onIntent} />)
    expect(screen.getByText('Gerenciado v3')).toBeTruthy()
    openMenu()
    fireEvent.click(menuItem('Compose'))
    expect(onIntent).toHaveBeenCalledWith({ kind: 'compose' })
  })

  it('faixa de aviso: só com algo pendente, os itens numa linha e "Fazer deploy" chama o deploy', () => {
    render(<EnvironmentCard env={env()} pcAvailable linkHost="h" onIntent={vi.fn()} />)
    expect(screen.queryByText(/Mudanças salvas ainda não implantadas/)).toBeNull()
    cleanup()
    const app = { service: 'app', image: 'nginx:1.27', command: null, entrypoint: null, environment: null, labels: null, ports: null, volumes: null, restart: null, healthcheck: null, dependsOn: null }
    render(
      <EnvironmentCard
        env={env({
          source: { kind: 'managed', projectName: 'loja', services: [], composeVersion: 4 },
          deployedComposeVersion: 3,
          limitsConfigured: true,
          limits: { mode: 'shared', memoryGb: 8, swapGb: null, cpus: 2 },
          deployedLimits: { mode: 'shared', memoryGb: 4, swapGb: null, cpus: 2 },
          composeOverrides: { services: [app], yaml: '' },
          deployedComposeOverrides: null,
        })}
        pcAvailable
        linkHost="h"
        onIntent={vi.fn()}
      />,
    )
    expect(screen.getByText('Mudanças salvas ainda não implantadas: limites, ajustes dos serviços e compose v4 (implantado: v3).')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Fazer deploy/ }))
    expect(mocks.action).toHaveBeenCalledWith({ action: 'deploy', ref: '' }, expect.anything())
  })

  it('executa no PC: porta repassada vira link, a não repassada fica como texto; rodapé com as portas liberadas', () => {
    const services = [service({ listen: [port({ reach: 'link' }), port({ container: 9229, published: 9229, reach: 'pc' })] })]
    render(<EnvironmentCard env={env({ runOn: 'pc', deployedOn: { buildOn: 'pc', runOn: 'pc' }, services })} pcAvailable linkHost="srv" onIntent={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Abrir http://srv:4100' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /9229/ })).toBeNull()
    expect(screen.getByText(/:9229/).closest('[data-reach]')!.getAttribute('title')).toContain('só no PC')
    expect(screen.getByText('Portas liberadas: 4100')).toBeTruthy()
  })

  it('skeleton com a estrutura do card (cabeçalho, uso do ambiente, containers com 4 barras e rodapé)', () => {
    render(<EnvironmentCardSkeleton cards={2} containers={3} />)
    const skeleton = screen.getByTestId('environment-card-skeleton')
    expect(skeleton.children).toHaveLength(2)
    expect(skeleton.children[0]!.querySelectorAll('.md\\:grid')).toHaveLength(3)
    expect(skeleton.children[0]!.querySelectorAll('[data-skeleton-usage-summary]')).toHaveLength(1)
    // 4 da faixa + 4 por container.
    expect(skeleton.children[0]!.querySelectorAll('[data-skeleton-usage-bar]')).toHaveLength(4 + 3 * 4)
    cleanup()
    render(<EnvironmentCardSkeleton variant="portal" cards={1} />)
    expect(document.querySelectorAll('[data-skeleton-usage-bar]')).toHaveLength(0)
  })

  it('coluna Recursos: 4 barras por container, com o % e a base (limite ou servidor)', () => {
    const limited = service({ limits: { memoryGb: 1, swapGb: null, cpus: 2 }, usage: { cpuPercent: 50, memoryBytes: 512 * 1024 ** 2, swapBytes: 0, diskBytes: GIB, volumes: [], diskCheckedAt: '2026-11-28T10:00:00.000Z' } })
    render(<EnvironmentCard env={env({ services: [limited] })} pcAvailable linkHost="h" capacity={HOST} onIntent={vi.fn()} />)
    const app = document.querySelector('[data-service="app"]') as HTMLElement
    const bars = within(app).getAllByRole('progressbar')
    expect(bars).toHaveLength(4)
    const memory = app.querySelector('[data-usage-metric="memory"]') as HTMLElement
    expect(memory.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('50')
    expect(memory.textContent).toContain('512 MiB de 1 GiB (limite)')
    const cpu = app.querySelector('[data-usage-metric="cpu"]') as HTMLElement
    expect(cpu.textContent).toContain('0,5 de 2 CPUs (limite)')
    const disk = app.querySelector('[data-usage-metric="disk"]') as HTMLElement
    expect(disk.textContent).toContain('1 GiB de 100 GiB (servidor)')
  })

  it('"Sem swap", "lendo…" e container parado como texto; sem a capacidade da máquina, "não lido"', () => {
    const reading = service({ usage: { cpuPercent: 1, memoryBytes: GIB, swapBytes: null, diskBytes: null, volumes: [], diskCheckedAt: null } })
    const stopped = service({ service: 'worker', container: 'loja-worker-1', state: 'exited', status: 'Exited (0)', listen: [] })
    render(<EnvironmentCard env={env({ services: [reading, stopped] })} pcAvailable linkHost="h" capacity={{ ...HOST, swapGb: 0 }} onIntent={vi.fn()} />)
    const app = document.querySelector('[data-service="app"]') as HTMLElement
    expect(app.querySelector('[data-usage-metric="swap"]')!.textContent).toContain('Sem swap')
    expect(app.querySelector('[data-usage-metric="disk"]')!.textContent).toContain('lendo…')
    const worker = document.querySelector('[data-service="worker"]') as HTMLElement
    expect(worker.querySelector('[data-usage-metric="cpu"]')!.textContent).toContain('parado')
    expect(worker.querySelector('[data-usage-metric="disk"] [role="progressbar"]')).toBeTruthy()
    cleanup()
    render(<EnvironmentCard env={env()} pcAvailable linkHost="h" onIntent={vi.fn()} />)
    expect(document.querySelector('[data-service="app"] [data-usage-metric="memory"]')!.textContent).toContain('não lido')
  })

  it('faixa "Uso do ambiente": a soma dos containers; some sem containers', () => {
    render(<EnvironmentCard env={env()} pcAvailable linkHost="h" capacity={HOST} onIntent={vi.fn()} />)
    const summary = screen.getByTestId('environment-usage-summary')
    expect(within(summary).getAllByRole('progressbar')).toHaveLength(4)
    expect(summary.querySelector('[data-usage-metric="memory"]')!.textContent).toContain('240 MiB de 8 GiB (servidor)')
    expect(summary.querySelector('[data-usage-metric="disk"]')!.textContent).toContain('4 GiB de 100 GiB (servidor)')
    cleanup()
    render(<EnvironmentCard env={env({ services: [], deployedOn: null })} pcAvailable linkHost="h" capacity={HOST} onIntent={vi.fn()} />)
    expect(screen.queryByTestId('environment-usage-summary')).toBeNull()
  })
})

describe('card do ambiente (portal)', () => {
  const portalEnv = (overrides: Partial<PortalEnvironmentDto> = {}): PortalEnvironmentDto => ({
    id: 'e1',
    name: 'Loja',
    slug: 'loja',
    ref: 'main',
    health: 'running',
    deployedVersion: '1.43.0',
    services: [{ service: 'app', state: 'running', status: 'Up 3 hours', version: '1.44.0', listen: [port()] }],
    portLinkHost: null,
    lastDeploy: { status: 'success', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), durationMs: 1000, version: '1.44.0' },
    deploying: false,
    ...overrides,
  })

  it('containers com as portas, sem CPU/RAM; Implantar só para admin, Levantar e Reiniciar no menu', () => {
    const onAction = vi.fn()
    render(<PortalEnvironmentCard env={portalEnv()} isAdmin pending={false} linkHost="cliente.example" onAction={onAction} />)
    expect(screen.getByRole('link', { name: 'Abrir http://cliente.example:4100' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('CPU')
    expect(screen.getByText('ref main')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Implantar/ }))
    expect(onAction).toHaveBeenCalledWith('deploy')
    openMenu()
    fireEvent.click(menuItem('Reiniciar'))
    expect(onAction).toHaveBeenCalledWith('restart')
    cleanup()
    render(<PortalEnvironmentCard env={portalEnv()} isAdmin={false} pending={false} linkHost="h" onAction={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Implantar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Mais ações/ })).toBeNull()
    expect(screen.getByText('3000/tcp')).toBeTruthy()
  })

  it('nunca implantado: Levantar e Reiniciar desligados com o motivo', () => {
    render(<PortalEnvironmentCard env={portalEnv({ health: 'never', services: [], lastDeploy: null })} isAdmin pending={false} linkHost="h" onAction={vi.fn()} />)
    expect(screen.getByText('Nunca implantado.')).toBeTruthy()
    openMenu()
    expect(menuItem('Levantar').getAttribute('aria-disabled')).toBe('true')
  })
})
