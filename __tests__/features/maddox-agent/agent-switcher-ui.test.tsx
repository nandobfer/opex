/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  update: vi.fn(),
  sessions: { opex: [] as { id: string; status: string; title: string; modelOverride?: unknown }[], maddox: [] as { id: string; status: string; title: string; modelOverride?: unknown }[] },
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/features/opex-agent/hooks/useOpexSessions', async () => {
  const { useOpexScope } = await import('@/features/opex-agent/components/OpexScopeProvider')
  return {
    useOpexSessions: () => ({ data: mocks.sessions[useOpexScope().agent.id] }),
    useOpexRealtime: () => {},
    useUpdateOpexSession: () => ({ mutate: mocks.update, isPending: false }),
  }
})
vi.mock('@/features/opex-agent/hooks/useOpexJobs', () => ({ useOpexJobNotifications: () => {} }))
vi.mock('@/features/opex-agent/hooks/useOpexSettings', async () => {
  const { useOpexScope } = await import('@/features/opex-agent/components/OpexScopeProvider')
  return {
    useOpexView: () => {
      const { agent } = useOpexScope()
      return {
        data: {
          availability: { available: true, reason: null },
          files: { maxPerMessage: 5, maxSizeMb: 10 },
          modelLabel: agent.id === 'maddox' ? 'OpenCode · anthropic/claude' : 'Anthropic · claude-haiku',
          color: null,
          defaultModel: agent.id === 'maddox' ? { model: 'anthropic/claude', variant: null } : null,
        },
        isLoading: false,
      }
    },
  }
})
vi.mock('@/features/maddox-agent/hooks/useMaddoxSettings', () => ({ useMaddoxSettings: () => ({ data: { settings: { color: 'sky' } } }) }))
vi.mock('@/features/maddox-agent/hooks/useMaddoxModels', () => ({ useMaddoxModels: () => ({ data: [], isLoading: false }) }))
vi.mock('@/features/ai/components/model-picker/ModelOverridePicker', () => ({
  ModelOverridePicker: ({ choice, onChange }: { choice: { model: string | null }; onChange: (input: { model: string | null; variant: string | null }) => void }) => (
    <button type="button" data-testid="session-model-picker" onClick={() => onChange({ model: 'openai/gpt', variant: null })}>
      {choice.model}
    </button>
  ),
}))
vi.mock('@/features/opex-agent/components/chat/OpexChat', async () => {
  const { useOpexScope } = await import('@/features/opex-agent/components/OpexScopeProvider')
  return { OpexChat: () => <div data-testid={`OpexChat-${useOpexScope().agent.id}`} /> }
})
vi.mock('@/features/opex-agent/components/chat/OpexDraftChat', async () => {
  const { useOpexScope } = await import('@/features/opex-agent/components/OpexScopeProvider')
  return { OpexDraftChat: () => <div data-testid={`OpexDraftChat-${useOpexScope().agent.id}`} /> }
})
vi.mock('@/features/opex-agent/components/OpexSessionTabs', () => ({ OpexSessionTabs: () => null }))
vi.mock('@/features/opex-agent/components/OpexSessionsPanel', () => ({ OpexSessionsPanel: () => null }))

import { AgentChatNavItem } from '@/features/opex-agent/components/agents/AgentChatNavItem'
import type { OpexClientUiScope } from '@/features/opex-agent/components/OpexScopeProvider'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const renderItem = (props: Partial<Parameters<typeof AgentChatNavItem>[0]> = {}) => render(<ul><AgentChatNavItem collapsed={false} {...props} /></ul>, { wrapper })

