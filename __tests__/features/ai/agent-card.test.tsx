/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { modelFavoritesMock } from '../../helpers/model-favorites'

/** Cartão compartilhado do agente: sem `providerSelect` (Agente Adversário) é sempre OpenCode. */

vi.mock('@/features/ai/hooks/useAi', () => ({
  useAiAgents: () => ({ data: [] }),
  useAiModels: () => ({ data: [], isLoading: false, isError: false }),
  useAiProviderStatuses: () => ({ providers: [{ id: 'opencode', name: 'OpenCode', configured: true, connected: true }, { id: 'anthropic', name: 'Anthropic', configured: true, connected: true }] }),
}))
vi.mock('@/features/ai/hooks/useAiModelFavorites', () => modelFavoritesMock())
vi.mock('@/features/agentic/components/settings/AgentConfigFields', () => ({ AgentConfigFields: () => <div data-testid="agent-fields" /> }))

import { AgentCard, type AgentCardCopy, type AgentFormShape } from '@/features/ai/components/agent-settings/AgentCard'

const COPY: AgentCardCopy = { id: 't', description: 'd', timeoutLabel: 'Tempo', timeoutMin: 1, timeoutMax: 60, placeholder: '', notice: 'aviso do OpenCode', directNotice: 'aviso direto' }

function Card({ providerSelect, provider }: { providerSelect?: boolean; provider?: 'opencode' | 'anthropic' }) {
  const form = useForm<AgentFormShape>({ defaultValues: { provider, agent: { agent: null, model: null, variant: null, fallbacks: [] }, timeoutMinutes: 10, instructions: '' } })
  return <AgentCard form={form} copy={COPY} providerSelect={providerSelect} />
}

afterEach(cleanup)

describe('AgentCard', () => {
  it('sem providerSelect: só OpenCode, sem seletor de provedor (mesmo com um provedor no formulário)', () => {
    render(<Card provider="anthropic" />)
    expect(screen.getByText('Agente do OpenCode')).toBeTruthy()
    expect(screen.queryByText('Provedor')).toBeNull()
    expect(screen.getByTestId('agent-fields')).toBeTruthy()
    expect(screen.getByText('aviso do OpenCode')).toBeTruthy()
  })

  it('com providerSelect num provedor direto: modelo e o aviso sem acesso ao código', () => {
    render(<Card providerSelect provider="anthropic" />)
    expect(screen.getByText('Provedor e modelo')).toBeTruthy()
    expect(screen.queryByTestId('agent-fields')).toBeNull()
    expect(screen.getByText('aviso direto')).toBeTruthy()
  })
})

void React
