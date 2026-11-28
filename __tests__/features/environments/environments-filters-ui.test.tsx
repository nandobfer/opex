/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { EnvironmentDto, EnvironmentsListDto } from '@/features/environments/types'

/** Lista `/ambientes` (OPE-211): filtros (busca, porta, origem) sobre os gerenciados e os não gerenciados. */

const mocks = vi.hoisted(() => ({ list: { isLoading: false, isError: false, data: undefined as EnvironmentsListDto | undefined, error: null, refetch: vi.fn() } }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/features/environments/hooks/useEnvironments', () => ({
  useEnvironments: () => mocks.list,
  useEnvironmentsRealtime: () => undefined,
  useEnvironmentAction: () => ({ mutate: vi.fn(), isPending: false }),
}))
for (const name of ['AdoptDialog', 'ComposeDialog', 'DeleteEnvironmentDialog', 'DeployHistoryDialog', 'MoveDialog', 'SettingsDialog']) {
  vi.doMock(`@/features/environments/components/${name}`, () => ({ [name]: () => null }))
}
vi.mock('@/features/environments/components/builder/BuilderCard', () => ({ BuilderCard: () => null }))

const env = (overrides: Partial<EnvironmentDto>): EnvironmentDto =>
  ({
    id: 'e1',
    name: 'Loja',
    slug: 'loja',
    source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' },
    envKeys: [],
    ports: [],
    healthUrl: null,
    buildOn: 'server',
    runOn: 'server',
    limits: { mode: 'shared', memoryGb: null, cpus: null, swapGb: null },
    limitsConfigured: false,
    deployedLimits: null,
    composeOverrides: null,
    deployedComposeOverrides: null,
    deployedOn: { buildOn: 'server', runOn: 'server' },
    deployedVersion: null,
    deployedComposeVersion: null,
    lastDeploy: null,
    services: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }) as EnvironmentDto

const svc = (service: string, container: number, published: number | null) => ({ service, container: `${service}-1`, state: 'running', status: 'Up', ports: '', listen: [{ container, protocol: 'tcp' as const, published, hostIp: null, reach: 'link' as const }], cpu: null, memory: null, version: null, limits: null, usage: { cpuPercent: null, memoryBytes: null, swapBytes: null, diskBytes: null, volumes: [], diskCheckedAt: null } })

beforeEach(() => {
  window.history.replaceState(null, '', '/ambientes')
  mocks.list.data = {
    items: [env({ services: [svc('app', 3000, 4100)] }), env({ id: 'e2', name: 'Blog', slug: 'blog', source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'blog' }, runOn: 'pc', deployedOn: { buildOn: 'pc', runOn: 'pc' }, services: [svc('web', 80, 8080)] })],
    unmanaged: [{ machine: 'server', projectName: 'grafana', workingDir: '/opt/grafana', configFiles: [], git: false, containers: 1, running: 1, services: ['grafana'], ports: [3100] }],
    pcAvailable: true,
    pcReason: null,
    hosts: { server: null, pc: null },
    portLinkHost: null,
    checkedAt: new Date().toISOString(),
  }
})
afterEach(cleanup)

async function renderPage() {
  const { EnvironmentsPage } = await import('@/features/environments/components/EnvironmentsPage')
  render(<EnvironmentsPage />)
}

const search = async (text: string) => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  fireEvent.change(screen.getByRole('textbox', { name: 'Busca' }), { target: { value: text } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
  vi.useRealTimers()
}

describe('filtros da lista de ambientes', () => {
  it('mostram busca, Máquina, Situação e Origem e o total com os não gerenciados', async () => {
    await renderPage()
    expect(screen.getByRole('textbox', { name: 'Busca' })).toBeTruthy()
    for (const label of ['Máquina', 'Situação', 'Origem']) expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    expect(screen.getByText('3 REGISTROS')).toBeTruthy()
  }, 15000) // o primeiro render carrega a página sob demanda; no runner de CI passa de 5 s

  it('buscar uma porta deixa só o card dela; a contagem do grupo é a filtrada', async () => {
    await renderPage()
    await search('4100')
    expect(screen.getByRole('link', { name: 'Loja' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Blog' })).toBeNull()
    expect(screen.queryByText('Não gerenciados')).toBeNull()
    expect(screen.queryByRole('region', { name: 'PC' })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Servidor' })).getByText('1')).toBeTruthy()
  })

  it('a busca também acha os não gerenciados (serviço e porta)', async () => {
    await renderPage()
    await search('3100')
    expect(screen.getByText('Não gerenciados')).toBeTruthy()
    expect(screen.getByText('grafana')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Loja' })).toBeNull()
  })

  it('Origem "Não gerenciado" pela URL mostra só os não gerenciados', async () => {
    window.history.replaceState(null, '', '/ambientes?origins=unmanaged')
    await renderPage()
    expect(screen.getByText('Não gerenciados')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Loja' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Blog' })).toBeNull()
  })

  it('nada encontrado: vazio com "Limpar filtros", que volta a lista inteira', async () => {
    await renderPage()
    await search('nada-com-isso')
    expect(screen.getByText('Nenhum ambiente com estes filtros')).toBeTruthy()
    expect(screen.queryByText('Nenhum ambiente ainda')).toBeNull()
    // A ação do vazio (o X do cartão de filtros tem o mesmo nome).
    const empty = screen.getByText('Nenhum ambiente com estes filtros').closest('div')!.parentElement!
    fireEvent.click(within(empty).getByRole('button', { name: 'Limpar filtros' }))
    expect(await screen.findByRole('link', { name: 'Blog' })).toBeTruthy()
  })
})
