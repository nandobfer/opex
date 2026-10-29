/** @vitest-environment happy-dom */

import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CentralDto } from '@/features/agentic/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post, put: mocks.put, delete: mocks.delete } }))
vi.mock('@/features/agentic/components/settings/CreateCentralDialog', () => ({
  CreateCentralDialog: ({ existing }: { existing: CentralDto[] }) => <div data-testid="create-dialog">{existing.map((central) => central.id).join(',')}</div>,
}))

import { CentralsCard } from '@/features/agentic/components/settings/CentralsCard'

const directory = (id: string) => ({ enabled: true, sessionDirectory: `/home/burgos/code/${id}` }) as CentralDto['config']

const central = (id: string, patch: Partial<CentralDto> = {}): CentralDto =>
  ({
    id,
    projectId: `p-${id}`,
    projectName: `Projeto ${id}`,
    sigla: id.toUpperCase(),
    repo: `org/${id}`,
    repoUrl: null,
    lastTest: null,
    activeWorkbenches: 0,
    runningWorkbenches: 0,
    createdAt: '',
    updatedAt: '',
    config: directory(id),
    ...patch,
  }) as unknown as CentralDto

const CENTRALS = [
  central('opex', { projectName: 'Opex', repo: 'nandobfer/opex' }),
  central('automacao', { projectName: 'Automação', repo: 'sipal/automacao' }),
  central('portal', { projectName: 'Portal do cliente', repo: 'sipal/portal' }),
]

const ok = (data: unknown) => ({ data: { success: true, data } })

function renderCard() {
  mocks.get.mockImplementation(async (url: string) => (url === '/agentic/centrals' ? ok(CENTRALS) : ok(null)))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={client}>
      <CentralsCard />
    </QueryClientProvider>,
  )
  return { client, ...result }
}

const search = () => screen.getByLabelText('Buscar centrais') as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/integracoes/ia?aba=desenvolvimento-agentico')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CentralsCard: busca das centrais de desenvolvimento', () => {
  it('lista as centrais e mostra o campo de busca', async () => {
    renderCard()
    expect(await screen.findByText('Opex')).toBeTruthy()
    expect(screen.getByText('Automação')).toBeTruthy()
    expect(screen.getByText('Portal do cliente')).toBeTruthy()
    expect(search().value).toBe('')
  })

  it('filtra a lista pelo texto digitado e limpa com o botão', async () => {
    renderCard()
    await screen.findByText('Opex')

    fireEvent.change(search(), { target: { value: 'portal' } })
    expect(screen.getByText('Portal do cliente')).toBeTruthy()
    expect(screen.queryByText('Opex')).toBeNull()
    expect(screen.queryByText('Automação')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }))
    expect(search().value).toBe('')
    expect(screen.getByText('Opex')).toBeTruthy()
    expect(screen.getByText('Automação')).toBeTruthy()
  })

  it('grava a busca na URL preservando a aba e a remove ao limpar', async () => {
    renderCard()
    await screen.findByText('Opex')

    fireEvent.change(search(), { target: { value: 'portal' } })
    await waitFor(() => expect(window.location.search).toContain('buscaCentrais=portal'), { timeout: 3000 })
    expect(window.location.search).toContain('aba=desenvolvimento-agentico')

    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }))
    await waitFor(() => expect(window.location.search).not.toContain('buscaCentrais'), { timeout: 3000 })
    expect(window.location.search).toContain('aba=desenvolvimento-agentico')
  })

  it('restaura a busca que já está na URL', async () => {
    window.history.replaceState({}, '', '/integracoes/ia?aba=desenvolvimento-agentico&buscaCentrais=automacao')
    renderCard()
    expect(await screen.findByText('Automação')).toBeTruthy()
    expect(search().value).toBe('automacao')
    expect(screen.queryByText('Opex')).toBeNull()
  })

  it('sem resultados mostra o vazio próprio da busca, com Limpar busca', async () => {
    renderCard()
    await screen.findByText('Opex')

    fireEvent.change(search(), { target: { value: 'zzz' } })
    expect(screen.getByText('Nenhuma central encontrada')).toBeTruthy()
    expect(screen.queryByText('Nenhuma central ainda')).toBeNull()

    // Dois botões com esse nome: o X do campo e a ação do vazio da busca.
    const [, emptyAction] = screen.getAllByRole('button', { name: 'Limpar busca' })
    fireEvent.click(emptyAction!)
    expect(screen.getByText('Opex')).toBeTruthy()
    expect(search().value).toBe('')
  })

  it('sem centrais mostra o vazio de criação, sem o campo de busca', async () => {
    mocks.get.mockImplementation(async () => ok([]))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CentralsCard />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Nenhuma central ainda')).toBeTruthy()
    expect(screen.queryByLabelText('Buscar centrais')).toBeNull()
  })

  it('entrega todas as centrais ao diálogo de nova central, mesmo com busca ativa', async () => {
    renderCard()
    await screen.findByText('Opex')

    fireEvent.change(search(), { target: { value: 'portal' } })
    expect(screen.getByTestId('create-dialog').textContent).toBe('opex,automacao,portal')
  })

  it('novos dados continuam passando pelo filtro ativo', async () => {
    const { client } = renderCard()
    await screen.findByText('Opex')
    fireEvent.change(search(), { target: { value: 'portal' } })

    await act(async () => {
      client.setQueryData(['agentic', 'centrals'], [...CENTRALS, central('novo', { projectName: 'Portal novo' })])
    })

    await waitFor(() => expect(screen.getByText('Portal novo')).toBeTruthy())
    expect(screen.getByText('Portal do cliente')).toBeTruthy()
    expect(screen.queryByText('Opex')).toBeNull()
  })

  it('erro na carga mostra o estado com tentar novamente', async () => {
    mocks.get.mockImplementation(async () => {
      throw new Error('falhou')
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CentralsCard />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Não foi possível carregar as centrais')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy()
  })
})
