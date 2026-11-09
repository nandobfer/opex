/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../../helpers/framer-motion'

/**
 * Os pais dos pickers de modelo repassam o PROVEDOR certo (escopo do favorito): sem ele a estrela some
 * ou grava no escopo errado. Cada caso abre o campo "Modelo" do pai, confere que o favorito do provedor
 * esperado vem primeiro (os modelos têm ids por provedor, então um favorito de outro escopo não casa) e
 * que a estrela favorita com esse provedor (OPE-152).
 */

const fav = vi.hoisted(() => ({ favorites: [] as { provider: string; model: string }[], setFavorite: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/ai/hooks/useAiModelFavorites', () => ({
  useAiModelFavorites: () => ({ favorites: fav.favorites, setFavorite: fav.setFavorite, isFavorite: () => false }),
}))
vi.mock('@/features/ai/hooks/useAi', () => ({
  useAiModels: (provider: string | null) => ({
    data: provider ? ['a', 'b'].map((suffix) => ({ id: `${provider}-${suffix}`, name: `${provider} ${suffix}`, variants: [], group: null, contextWindow: null, free: false })) : undefined,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useAiAgents: () => ({ data: [], isLoading: false, isError: false, error: null }),
}))

import { DirectModelFields } from '@/features/ai/components/agent-settings/DirectModelFields'
import { ProviderModelCard } from '@/features/ai/components/shared/ProviderModelCard'
import { MentorModelFields } from '@/features/adversarial-agent/components/mentor/MentorModelFields'
import { MaddoxModelCard } from '@/features/maddox-agent/components/settings/MaddoxModelCard'
import { OpexModelCard } from '@/features/opex-agent/components/settings/OpexModelCard'
import { OpexAiModelPicker } from '@/features/engramind/components/shared/OpexAiModelPicker'

afterEach(() => cleanup())
beforeEach(() => {
  // O segundo modelo de cada provedor é favorito: só o provedor certo o põe no topo.
  fav.favorites = ['opencode', 'gemini', 'anthropic', 'openai', 'deepseek'].map((provider) => ({ provider, model: `${provider}-b` }))
  fav.setFavorite.mockReset()
})

const status = (id: string) => ({ id, integrationId: `ai_${id}`, name: id, configured: true, connected: true })
const PROVIDERS = ['opencode', 'gemini', 'anthropic', 'openai', 'deepseek'].map(status)

/** Abre o campo "Modelo" e confere: favorito do provedor primeiro, estrela fixada, e favoritar grava no escopo. */
function expectScoped(fieldId: string, provider: string) {
  fireEvent.click(document.getElementById(fieldId)!)
  const options = screen.getAllByRole('option').map((option) => option.textContent ?? '')
  expect(options[0]).toContain(`${provider} b`)
  expect(options[1]).toContain(`${provider} a`)
  expect(screen.getAllByRole('button', { name: 'Remover dos favoritos' })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Favoritar modelo' }))
  expect(fav.setFavorite).toHaveBeenCalledWith({ provider, model: `${provider}-a`, favorite: true })
}

describe('pais dos pickers de modelo repassam o provedor', () => {
  it('Maddox: sempre o escopo do OpenCode', () => {
    function Host() {
      const form = useForm({ defaultValues: { main: { model: null, variant: null }, title: { model: null, variant: null } } })
      return <MaddoxModelCard form={form as never} target="main" title="Modelo" description="d" />
    }
    render(<Host />)
    expectScoped('maddox-main-model', 'opencode')
  })

  it('Agente Opex: o provedor escolhido no formulário', () => {
    function Host() {
      const form = useForm({ defaultValues: { main: { provider: 'openai', model: null, variant: null, temperature: null, maxOutputTokens: null }, title: { provider: null, model: null, variant: null } } })
      return <OpexModelCard form={form as never} target="main" providers={PROVIDERS} title="Modelo" description="d" />
    }
    render(<Host />)
    expectScoped('opex-main-model', 'openai')
  })

  it('Agente Mentor: o provedor da parte (decisor)', () => {
    function Host() {
      const form = useForm({ defaultValues: { decider: { provider: 'anthropic', model: null, variant: null } } })
      return <MentorModelFields form={form as never} part="decider" providerIds={['anthropic', 'openai'] as never} providers={PROVIDERS} />
    }
    render(<Host />)
    expectScoped('mentor-decider-model', 'anthropic')
  })

  it('provedor direto (DirectModelFields): o provedor recebido', () => {
    render(<DirectModelFields id="direct" provider="deepseek" value={{ agent: null, model: null, variant: null, fallbacks: [] }} onChange={vi.fn()} />)
    expectScoped('direct-model', 'deepseek')
  })

  it('abas de IA (ProviderModelCard): o provedor fixo e o do formulário', () => {
    function Host() {
      const form = useForm({ defaultValues: { provider: 'gemini', model: null, agent: null, variant: null } })
      return <ProviderModelCard form={form as never} providers={PROVIDERS as never} />
    }
    render(<Host />)
    expectScoped('ai-model', 'gemini')
  })

  it('Redator/curador do Engramind (OpexAiModelPicker): o provedor recebido', () => {
    render(<OpexAiModelPicker id="redator" providers={PROVIDERS} allowed={['gemini', 'openai'] as never} provider="openai" modelId={null} models={{ data: ['a', 'b'].map((s) => ({ id: `openai-${s}`, name: `openai ${s}`, variants: [], group: null, contextWindow: null, free: false })), isLoading: false, isError: false, error: null } as never} emptyText="vazio" onProviderChange={vi.fn()} onModelPick={vi.fn()} />)
    expectScoped('redator-model', 'openai')
  })

  it('sem provedor escolhido (Opex) o campo fica desabilitado e não há estrela', () => {
    function Host() {
      const form = useForm({ defaultValues: { main: { provider: null, model: null, variant: null, temperature: null, maxOutputTokens: null }, title: { provider: null, model: null, variant: null } } })
      return <OpexModelCard form={form as never} target="main" providers={PROVIDERS} title="Modelo" description="d" />
    }
    render(<Host />)
    expect(screen.queryByRole('button', { name: 'Favoritar modelo' })).toBeNull()
  })
})

