/** @vitest-environment jsdom */

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())
// Busca de modelos simplificada: o gatilho + um botão por modelo.
vi.mock('@/features/agentic/components/settings/ModelSearchPicker', () => ({
  ModelSearchPicker: ({ trigger, models, onPick }: { trigger: React.ReactElement; models: { data?: { id: string; name: string }[] }; onPick: (model: { id: string }) => void }) => (
    <div>
      {trigger}
      {(models.data ?? []).map((model) => (
        <button key={model.id} type="button" data-pick={model.id} onClick={() => onPick(model)}>
          escolher {model.name}
        </button>
      ))}
    </div>
  ),
}))

import { AgentConfigFields } from '@/features/agentic/components/settings/AgentConfigFields'
import { FallbackModelsField, describeFallbacks, fallbackIssue } from '@/features/agentic/components/settings/FallbackModelsField'
import type { AgentConfig } from '@/features/agentic/schemas'

const models = { data: [{ id: 'openai/gpt-5', name: 'GPT-5', variants: ['high'], group: 'OpenAI' }, { id: 'deepseek/v3', name: 'DeepSeek V3', variants: [], group: 'DeepSeek' }] as never, isLoading: false, isError: false, error: null }
const agents = { data: [], isError: false, error: null }

afterEach(() => cleanup())

describe('FallbackModelsField', () => {
  it('adiciona, remove e respeita o limite de 5', () => {
    const onChange = vi.fn()
    const { rerender } = render(<FallbackModelsField id="f" value={[]} onChange={onChange} models={models} primary={{ model: null, variant: null }} />)
    // Só o picker de "Adicionar fallback" está na tela (lista vazia).
    fireEvent.click(screen.getByText('escolher DeepSeek V3'))
    expect(onChange).toHaveBeenLastCalledWith([{ model: 'deepseek/v3', variant: null }])

    rerender(<FallbackModelsField id="f" value={[{ model: 'deepseek/v3', variant: null }]} onChange={onChange} models={models} primary={{ model: null, variant: null }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remover o fallback 1' }))
    expect(onChange).toHaveBeenLastCalledWith([])

    const five = Array.from({ length: 5 }, (_, index) => ({ model: `p/m${index}`, variant: null }))
    rerender(<FallbackModelsField id="f" value={five} onChange={onChange} models={models} primary={{ model: null, variant: null }} />)
    expect(screen.queryByText('Adicionar fallback')).toBeNull()
    expect(screen.getByText('Limite de 5 modelos de fallback.')).toBeTruthy()
  })

  it('aponta repetido e igual ao principal', () => {
    const list = [{ model: 'openai/gpt-5', variant: 'high' }, { model: 'deepseek/v3', variant: null }, { model: 'deepseek/v3', variant: null }]
    expect(fallbackIssue(list, 0, { model: 'openai/gpt-5', variant: 'high' })).toBe('Igual ao modelo principal')
    expect(fallbackIssue(list, 1, { model: 'openai/gpt-5', variant: 'high' })).toBeNull()
    expect(fallbackIssue(list, 2, { model: null, variant: null })).toBe('Modelo repetido')
    render(<FallbackModelsField id="f" value={list} onChange={vi.fn()} models={models} primary={{ model: 'openai/gpt-5', variant: 'high' }} />)
    expect(screen.getByText('Igual ao modelo principal')).toBeTruthy()
    expect(screen.getByText('Modelo repetido')).toBeTruthy()
  })

  it('resumo da lista', () => {
    expect(describeFallbacks([{ model: 'openai/gpt-5', variant: 'high' }, { model: 'deepseek/v3', variant: null }], models.data)).toBe('GPT-5 (high) → DeepSeek V3')
    expect(describeFallbacks(null)).toBe('sem fallback')
  })
})

describe('AgentConfigFields · fallback', () => {
  const inherited: AgentConfig = { agent: 'plan', model: 'anthropic/opus', variant: null, fallbacks: [{ model: 'openai/gpt-5', variant: 'high' }] }

  it('agentes padrão: mostra a lista direto', () => {
    render(<AgentConfigFields id="d" value={{ agent: 'plan', model: null, variant: null, fallbacks: [] }} onChange={vi.fn()} agents={agents} models={models} />)
    expect(screen.getByText('Modelos de fallback')).toBeTruthy()
    expect(screen.queryByText('Usar os do padrão')).toBeNull()
  })

  it('papel herdado: o resumo mostra os fallbacks do padrão', () => {
    render(<AgentConfigFields id="c" value={null} onChange={vi.fn()} agents={agents} models={models} inherited={inherited} />)
    expect(screen.getByText(/fallback: GPT-5 \(high\)/)).toBeTruthy()
  })

  it('central personalizada: herda, personaliza (copia a lista do padrão) ou desliga', () => {
    const onChange = vi.fn()
    const value: AgentConfig = { agent: 'plan', model: 'anthropic/opus', variant: null, fallbacks: null }
    const { rerender } = render(<AgentConfigFields id="c" value={value} onChange={onChange} agents={agents} models={models} inherited={inherited} />)
    expect(screen.getByText('Fallback do padrão: GPT-5 (high)')).toBeTruthy()

    fireEvent.click(screen.getByText('Personalizar', { selector: '[id="c-fallback-mode"] *, [id^="c-fallback-mode"]' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...value, fallbacks: [{ model: 'openai/gpt-5', variant: 'high' }] })

    fireEvent.click(screen.getByText('Sem fallback'))
    expect(onChange).toHaveBeenLastCalledWith({ ...value, fallbacks: [] })

    rerender(<AgentConfigFields id="c" value={{ ...value, fallbacks: [] }} onChange={onChange} agents={agents} models={models} inherited={inherited} />)
    expect(screen.getByText(/Sem fallback nesta central/)).toBeTruthy()
  })

  it('personalizar o papel começa herdando os fallbacks do padrão', () => {
    const onChange = vi.fn()
    render(<AgentConfigFields id="c" value={null} onChange={onChange} agents={agents} models={models} inherited={inherited} />)
    fireEvent.click(screen.getByText('Personalizar'))
    expect(onChange).toHaveBeenLastCalledWith({ agent: 'plan', model: 'anthropic/opus', variant: null, fallbacks: null })
  })
})
