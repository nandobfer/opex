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
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiAgents: () => ({ data: [] }), useAiModels: () => ({ data: [] }) }))
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
    expect(screen.getByText(/até 35 nós/)).toBeTruthy()
    expect(screen.getByLabelText('Decisão')).toBeTruthy()
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

describe('sectionOfErrors', () => {
  it('leva cada erro à seção do campo', () => {
    expect(sectionOfErrors({ diagram: {} })).toBe('diagrama')
    expect(sectionOfErrors({ timeoutMinutes: {} })).toBe('agente')
    expect(sectionOfErrors({ scope: {} })).toBe('geral')
  })
})

void React
