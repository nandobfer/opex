/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Card "Nomes dos canais" da aba Migração (OPE-206): estados, confirmação antes de migrar ou desfazer, retomada
 * e o relatório (conflitos, assinaturas de outros apps e conferência que não bateu).
 */

const mocks = vi.hoisted(() => ({
  state: null as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  mutate: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/engramind/hooks/useChannelMigration', () => ({
  useChannelMigration: () => ({ data: mocks.state, isLoading: mocks.isLoading, isError: mocks.isError, refetch: mocks.refetch }),
  useStartChannelMigration: () => ({ mutate: mocks.mutate, isPending: false }),
}))

import { ChannelNamingCard } from '@/features/engramind/components/integration/migration/ChannelNamingCard'
import type { ChannelMigrationDto, ChannelMigrationStateDto } from '@/features/engramind/channel-migration/types'

const SCRIPT = '/home/burgos/linux-scripts/export-engramind-memories.mjs'
const migration = (overrides: Partial<ChannelMigrationDto> = {}): ChannelMigrationDto => ({
  id: 'mig1',
  direction: 'forward',
  status: 'done',
  step: 'done',
  app: 'opex',
  startedAt: '2026-11-27T12:00:00.000Z',
  finishedAt: '2026-11-27T12:10:00.000Z',
  error: null,
  backup: { file: '/tmp/opex/engramind-migracao/mig1/antes/x.json', memories: 3, byStatus: { active: 3 } },
  verify: { file: '/tmp/opex/engramind-migracao/mig1/depois/x.json', memories: 3, byStatus: { active: 3 }, ok: true, problems: [] },
  channels: [{ from: 'agentes/opex/dono', to: 'opex/agentes/opex/dono', wasArchived: false, moved: true }],
  tooLong: [],
  movedCount: 3,
  conflicts: [],
  subscriptions: [{ agent: 'dndicas/bot', fromTarget: 'agentes/opex/*', toTarget: 'opex/agentes/opex/*', mode: 'inject', foreign: true, created: true, removed: true }],
  archived: ['agentes/opex/dono'],
  mongo: null,
  log: [],
  ...overrides,
})
const state = (overrides: Partial<ChannelMigrationStateDto> = {}): ChannelMigrationStateDto => ({
  namespace: { app: 'opex', prefixed: false },
  scriptPath: SCRIPT,
  current: null,
  canRevert: false,
  canMigrate: true,
  ...overrides,
})

beforeEach(() => {
  mocks.state = state()
  mocks.isLoading = false
  mocks.isError = false
  mocks.mutate.mockReset()
  mocks.refetch.mockReset()
})
afterEach(() => cleanup())

describe('card Nomes dos canais', () => {
  it('carregando mostra o skeleton; erro mostra Tentar novamente', () => {
    mocks.isLoading = true
    render(<ChannelNamingCard />)
    expect(screen.getByTestId('channel-naming-skeleton')).toBeTruthy()
    cleanup()
    mocks.isLoading = false
    mocks.isError = true
    mocks.state = undefined
    render(<ChannelNamingCard />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.refetch).toHaveBeenCalled()
  })

  it('nomes antigos: migrar pede confirmação com os passos e só então inicia, com o script', () => {
    render(<ChannelNamingCard />)
    expect(screen.getByText(/ainda usam os nomes antigos/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Migrar canais para o nome do app/ }))
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/Nada é excluído/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Migrar canais' }))
    expect(mocks.mutate.mock.calls[0]?.[0]).toEqual({ direction: 'forward', scriptPath: SCRIPT })
  })

  it('sem o script do host, o botão fica desabilitado', () => {
    mocks.state = state({ scriptPath: null })
    render(<ChannelNamingCard />)
    expect(screen.getByRole('button', { name: /Migrar canais para o nome do app/ }).hasAttribute('disabled')).toBe(true)
  })

  it('concluída: relatório com assinaturas de outros apps e a volta atrás com confirmação', () => {
    mocks.state = state({ namespace: { app: 'opex', prefixed: true }, canMigrate: false, canRevert: true, current: migration() })
    render(<ChannelNamingCard />)
    expect(screen.getByText(/usam o nome do app \(opex\/agentes/)).toBeTruthy()
    expect(screen.getByTestId('channel-migration-report').textContent).toContain('1 de outros apps')
    fireEvent.click(screen.getByRole('button', { name: /Desfazer migração/ }))
    expect(mocks.mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Desfazer migração' }).at(-1)!)
    expect(mocks.mutate.mock.calls[0]?.[0]).toMatchObject({ direction: 'revert' })
  })

  it('conferência que não bateu: avisa, lista os problemas e oferece continuar de onde parou', () => {
    mocks.state = state({ current: migration({ status: 'verify_failed', finishedAt: null, archived: [], verify: { file: 'f', memories: 2, byStatus: { active: 2 }, ok: false, problems: ['Memória m_1 sumiu'] }, conflicts: [{ id: 'm_2', channel: 'agentes/opex/dono', code: 'MEMORY_DUPLICATE', existingId: 'm_9' }] }) })
    render(<ChannelNamingCard />)
    expect(screen.getByText(/nada foi arquivado/)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Memória m_1 sumiu')
    expect(screen.getByTestId('channel-migration-conflicts').textContent).toContain('igual a m_9')
    fireEvent.click(screen.getByRole('button', { name: /Continuar de onde parou/ }))
    expect(mocks.mutate.mock.calls[0]?.[0]).toMatchObject({ direction: 'forward' })
  })
})
