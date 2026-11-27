/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import { DEFAULT_SECRETARY_SETTINGS } from '@/features/secretary-agent/schemas'

const mocks = vi.hoisted(() => ({
  inbox: vi.fn(),
  realtime: vi.fn(),
  evolution: vi.fn(),
  refetch: vi.fn(),
}))
vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/features/agent-metrics/hooks/useAgentMetrics', () => ({
  useAgentMetrics: () => ({ data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() }),
  useAgentMetricsRealtime: vi.fn(),
}))
vi.mock('@/features/agent-metrics/components/AgentOverviewTab', () => ({ AgentOverviewTab: () => <div>visão geral do secretário</div> }))
vi.mock('@/features/agent-metrics/components/AgentHistoryTab', () => ({ AgentHistoryTab: () => <div>histórico do secretário</div> }))
vi.mock('@/features/agent-metrics/components/AgentFiltersBar', () => ({ AgentFiltersBar: () => null }))
vi.mock('@/features/secretary-agent/components/SecretaryMemories', () => ({ SecretaryMemories: () => <div>memórias do secretário</div> }))
vi.mock('@/features/secretary-agent/components/conversations/ConversationsInbox', () => ({
  ConversationsInbox: (props: { minutes: number; contacts: unknown[] }) => {
    mocks.inbox(props)
    return <div data-testid="secretary-inbox">inbox</div>
  },
}))
vi.mock('@/features/secretary-agent/hooks/useSecretaryRealtime', async (original) => ({ ...(await original<object>()), useSecretaryRealtime: mocks.realtime }))
vi.mock('@/features/evolution-api/hooks/useEvolution', () => ({ useEvolution: mocks.evolution }))

import { SecretaryMetricsPage } from '@/features/secretary-agent/components/SecretaryMetricsPage'
import { SECRETARY_CHAT_CONTACTS_PATH, SECRETARY_SETTINGS_ENDPOINT } from '@/features/secretary-agent/hooks/useSecretaryRealtime'
import { SECRETARY_PAGE_PATH, SECRETARY_PAGE_TABS } from '@/features/secretary-agent/links'
import { OVERVIEW_TAB } from '@/features/agent-metrics/components/AgentPage'

const contacts = [{ jid: '5531999999999@s.whatsapp.net', name: 'Ana' }]
const query = (data: unknown, state: Partial<{ isPending: boolean; isError: boolean }> = {}) => ({ data, isPending: false, isError: false, refetch: mocks.refetch, ...state })

function evolutionReturns(config: ReturnType<typeof query>) {
  mocks.evolution.mockImplementation((path: string) => (path === SECRETARY_SETTINGS_ENDPOINT ? config : path === SECRETARY_CHAT_CONTACTS_PATH ? query(contacts) : query(undefined)))
}

const tabNames = () => within(screen.getByRole('radiogroup', { name: 'Abas do Agente Secretário' })).getAllByRole('radio').map((tab) => tab.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', SECRETARY_PAGE_PATH)
  evolutionReturns(query({ settings: { ...DEFAULT_SECRETARY_SETTINGS, pauseMinutes: 45 } }))
})
afterEach(cleanup)

describe('/agente-secretario com a aba Conversas (OPE-207)', () => {
  it('abre em Conversas, à esquerda da Visão geral, com o mesmo inbox de Integrações', () => {
    render(<SecretaryMetricsPage />)
    expect(tabNames()).toEqual(['Conversas', 'Visão geral', 'Histórico', 'Memórias'])
    expect(screen.getByRole('radio', { name: 'Conversas' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('secretary-inbox')).toBeTruthy()
    expect(mocks.realtime).toHaveBeenCalled()
    // A pausa vem da configuração salva e os contatos da mesma consulta de Integrações.
    expect(mocks.inbox).toHaveBeenLastCalledWith({ minutes: 45, contacts })
    expect(window.location.search).toBe('')
  })

  it('Visão geral pela URL e pela troca de aba; a padrão (Conversas) fica fora da URL', () => {
    window.history.replaceState(null, '', `${SECRETARY_PAGE_PATH}?aba=${OVERVIEW_TAB}`)
    render(<SecretaryMetricsPage />)
    expect(screen.getByText('visão geral do secretário')).toBeTruthy()
    expect(screen.queryByTestId('secretary-inbox')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Conversas' }))
    expect(new URLSearchParams(window.location.search).has('aba')).toBe(false)
    expect(screen.getByTestId('secretary-inbox')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Memórias' }))
    expect(new URLSearchParams(window.location.search).get('aba')).toBe(SECRETARY_PAGE_TABS.memorias)
    expect(screen.getByText('memórias do secretário')).toBeTruthy()
  })

  it('skeleton com a estrutura do inbox enquanto a configuração carrega; erro com Tentar novamente', () => {
    evolutionReturns(query(undefined, { isPending: true }))
    const { unmount } = render(<SecretaryMetricsPage />)
    expect(screen.getByTestId('secretary-inbox-skeleton')).toBeTruthy()
    expect(mocks.inbox).not.toHaveBeenCalled()
    unmount()
    evolutionReturns(query(undefined, { isError: true }))
    render(<SecretaryMetricsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(mocks.refetch).toHaveBeenCalled()
  })
})
