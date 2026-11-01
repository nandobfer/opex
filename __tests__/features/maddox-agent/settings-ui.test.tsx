/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({
  save: vi.fn(async (input: unknown) => ({ settings: input })),
  saveClient: vi.fn(async (input: { enabled: boolean; enabledTools: string[] }) => input),
  formReply: vi.fn(),
  settings: null as unknown,
  // Objeto estável: a aba reinicia o formulário quando `data` muda.
  mcpStatus: { baseUrl: 'http://opex.local', servers: [{ scope: 'owner', name: 'opex_app', state: 'connected', error: null }], error: null },
  clientConfig: { enabled: false, enabledTools: ['get_portal_overview', 'list_tasks'] },
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/features/ai/hooks/useAi', () => ({
  AI_QUERY_KEY: 'ai',
  useAiModels: () => ({ data: [{ id: 'anthropic/claude', name: 'Claude', variants: ['high'], group: 'anthropic', contextWindow: null, free: false }], isLoading: false, isError: false, error: null }),
}))
vi.mock('@/features/ai/hooks/useMemories', () => ({ useMemoriesRealtime: () => {} }))
vi.mock('@/features/ai/components/memories/AgentMemoriesCard', () => ({ AgentMemoriesCard: ({ agentId }: { agentId: string }) => <div data-testid={`memories-${agentId}`} /> }))
vi.mock('@/features/ai/components/memories/ClientMemoriesCard', () => ({ ClientMemoriesCard: ({ agentId }: { agentId: string }) => <div data-testid={`memories-${agentId}`} /> }))
vi.mock('@/features/ai/components/memories/SelfMemorySwitch', () => ({ SelfMemorySwitch: ({ consumer }: { consumer: string }) => <div data-testid={`self-memory-${consumer}`} /> }))
vi.mock('@/features/maddox-agent/hooks/useMaddoxSettings', () => ({
  useMaddoxSettings: () => ({ data: mocks.settings, isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveMaddoxSettings: () => ({ mutateAsync: mocks.save, isPending: false }),
  useMaddoxMcpStatus: () => ({ data: mocks.mcpStatus, isLoading: false }),
  useReconnectMaddoxMcp: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/maddox-agent/hooks/useClientMaddoxAgentConfig', () => ({
  useClientMaddoxAgentConfig: () => ({ data: mocks.clientConfig, isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveClientMaddoxAgentConfig: () => ({ mutateAsync: mocks.saveClient, isPending: false }),
}))
vi.mock('@/features/opex-agent/hooks/useOpexSessions', () => ({ useReplyAgentForm: () => ({ mutate: mocks.formReply, isPending: false }) }))

import { MaddoxAgentTab } from '@/features/maddox-agent/components/settings/MaddoxAgentTab'
import { ClienteMaddoxAgentTab } from '@/features/maddox-agent/components/settings/client/ClienteMaddoxAgentTab'
import { DEFAULT_MADDOX_AGENT_SETTINGS } from '@/features/maddox-agent/schemas'
import { DEFAULT_MADDOX_INSTRUCTIONS } from '@/features/maddox-agent/constants'
import { AssistantMessage } from '@/features/opex-agent/components/chat/OpexMessageItem'
import { OpexScopeProvider } from '@/features/opex-agent/components/OpexScopeProvider'

beforeEach(() => {
  vi.clearAllMocks()
  // A seção fica na URL (`?secao=`): cada caso começa em Geral.
  window.history.replaceState(null, '', '/')
  mocks.settings = {
    settings: { ...DEFAULT_MADDOX_AGENT_SETTINGS, enabled: true, main: { model: 'anthropic/claude', variant: null }, instructions: 'Texto editado', mcpBaseUrl: 'http://opex.local' },
    isDefault: false,
    availability: { available: true, reason: null },
    updatedAt: null,
    tools: [
      { name: 'get_app_overview', group: 'context', label: 'Visão geral', description: '', risk: 'read', alwaysOn: true },
      { name: 'list_tasks', group: 'tasks', label: 'Listar tarefas', description: '', risk: 'read', alwaysOn: false },
    ],
  }
})
afterEach(cleanup)

describe('aba "Agente Maddox" da integração de IA', () => {
  it('seções Geral, Ferramentas e Memórias; memórias são as três listas próprias do Maddox', () => {
    render(<MaddoxAgentTab onDirtyChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /Geral/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Ferramentas/ })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: /MCPs/ })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Memórias/ }))
    expect(screen.getByTestId('memories-maddox-global')).toBeTruthy()
    expect(screen.getByTestId('memories-maddox-owner')).toBeTruthy()
    expect(screen.getByTestId('memories-maddox-client')).toBeTruthy()
    expect(screen.queryByTestId('memories-opex-global')).toBeNull()
    // OPE-104: Memórias do Opex (todos os agentes), memórias de um cliente específico e o aprendizado autônomo do Maddox.
    expect(screen.getByTestId('memories-app-global')).toBeTruthy()
    expect(screen.getByTestId('memories-maddox-client-specific')).toBeTruthy()
    expect(screen.getByTestId('self-memory-maddox')).toBeTruthy()
  })

  it('"Restaurar padrão" volta as instruções e salvar envia a configuração', async () => {
    render(<MaddoxAgentTab onDirtyChange={() => {}} />)
    expect((screen.getByLabelText('Agente') as HTMLTextAreaElement).value).toBe('Texto editado')
    fireEvent.click(screen.getAllByRole('button', { name: /Restaurar padrão/ })[0])
    expect((screen.getByLabelText('Agente') as HTMLTextAreaElement).value).toBe(DEFAULT_MADDOX_INSTRUCTIONS)
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ instructions: DEFAULT_MADDOX_INSTRUCTIONS, enabled: true })))
  })

  it('a cor usa a paleta com "Primária (padrão)" e mostra a situação do MCP do Opex', () => {
    render(<MaddoxAgentTab onDirtyChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Primária (padrão)' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Azul' }))
    expect(screen.getByRole('radio', { name: 'Azul' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('maddox-mcp-owner').textContent).toContain('Conectado')
    expect(screen.getByText('http://opex.local')).toBeTruthy()
  })
})

