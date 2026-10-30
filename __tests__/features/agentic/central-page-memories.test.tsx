/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const CENTRAL = 'c0000000000000000000000a'
const mocks = vi.hoisted(() => ({ central: null as unknown }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  useAgenticRealtime: vi.fn(),
  useCentral: () => ({ data: mocks.central, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useUpdateCentral: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/agentic/components/central/GeneralSection', () => ({ GeneralSection: () => <div data-testid="geral" /> }))
vi.mock('@/features/agentic/components/central/AgentsSection', () => ({ AgentsSection: () => <div data-testid="agentes" /> }))
vi.mock('@/features/agentic/components/central/GitSection', () => ({ GitSection: () => <div data-testid="git" /> }))
vi.mock('@/features/agentic/components/central/EnvironmentSection', () => ({ EnvironmentSection: () => <div data-testid="ambiente" /> }))
vi.mock('@/features/agentic/components/central/ColumnsSection', () => ({ ColumnsSection: () => <div data-testid="colunas" /> }))
vi.mock('@/features/agentic/components/central/InstructionsSection', () => ({ InstructionsSection: () => <div data-testid="instrucoes" /> }))
vi.mock('@/features/agentic/components/central/CentralLogsSection', () => ({ CentralLogsSection: () => <div data-testid="logs" /> }))
vi.mock('@/features/agentic/components/central/CentralWorkbenchesSection', () => ({ CentralWorkbenchesSection: () => <div data-testid="mesas" /> }))
vi.mock('@/features/agentic/components/central/CentralHeaderActions', () => ({ CentralHeaderActions: () => <div data-testid="acoes" /> }))
vi.mock('@/features/agentic/components/DeveloperMemoriesSection', () => ({ DeveloperMemoriesSection: ({ centralId }: { centralId?: string }) => <div data-testid="developer-memories">{centralId}</div> }))

import { CentralPage } from '@/features/agentic/components/central/CentralPage'
import { defaultCentralConfig } from '@/features/agentic/schemas'

beforeEach(() => {
  window.history.replaceState({}, '', `/integracoes/ia/centrais/${CENTRAL}`)
  mocks.central = { id: CENTRAL, projectName: 'opex', config: defaultCentralConfig('/home/opex'), updatedAt: '2026-10-30T00:00:00.000Z' }
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('página da central: aba Memórias (OPE-97)', () => {
  it('mostra as memórias desta central, sem os botões do formulário', () => {
    render(<CentralPage id={CENTRAL} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Memórias' }))
    expect(screen.getByRole('tab', { name: 'Memórias' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('developer-memories').textContent).toBe(CENTRAL)
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull()
  })

  it('a aba fica entre Instruções e Logs', () => {
    render(<CentralPage id={CENTRAL} />)
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())
    expect(tabs.slice(tabs.indexOf('Instruções'), tabs.indexOf('Instruções') + 3)).toEqual(['Instruções', 'Memórias', 'Logs'])
  })
})
