/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PortalEnvironmentDto } from '@/features/environments/types'

/** Portal › Ambientes: todos veem o estado; só o admin implanta (com confirmação), levanta e reinicia. */

const mocks = vi.hoisted(() => ({
  isAdmin: true,
  query: {} as { data?: PortalEnvironmentDto[]; isLoading: boolean; isFetching: boolean; error: unknown; refetch: () => void },
  mutate: vi.fn(),
}))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/orcamentos/portal/ClientePortalContext', () => ({ useClientePortal: () => ({ isAdmin: mocks.isAdmin, clientId: 'c1' }) }))
vi.mock('@/features/environments/portal/hooks', () => ({
  usePortalEnvironments: () => mocks.query,
  usePortalEnvironmentAction: () => ({ mutate: mocks.mutate, isPending: false, variables: undefined }),
  usePortalEnvironmentsRealtime: vi.fn(),
}))

import { ClienteAmbientesPage } from '@/features/environments/portal/ClienteAmbientesPage'

const env = (overrides: Partial<PortalEnvironmentDto> = {}): PortalEnvironmentDto => ({
  id: 'e1',
  name: 'Loja',
  slug: 'loja',
  ref: 'main',
  health: 'running',
  deployedVersion: '1.2.0',
  services: [{ service: 'app', state: 'running', status: 'Up', version: '1.2.0' }],
  lastDeploy: { status: 'success', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), durationMs: 1000, version: '1.2.0' },
  deploying: false,
  ...overrides,
})

beforeEach(() => {
  mocks.isAdmin = true
  mocks.query = { data: [env()], isLoading: false, isFetching: false, error: null, refetch: vi.fn() }
  mocks.mutate.mockClear()
})
afterEach(cleanup)

describe('portal › ambientes', () => {
  it('mostra estado, versão e serviços; o admin implanta só depois de confirmar', () => {
    render(<ClienteAmbientesPage />)
    expect(screen.getByText('Loja')).toBeTruthy()
    expect(screen.getByText('No ar')).toBeTruthy()
    expect(screen.getByText('v1.2.0')).toBeTruthy()
    expect(screen.getByText(/1\/1 serviço\(s\) no ar/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Implantar' }))
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(screen.getByText('Implantar Loja?')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Implantar' }).at(-1)!)
    expect(mocks.mutate).toHaveBeenCalledWith({ id: 'e1', action: 'deploy' })
  })

  it('levantar não pede confirmação; nunca implantado bloqueia levantar e reiniciar', () => {
    render(<ClienteAmbientesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Levantar' }))
    expect(mocks.mutate).toHaveBeenCalledWith({ id: 'e1', action: 'up' })
    cleanup()
    mocks.query = { ...mocks.query, data: [env({ health: 'never', services: [], deployedVersion: null, lastDeploy: null })] }
    render(<ClienteAmbientesPage />)
    expect(screen.getByText('Nunca implantado')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Levantar' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Reiniciar' }).hasAttribute('disabled')).toBe(true)
  })

  it('deploy em andamento bloqueia as ações e mostra "Implantando"', () => {
    mocks.query = { ...mocks.query, data: [env({ deploying: true })] }
    render(<ClienteAmbientesPage />)
    expect(screen.getByText('Implantando')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Implantar' }).hasAttribute('disabled')).toBe(true)
  })

  it('usuário comum vê o estado sem as ações', () => {
    mocks.isAdmin = false
    render(<ClienteAmbientesPage />)
    expect(screen.getByText('Loja')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Implantar' })).toBeNull()
    expect(screen.getByText(/somente leitura/)).toBeTruthy()
  })

  it('vazio e erro com tentar novamente', () => {
    mocks.query = { ...mocks.query, data: [] }
    render(<ClienteAmbientesPage />)
    expect(screen.getByText('Nenhum ambiente')).toBeTruthy()
    cleanup()
    mocks.query = { ...mocks.query, data: undefined, error: new Error('falhou') }
    render(<ClienteAmbientesPage />)
    expect(screen.getByText('Não foi possível carregar os ambientes')).toBeTruthy()
  })
})