describe('aba "Agente Maddox" do cliente', () => {
  it('vem desligada (padrão) e ligar salva com a seleção do portal', async () => {
    render(<ClienteMaddoxAgentTab clientId="c1" />)
    const toggle = screen.getByRole('switch', { name: /Agente Maddox no portal/ })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByText(/ferramentas do próprio OpenCode/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(mocks.saveClient).toHaveBeenCalledWith({ enabled: true, enabledTools: ['get_portal_overview', 'list_tasks'] }))
    expect(screen.queryByText('Jobs agendados')).toBeNull()
  })
})

describe('pergunta e ferramenta nativa do OpenCode no chat do Maddox', () => {
  const form = { id: 'f1', title: 'Qual ambiente?', fields: [{ key: 'env', type: 'string' as const, title: 'Ambiente', description: null, required: true, options: [], custom: false, placeholder: null, defaultValue: 'prod', url: null }] }

  it('pergunta aberta mostra o formulário; respondida vira uma linha discreta', () => {
    const { rerender } = render(
      <OpexScopeProvider agent="maddox">
        <AssistantMessage streaming parts={[{ type: 'form', id: 'f1', form, status: 'pending' }]} />
      </OpexScopeProvider>,
    )
    expect(screen.getByTestId('opex-form-part').textContent).toContain('Qual ambiente?')
    rerender(
      <OpexScopeProvider agent="maddox">
        <AssistantMessage parts={[{ type: 'form', id: 'f1', form, status: 'answered' }]} />
      </OpexScopeProvider>,
    )
    expect(screen.getByTestId('opex-form-part-closed').textContent).toContain('Pergunta respondida')
  })

  it('ferramenta nativa aparece como card com o nome do OpenCode', () => {
    render(
      <OpexScopeProvider agent="maddox">
        <AssistantMessage parts={[{ type: 'tool', id: 't1', name: 'bash', group: 'opencode-native', label: 'bash', state: 'done', input: 'ls', output: 'a', error: null, confirmation: null, durationMs: 5 }]} />
      </OpexScopeProvider>,
    )
    expect(screen.getAllByText('bash').length).toBeGreaterThan(0)
  })
})

describe('controles do design system', () => {
  it('as telas do Maddox e da troca de agente não usam select nem checkbox nativos', () => {
    const roots = ['src/features/maddox-agent/components', 'src/features/opex-agent/components/agents']
    const files = roots.flatMap(function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? walk(path) : path.endsWith('.tsx') ? [path] : []
      })
    })
    expect(files.length).toBeGreaterThan(3)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/<select\b/)
      expect(source, file).not.toMatch(/type=["']checkbox["']/)
      expect(source, file).not.toMatch(/@radix-ui\/react-(select|checkbox|switch|tabs)/)
    }
  })
})
