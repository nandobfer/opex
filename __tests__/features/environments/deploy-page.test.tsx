/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { EnvironmentDeploySummaryDto, EnvironmentDto, EnvironmentsListDto } from '@/features/environments/types'

/** Página do log do deploy (OPE-208: substituiu a gaveta): dados do servidor, cabeçalho e quem abre a página. */

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  action: vi.fn(),
  deployFind: vi.fn(),
  envFind: vi.fn(),
  list: { isLoading: false, isError: false, data: undefined as EnvironmentsListDto | undefined, error: null, refetch: vi.fn() },
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }))
vi.mock('@/features/environments/server/models', () => {
  const chain = (fn: (id: string) => unknown) => (id: string) => ({ select: () => ({ lean: async () => fn(id) }) })
  return {
    environmentsDb: vi.fn(async () => undefined),
    EnvironmentDeploy: { findById: chain((id) => mocks.deployFind(id)) },
    Environment: { findById: chain((id) => mocks.envFind(id)) },
  }
})
vi.mock('@/features/environments/server/service', () => ({ deploySummary: (deploy: { _id: string; status: string }) => ({ id: String(deploy._id), status: deploy.status }) }))
vi.mock('@/features/environments/components/DeployLog', () => ({ DeployLog: ({ deployId }: { deployId: string }) => <div data-testid="deploy-log">{deployId}</div> }))
vi.mock('@/features/environments/hooks/useEnvironments', () => ({
  useEnvironments: () => mocks.list,
  useEnvironmentsRealtime: () => undefined,
  useEnvironmentAction: () => ({ mutate: mocks.action, isPending: false }),
}))
// Diálogos e o cartão do Builder não entram nestes casos (cada um tem os próprios testes).
for (const name of ['AdoptDialog', 'ComposeDialog', 'DeleteEnvironmentDialog', 'DeployHistoryDialog', 'MoveDialog', 'SettingsDialog']) {
  vi.doMock(`@/features/environments/components/${name}`, () => ({ [name]: () => null }))
}
vi.mock('@/features/environments/components/builder/BuilderCard', () => ({ BuilderCard: () => null }))
vi.mock('@/features/environments/components/EnvironmentFormDialog', () => ({ EnvironmentFormDialog: () => null, NO_HOSTS: { server: null, pc: null } }))

import { loadDeployPage, REMOVED_ENVIRONMENT_NAME } from '@/features/environments/server/deploy-page'
import { DeployLogPage, deployPageDescription } from '@/features/environments/components/DeployLogPage'
import { deployPath } from '@/features/environments/constants'

const OID = '6aff3402386f0b26bb31047b'
const ENV_OID = '6aff3402386f0b26bb31047c'

const summary = (overrides: Partial<EnvironmentDeploySummaryDto> = {}): EnvironmentDeploySummaryDto => ({
  id: OID,
  kind: 'deploy',
  status: 'running',
  ref: 'main',
  commit: 'abc123def4567890',
  buildOn: 'pc',
  runOn: 'server',
  error: null,
  startedAt: '2026-11-27T15:00:00.000Z',
  finishedAt: null,
  durationMs: null,
  version: null,
  skipBuild: false,
  resumed: false,
  composeVersion: null,
  ...overrides,
})

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('dados da página (servidor)', () => {
  it('devolve o resumo do deploy e o nome do ambiente', async () => {
    mocks.deployFind.mockResolvedValue({ _id: OID, status: 'running', environmentId: ENV_OID })
    mocks.envFind.mockResolvedValue({ name: 'Loja' })
    expect(await loadDeployPage(OID)).toEqual({ deploy: { id: OID, status: 'running' }, environmentId: ENV_OID, environmentName: 'Loja' })
  })

  it('ambiente apagado: nome de reserva, sem quebrar a página', async () => {
    mocks.deployFind.mockResolvedValue({ _id: OID, status: 'failed', environmentId: ENV_OID })
    mocks.envFind.mockResolvedValue(null)
    expect((await loadDeployPage(OID))!.environmentName).toBe(REMOVED_ENVIRONMENT_NAME)
  })

  it('id inválido ou deploy inexistente: null (a rota responde 404)', async () => {
    expect(await loadDeployPage('nao-e-id')).toBeNull()
    expect(mocks.deployFind).not.toHaveBeenCalled()
    mocks.deployFind.mockResolvedValue(null)
    expect(await loadDeployPage(OID)).toBeNull()
  })
})

describe('página do log', () => {
  it('cabeçalho com o voltar para Ambientes, o título e onde/ref/início; o log do deploy abaixo', () => {
    render(<DeployLogPage deploy={summary()} environmentName="Loja" />)
    expect(screen.getByRole('heading', { name: 'Deploy de Loja' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voltar para os ambientes' }).getAttribute('href')).toBe('/ambientes')
    expect(screen.getByText(/Build no pc → execução no servidor · main @ abc123de · iniciado em 27\/11\/2026/)).toBeTruthy()
    expect(screen.getByTestId('deploy-log').textContent).toBe(OID)
  })

  it('mudança de máquina e deploy sem ref: título e descrição se ajustam', () => {
    render(<DeployLogPage deploy={summary({ kind: 'move', ref: null, commit: null })} environmentName="Loja" />)
    expect(screen.getByRole('heading', { name: 'Mudança de máquina de Loja' })).toBeTruthy()
    expect(deployPageDescription(summary({ ref: null, commit: null }))).not.toContain('@')
  })

  it('o caminho da página codifica o id', () => {
    expect(deployPath('d1')).toBe('/ambientes/deploys/d1')
    expect(deployPath('a/b')).toBe('/ambientes/deploys/a%2Fb')
  })
})

describe('Ambientes abre a página do log', () => {
  const env = (overrides: Partial<EnvironmentDto> = {}): EnvironmentDto => ({
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
    deployedOn: { buildOn: 'server', runOn: 'server' },
    deployedVersion: null,
    lastDeploy: null,
    services: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  })

  it('deploy iniciado na linha: navega para /ambientes/deploys/<id> (antes abria a gaveta)', async () => {
    mocks.list.data = { items: [env()], unmanaged: [], pcAvailable: true, pcReason: null, hosts: { server: null, pc: null }, checkedAt: new Date().toISOString() }
    mocks.action.mockImplementation((_input: unknown, options: { onSuccess: (result: { deployId: string | null; output: string | null }) => void }) => options.onSuccess({ deployId: 'd9', output: null }))
    const { EnvironmentsPage } = await import('@/features/environments/components/EnvironmentsPage')
    render(<EnvironmentsPage />)
    fireEvent.click(screen.getByRole('button', { name: /Redeploy/ }))
    const buttons = await screen.findAllByRole('button', { name: /Redeploy/ })
    fireEvent.click(buttons[buttons.length - 1]!)
    expect(mocks.action).toHaveBeenCalledWith({ action: 'deploy', ref: '' }, expect.anything())
    expect(mocks.push).toHaveBeenCalledWith('/ambientes/deploys/d9')
  })
})