beforeEach(() => {
  window.localStorage.clear()
  mocks.sessions = { opex: [], maddox: [] }
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('item único dos agentes de chat', () => {
  it('mostra um único item e abre o último agente escolhido', () => {
    window.localStorage.setItem('opex:chat-agent:active:v1', JSON.stringify('maddox'))
    renderItem()
    expect(screen.getAllByTestId('agent-nav-item')).toHaveLength(1)
    expect(screen.getByTestId('agent-nav-item').textContent).toContain('Agente Maddox')
  })

  it('o cabeçalho mostra o ativo e o outro agente apagado; clicar troca o painel e o item da barra lateral', async () => {
    renderItem()
    expect(screen.getByTestId('agent-nav-item').textContent).toContain('Agente Opex')
    fireEvent.click(screen.getByTestId('agent-nav-item'))
    const other = await screen.findByTestId('agent-switch-other')
    expect(other.getAttribute('data-agent')).toBe('maddox')
    expect(other.getAttribute('aria-label')).toBe('Trocar para o Agente Maddox')
    expect(other.className).toContain('opacity-50')
    expect(other.className).toContain('grayscale')
    expect(other.className).toContain('hover:opacity-100')
    // A cor do outro agente fica no próprio botão (acende com ela no hover).
    expect((other as HTMLElement).style.getPropertyValue('--primary')).not.toBe('')
    expect(screen.getByTestId('OpexDraftChat-opex')).toBeTruthy()

    fireEvent.click(other)
    await waitFor(() => expect(screen.getByTestId('agent-nav-item').textContent).toContain('Agente Maddox'))
    expect(JSON.parse(window.localStorage.getItem('opex:chat-agent:active:v1') ?? 'null')).toBe('maddox')
    expect(screen.getByTestId('agent-panel-maddox').hasAttribute('hidden')).toBe(false)
    expect(screen.getByTestId('agent-panel-opex').hasAttribute('hidden')).toBe(true)
    // O painel do Opex fica montado (oculto): o rascunho continua lá ao voltar.
    expect(within(screen.getByTestId('agent-panel-maddox')).getByTestId('agent-switch-other').getAttribute('data-agent')).toBe('opex')
  })

  it('o seletor de modelo da sessão só aparece no Maddox; na "Nova sessão" a escolha vale para a sessão criada', async () => {
    window.localStorage.setItem('opex:chat-agent:active:v1', JSON.stringify('opex'))
    renderItem()
    fireEvent.click(screen.getByTestId('agent-nav-item'))
    await screen.findByTestId('agent-switch-other')
    expect(screen.queryByTestId('session-model-picker')).toBeNull()
    fireEvent.click(screen.getByTestId('agent-switch-other'))
    const picker = await screen.findByTestId('session-model-picker')
    expect(picker.textContent).toBe('anthropic/claude')
    fireEvent.click(picker)
    await waitFor(() => expect(screen.getByTestId('session-model-picker').textContent).toBe('openai/gpt'))
  })

  it('a engrenagem leva à configuração do agente ativo', async () => {
    renderItem()
    fireEvent.click(screen.getByTestId('agent-nav-item'))
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar o Agente Opex' }))
    expect(mocks.push).toHaveBeenCalledWith('/integracoes/ia?aba=agente-opex')
    fireEvent.click(screen.getByTestId('agent-nav-item'))
    fireEvent.click(await screen.findByTestId('agent-switch-other'))
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar o Agente Maddox' }))
    expect(mocks.push).toHaveBeenLastCalledWith('/integracoes/ia?aba=agente-maddox')
  })

  it('atalhos: Ctrl+Shift+M abre no Maddox e Ctrl+Shift+O no Opex', async () => {
    renderItem()
    fireEvent.keyDown(window, { key: 'M', ctrlKey: true, shiftKey: true })
    await screen.findByTestId('agent-panel-maddox')
    expect(screen.getByTestId('agent-nav-item').textContent).toContain('Agente Maddox')
    fireEvent.keyDown(window, { key: 'O', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(screen.getByTestId('agent-nav-item').textContent).toContain('Agente Opex'))
  })

  it('ponto de atividade: aparece no item e no botão do outro agente quando ele está respondendo', async () => {
    mocks.sessions.maddox = [{ id: 's1', status: 'running', title: 'x' }]
    renderItem()
    await screen.findByTestId('agent-nav-busy')
    fireEvent.click(screen.getByTestId('agent-nav-item'))
    const other = await screen.findByTestId('agent-switch-other')
    expect(within(other).getByTestId('agent-switch-other-busy')).toBeTruthy()
  })

  it('portal com só o Agente Opex ligado: sem botão de troca e sem engrenagem', async () => {
    const client: OpexClientUiScope = { clientId: 'c1', clientName: 'ACME', userId: 'u1', userName: 'ana', isAdmin: false, http: { get: vi.fn(async () => new Promise(() => {})) } as never }
    window.localStorage.setItem('opex:chat-agent:active:v1:c1:u1', JSON.stringify('maddox'))
    renderItem({ client, initial: { opex: true, maddox: false } })
    expect(screen.getByTestId('agent-nav-item').textContent).toContain('Agente Opex')
    fireEvent.click(screen.getByTestId('agent-nav-item'))
    await screen.findByTestId('agent-panel-opex')
    expect(screen.queryByTestId('agent-switch-other')).toBeNull()
    expect(screen.queryByRole('button', { name: /Configurar/ })).toBeNull()
  })

  it('portal sem nenhum agente ligado: o item não aparece', () => {
    const client: OpexClientUiScope = { clientId: 'c1', clientName: 'ACME', userId: 'u1', userName: 'ana', isAdmin: false, http: { get: vi.fn(async () => new Promise(() => {})) } as never }
    renderItem({ client, initial: { opex: false, maddox: false } })
    expect(screen.queryByTestId('agent-nav-item')).toBeNull()
  })
})
