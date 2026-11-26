/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { EnvironmentsBuilder } from '@/features/environments/schemas'
import type { EnvironmentsBuilderDto, EnvironmentsListDto } from '@/features/environments/types'

/** Linha "Builder do servidor": acima dos grupos, estados, ações, confirmação e a resposta otimista. */

const mocks = vi.hoisted(() => ({
  builder: { isLoading: false, isError: false, data: undefined as unknown, error: null, refetch: vi.fn() },
  action: vi.fn(),
  save: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post, put: vi.fn() } }))

const config = (overrides: Partial<EnvironmentsBuilder> = {}): EnvironmentsBuilder => ({ name: 'limited-builder', memoryGb: 24, cpus: 6, swapGb: 16, useAsDefault: true, allowNetworkHost: true, ...overrides })
const dto = (overrides: Partial<EnvironmentsBuilderDto> = {}): EnvironmentsBuilderDto => ({
  config: config(),
  name: 'limited-builder',
  managed: true,
  status: 'running',
  driver: 'docker-container',
  container: 'buildx_buildkit_limited-builder0',
  containerMissing: false,
  isHostDefault: true,
  applied: { memoryGb: 24, swapGb: 16, cpus: 6 },
  limitsDiffer: false,
  flags: [],
  unknownFlags: [],
  usage: { cpuPercent: 12.5, memoryUsage: '2.5GiB / 24GiB', memoryPercent: 10 },
  host: { cpus: 8, memoryGb: 31.3 },
  suggested: config(),
  pending: null,
  lastAction: null,
  buildRunning: false,
  error: null,
  checkedAt: new Date().toISOString(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.builder = { isLoading: false, isError: false, data: dto(), error: null, refetch: vi.fn() }
})
afterEach(cleanup)

describe('linha do builder (hooks simulados)', () => {
  beforeEach(() => {
    vi.doMock('@/features/environments/hooks/useEnvironmentsBuilder', () => ({
      useEnvironmentsBuilder: () => mocks.builder,
      useEnvironmentsBuilderAction: () => ({ mutate: mocks.action, isPending: false }),
      useSaveEnvironmentsBuilder: () => ({ mutate: mocks.save, isPending: false }),
    }))
  })
  afterEach(() => vi.doUnmock('@/features/environments/hooks/useEnvironmentsBuilder'))

  const renderCard = async () => {
    const { BuilderCard } = await import('@/features/environments/components/builder/BuilderCard')
    return render(<BuilderCard />)
  }

  it('no ar: nome, selos, limites aplicados, uso de CPU/RAM e derrubar sem build direto', async () => {
    await renderCard()
    expect(screen.getByText('limited-builder')).toBeTruthy()
    expect(screen.getByText('No ar')).toBeTruthy()
    expect(screen.getByText('Padrão do host')).toBeTruthy()
    expect(screen.getByText(/RAM 24 GiB · swap \+16 GiB · 6 CPUs · CPU 12\.5% · RAM 2\.5GiB/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Derrubar' }))
    expect(mocks.action).toHaveBeenCalledWith({ action: 'stop' })
  })

  it('não gerenciado: só Gerenciar, que abre o formulário com o que o host tem', async () => {
    mocks.builder.data = dto({ config: null, managed: false })
    await renderCard()
    expect(screen.getByText('Não gerenciado')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Apagar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Gerenciar/ }))
    expect((screen.getByLabelText('Nome do builder') as HTMLInputElement).value).toBe('limited-builder')
    expect((screen.getByLabelText('RAM máxima (GiB)') as HTMLInputElement).value).toBe('24')
  })

  it('não existe: oferece Criar e bloqueia levantar/derrubar/apagar', async () => {
    mocks.builder.data = dto({ status: 'missing', applied: null, usage: null, container: null })
    await renderCard()
    expect(screen.getByText('Não existe')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))
    expect(mocks.action).toHaveBeenCalledWith({ action: 'create' })
    expect((screen.getByRole('button', { name: 'Apagar' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Levantar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('apagar pede confirmação; com build em andamento, o aviso diz que ele falha e vai com force', async () => {
    mocks.builder.data = dto({ buildRunning: true })
    await renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(mocks.action).not.toHaveBeenCalled()
    expect(screen.getByText(/todo o cache de build/)).toBeTruthy()
    expect(screen.getByText(/Há um build em andamento: ele falha/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(mocks.action).toHaveBeenCalledWith({ action: 'delete', confirm: true, force: true })
  })

  it('falha da última ação, recriação pendente e limites divergentes aparecem na linha', async () => {
    mocks.builder.data = dto({ limitsDiffer: true, pending: { requestedAt: '', reason: '' }, lastAction: { action: 'recreate', ok: false, message: 'Não foi possível recriar o builder limited-builder: boom', at: '' } })
    await renderCard()
    expect(screen.getByText('Recriação pendente')).toBeTruthy()
    expect(screen.getByText(/boom/)).toBeTruthy()
    expect(screen.getByText(/diferem dos aplicados/)).toBeTruthy()
  })

  it('carregando: skeleton com a estrutura da linha; erro com tentar novamente', async () => {
    mocks.builder = { ...mocks.builder, isLoading: true, data: undefined }
    const view = await renderCard()
    expect(screen.getByTestId('builder-skeleton')).toBeTruthy()
    view.unmount()
    mocks.builder = { ...mocks.builder, isLoading: false, isError: true, data: undefined }
    await renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.builder.refetch).toHaveBeenCalled()
  })
})

describe('resposta otimista (hook real)', () => {
  it('levantar mostra "No ar" na hora e volta ao estado anterior com toast na falha', async () => {
    const { builderKey, useEnvironmentsBuilderAction } = await import('@/features/environments/hooks/useEnvironmentsBuilder')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(builderKey, dto({ status: 'stopped', usage: null }))
    let reject!: (error: unknown) => void
    mocks.post.mockReturnValue(new Promise((_resolve, fail) => (reject = fail)))
    const { renderHook, act, waitFor } = await import('@testing-library/react')
    const { result } = renderHook(() => useEnvironmentsBuilderAction(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
    act(() => result.current.mutate({ action: 'start' }))
    await waitFor(() => expect(client.getQueryData<EnvironmentsBuilderDto>(builderKey)?.status).toBe('running'))
    await act(async () => reject(new Error('boom')))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled())
    expect(client.getQueryData<EnvironmentsBuilderDto>(builderKey)?.status).toBe('stopped')
  })
})

describe('página', () => {
  it('a linha do builder vem antes dos grupos Servidor/PC', async () => {
    const list: EnvironmentsListDto = { items: [], unmanaged: [], pcAvailable: true, pcReason: null, checkedAt: '' }
    const stub = () => ({ data: undefined, isLoading: false, isError: false, mutate: vi.fn(), isPending: false, refetch: vi.fn() })
    vi.doMock('@/features/environments/hooks/useEnvironmentsBuilder', () => ({
      useEnvironmentsBuilder: () => mocks.builder,
      useEnvironmentsBuilderAction: () => ({ mutate: mocks.action, isPending: false }),
      useSaveEnvironmentsBuilder: () => ({ mutate: mocks.save, isPending: false }),
    }))
    vi.doMock('@/features/environments/hooks/useEnvironments', () => ({
      useEnvironments: () => ({ ...stub(), data: { ...list, items: [{ id: 'e1', name: 'Loja', slug: 'loja', source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' }, envKeys: [], ports: [], healthUrl: null, buildOn: 'server', runOn: 'server', deployedOn: null, deployedVersion: null, lastDeploy: null, services: [], createdAt: '', updatedAt: '' }] } }),
      useEnvironmentsRealtime: () => undefined,
      useEnvironmentAction: stub,
      useDeleteEnvironment: stub,
      useEnvironmentDeploys: stub,
      useSaveEnvironment: stub,
      useAdoptProject: stub,
      useEnvironmentsSettings: stub,
      useSaveEnvironmentsSettings: stub,
      useRegistryStatus: stub,
      useEnvironmentEnvValues: stub,
    }))
    vi.doMock('@/features/agentic/hooks/useAgentic', () => ({ useCentrals: () => ({ data: [], isLoading: false }) }))
    vi.doMock('@/features/environments/hooks/useEnvironmentCompose', () => ({ useEnvironmentCompose: stub, useComposeRevision: stub, useSaveCompose: stub, useRestoreCompose: stub }))
    const { EnvironmentsPage } = await import('@/features/environments/components/EnvironmentsPage')
    render(<EnvironmentsPage />)
    const builder = screen.getByText('Builder do servidor')
    const server = screen.getByText('Servidor', { selector: 'h2' })
    expect(builder.compareDocumentPosition(server) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    vi.doUnmock('@/features/environments/hooks/useEnvironments')
    vi.doUnmock('@/features/agentic/hooks/useAgentic')
    vi.doUnmock('@/features/environments/hooks/useEnvironmentCompose')
    vi.doUnmock('@/features/environments/hooks/useEnvironmentsBuilder')
  })
})
