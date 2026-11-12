/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Bot } from 'lucide-react'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Conversa com o agente rotineiro na Visão geral (OPE-160): o chat do Agente Opex/Maddox no escopo do
 * agente (rotas, eventos e abas próprios, sem anexos), recolhível para a direita num contêiner compacto
 * com a situação das conversas.
 */

const mocks = vi.hoisted(() => ({
  sessions: [] as { id: string; status: string }[],
  newSession: vi.fn(),
  setListOpen: vi.fn(),
  scopes: [] as { apiBase: string; agent: { id: string; label: string; attachments: boolean; events: { updated: string } }; tabsKey: string; queryPrefix: string }[],
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }))
vi.mock('@/features/opex-agent/hooks/useOpexSessions', () => ({ useOpexRealtime: () => {} }))
vi.mock('@/features/opex-agent/hooks/useOpexSettings', () => ({ useOpexView: () => ({ data: { modelLabel: 'OpenAI · gpt-x' }, isLoading: false }) }))
vi.mock('@/features/maddox-agent/hooks/useMaddoxModels', () => ({ useMaddoxModels: () => ({ data: [] }) }))
vi.mock('@/features/opex-agent/components/agents/AgentChatBody', async () => {
  const { useOpexScope } = await import('@/features/opex-agent/components/OpexScopeProvider')
  return {
    useAgentChat: () => ({ sessions: { data: mocks.sessions }, activeSession: null, listOpen: false, toggleList: vi.fn(), newSession: mocks.newSession, setListOpen: mocks.setListOpen }),
    AgentChatBody: () => {
      mocks.scopes.push(useOpexScope() as never)
      return <div data-testid="chat-body" />
    },
  }
})

import { RoutineChatColumn, useRoutineChatCollapsed } from '@/features/routine-agents/components/chat/RoutineChatColumn'

function Harness() {
  const { collapsed, setCollapsed } = useRoutineChatCollapsed()
  return <RoutineChatColumn agent={{ id: 'ag1', title: 'Agente Vagas' }} icon={Bot} collapsed={collapsed} onCollapsedChange={setCollapsed} />
}

function ControlledHarness() {
  const [collapsed, setCollapsed] = useState(true)
  return <RoutineChatColumn agent={{ id: 'ag1', title: 'Agente Vagas' }} icon={Bot} collapsed={collapsed} onCollapsedChange={setCollapsed} />
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.sessions = []
  mocks.scopes = []
  window.localStorage.clear()
})
afterEach(() => cleanup())

describe('conversa com o agente rotineiro (OPE-160)', () => {
  it('expandida: cabeçalho do agente e o chat no escopo do rotineiro (rotas, eventos, abas, sem anexos)', () => {
    render(<Harness />)
    expect(screen.getByTestId('routine-chat').getAttribute('data-collapsed')).toBe('false')
    expect(screen.getByText('Agente Vagas')).toBeTruthy()
    expect(screen.getByText('OpenAI · gpt-x')).toBeTruthy()
    const scope = mocks.scopes.at(-1)!
    expect(scope.apiBase).toBe('/routine-agents/ag1/chat')
    expect(scope.agent).toMatchObject({ id: 'routine', label: 'Agente Vagas', attachments: false, events: { updated: 'routine-chat-session-updated' } })
    expect(scope.tabsKey).toContain('ag1')
    expect(scope.queryPrefix).toBe('routine-chat:ag1')
  })

  it('recolhe para o contêiner compacto e expande de novo; a escolha fica guardada no navegador', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Recolher a conversa' }))
    expect(screen.getByTestId('routine-chat').getAttribute('data-collapsed')).toBe('true')
    expect(screen.getByTestId('routine-chat-rail')).toBeTruthy()
    expect(screen.queryByTestId('chat-body')).toBeNull()
    cleanup()
    render(<Harness />)
    expect(screen.getByTestId('routine-chat').getAttribute('data-collapsed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir a conversa' }))
    expect(screen.getByTestId('routine-chat').getAttribute('data-collapsed')).toBe('false')
    expect(screen.getByTestId('chat-body')).toBeTruthy()
  })

  it('recolhida mostra a situação: confirmação pendente vence e conta as sessões', () => {
    mocks.sessions = [
      { id: 'a', status: 'running' },
      { id: 'b', status: 'awaiting_confirmation' },
    ]
    render(<ControlledHarness />)
    expect(screen.getByTestId('routine-chat-rail-status').getAttribute('data-status')).toBe('awaiting_confirmation')
    expect(screen.getByTestId('routine-chat-rail-pending').textContent).toBe('1')
  })

  it('"Nova sessão" no contêiner compacto expande e começa a nova sessão', () => {
    render(<ControlledHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
    expect(mocks.newSession).toHaveBeenCalled()
    expect(screen.getByTestId('routine-chat').getAttribute('data-collapsed')).toBe('false')
  })
})
