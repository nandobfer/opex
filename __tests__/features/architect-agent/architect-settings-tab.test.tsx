/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Aba "Agente Arquiteto" de `/integracoes/ia`: seções Geral · Diagrama · Agente · Memórias ·
 * Histórico, disparo, profundidade padrão, tipos de nó e o erro de validação levando à seção.
 */

const mocks = vi.hoisted(() => ({ save: vi.fn(async (values: unknown) => ({ settings: values })), settings: null as unknown, data: null as unknown }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/architect-agent/hooks/useArchitect', () => ({
  // Dados estáveis entre renders, como o TanStack Query (o efeito do formulário reinicia ao mudar).
  useArchitectSettings: () => {
    mocks.data ??= { settings: mocks.settings, isDefault: true, availability: { available: true, reason: null }, updatedAt: null }
    return { data: mocks.data, isLoading: false, isError: false }
  },
  useSaveArchitectSettings: () => ({ mutateAsync: mocks.save, isPending: false }),
}))
vi.mock('@/features/ai/hooks/useAi', () => ({
  useAiAgents: () => ({ data: [] }),
  useAiModels: (provider: string | null) => ({ data: provider === 'anthropic' ? [{ id: 'claude-sonnet', name: 'Claude Sonnet', variants: ['high'] }] : [], isLoading: false, isError: false }),
  // OpenCode e Anthropic conectados; Gemini configurado mas fora do ar.
  useAiProviderStatuses: () => ({
    providers: [
      { id: 'opencode', name: 'OpenCode', configured: true, connected: true },
      { id: 'anthropic', name: 'Anthropic', configured: true, connected: true },
      { id: 'gemini', name: 'Gemini', configured: true, connected: false },
    ],
  }),
}))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useCentrals: () => ({ data: [{ id: 'c1', projectName: 'Opex', repo: 'nandobfer/opex' }], isLoading: false }) }))
vi.mock('@/features/agentic/components/settings/AgentConfigFields', () => ({ AgentConfigFields: ({ error }: { error?: string }) => <div data-testid="agent-fields">{error}</div> }))
vi.mock('@/features/architect-agent/components/settings/MemoriesSection', () => ({ MemoriesSection: () => <div>Lista de memórias do arquiteto</div> }))
vi.mock('@/features/architect-agent/components/settings/HistorySection', () => ({ HistorySection: () => <div>Histórico de versões</div> }))

import { ArchitectAgentTab, sectionOfErrors } from '@/features/architect-agent/components/settings/ArchitectAgentTab'
import { DEFAULT_ARCHITECT_SETTINGS } from '@/features/architect-agent/schemas'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.data = null
})

const tab = (name: string) => screen.getByRole('radio', { name })

describe('ArchitectAgentTab', () => {
  it('mostra as cinco seções e troca o conteúdo', () => {
    mocks.settings = DEFAULT_ARCHITECT_SETTINGS
    render(<ArchitectAgentTab onDirtyChange={vi.fn()} />)
    for (const name of ['Geral', 'Diagrama', 'Agente', 'Memórias', 'Histórico']) expect(tab(name)).toBeTruthy()
    expect(screen.getByText('Disparo')).toBeTruthy()
    expect(screen.getByText('Centrais')).toBeTruthy()
    fireEvent.click(tab('Diagrama'))
    expect(screen.getByText('Profundidade padrão')).toBeTruthy()
    expect(screen.getByText(/até 12 nós/)).toBeTruthy()
    expect(screen.getByLabelText('Decisão')).toBeTruthy()
    expect(screen.getByLabelText('Processo')).toBeTruthy()
    // "Mostrar arquivos" saiu: o diagrama é de ideias.
    expect(screen.queryByText('Mostrar arquivos')).toBeNull()
    fireEvent.click(tab('Agente'))
    expect(screen.getByLabelText('Tempo máximo da geração (minutos)')).toBeTruthy()
    fireEvent.click(tab('Memórias'))
    expect(screen.getByText('Lista de memórias do arquiteto')).toBeTruthy()
    fireEvent.click(tab('Histórico'))
    expect(screen.getByText('Histórico de versões')).toBeTruthy()
  })

  it('disparo manual muda a explicação; salvar envia a configuração', async () => {
    mocks.settings = { ...DEFAULT_ARCHITECT_SETTINGS, agent: { agent: null, model: 'anthropic/opus', variant: null, fallbacks: [] } }
    render(<ArchitectAgentTab onDirtyChange={vi.fn()} />)
    expect(screen.getByText(/Ao aprovar o plano \(Implementar\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /^Manual/ }))
    expect(screen.getByText(/Nada roda sozinho/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar/ })))
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'manual' }))
  })

  it('ativar sem modelo leva à seção Agente com o erro', async () => {
    mocks.settings = { ...DEFAULT_ARCHITECT_SETTINGS, enabled: true }
    render(<ArchitectAgentTab onDirtyChange={vi.fn()} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar/ })))
    expect(mocks.save).not.toHaveBeenCalled()
    expect(tab('Agente').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('agent-fields').textContent).toBe('Selecione o modelo')
  })
})

describe('provedor do Agente Arquiteto', () => {
  it('OpenCode (padrão) mostra os campos do agente; um provedor direto troca para modelo e raciocínio, sem agente nem fallbacks', async () => {
    mocks.settings = { ...DEFAULT_ARCHITECT_SETTINGS, agent: { agent: 'build', model: 'anthropic/opus', variant: 'max', fallbacks: [{ model: 'openai/gpt', variant: null }] } }
    render(<ArchitectAgentTab onDirtyChange={vi.fn()} />)
    fireEvent.click(tab('Agente'))
    expect(screen.getByText('Provedor e modelo')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /OpenCode/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('agent-fields')).toBeTruthy()
    expect(screen.getByText(/só tem permissão de leitura/)).toBeTruthy()
    // Gemini fora do ar não pode ser escolhido.
    expect(screen.getByRole('radio', { name: /Gemini/ }).hasAttribute('disabled') || screen.getByRole('radio', { name: /Gemini/ }).getAttribute('aria-disabled') === 'true').toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Anthropic/ }))
    expect(screen.queryByTestId('agent-fields')).toBeNull()
    expect(screen.getByText('Modelo')).toBeTruthy()
    expect(screen.getByText(/Sem acesso ao código/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar/ })))
    // Trocar de provedor limpa modelo, variante, agente e fallbacks (os ids não valem entre provedores).
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic', agent: { agent: null, model: null, variant: null, fallbacks: [] } }))
  })

  it('configuração salva num provedor direto abre nele, com o modelo escolhido', () => {
    mocks.settings = { ...DEFAULT_ARCHITECT_SETTINGS, provider: 'anthropic', agent: { agent: null, model: 'claude-sonnet', variant: null, fallbacks: [] } }
    render(<ArchitectAgentTab onDirtyChange={vi.fn()} />)
    fireEvent.click(tab('Agente'))
    expect(screen.getByRole('radio', { name: /Anthropic/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Claude Sonnet')).toBeTruthy()
    expect(screen.queryByTestId('agent-fields')).toBeNull()
  })
})

describe('sectionOfErrors', () => {
  it('leva cada erro à seção do campo', () => {
    expect(sectionOfErrors({ diagram: {} })).toBe('diagrama')
    expect(sectionOfErrors({ timeoutMinutes: {} })).toBe('agente')
    expect(sectionOfErrors({ scope: {} })).toBe('geral')
  })
})

void React
