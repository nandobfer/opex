/** @vitest-environment happy-dom */

import React from 'react'
import { useForm } from 'react-hook-form'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Card de modelo do Agente Maddox (OPE-181): os modelos de fallback aparecem só no modelo padrão
 * (`main`) e trocar o modelo principal preserva a lista no formulário.
 */

const models = { data: [{ id: 'anthropic/claude', name: 'Claude', variants: [], group: 'Anthropic' }, { id: 'openai/gpt', name: 'GPT', variants: [], group: 'OpenAI' }, { id: 'deepseek/flash', name: 'Flash', variants: [], group: 'DeepSeek' }], isLoading: false, isError: false, error: null }

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => models }))
// Seletor do modelo principal simplificado: um botão por modelo.
vi.mock('@nandobfer/integracoes/modules/integrations/ia/features/ai/components/ModelFields', () => ({
  ModelPickerField: ({ id, onPick }: { id: string; onPick: (model: { id: string }) => void }) => (
    <div>
      {models.data.map((model) => (
        <button key={model.id} type="button" onClick={() => onPick(model)}>
          {id}: principal {model.name}
        </button>
      ))}
    </div>
  ),
  VariantSelectField: () => null,
}))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/features/ai/components/model-picker/ModelSearchPicker', () => ({
  ModelSearchPicker: ({ trigger }: { trigger: React.ReactElement }) => <div>{trigger}</div>,
}))

import { MaddoxModelCard } from '@/features/maddox-agent/components/settings/MaddoxModelCard'
import { DEFAULT_MADDOX_AGENT_SETTINGS, type MaddoxAgentSettings } from '@/features/maddox-agent/schemas'

const FALLBACKS = [{ model: 'deepseek/flash', variant: null }]

function Harness({ target, onValues }: { target: 'main' | 'title'; onValues?: (values: MaddoxAgentSettings) => void }) {
  const form = useForm<MaddoxAgentSettings>({ defaultValues: { ...DEFAULT_MADDOX_AGENT_SETTINGS, main: { model: 'anthropic/claude', variant: null, fallbacks: FALLBACKS } } })
  return (
    <>
      <MaddoxModelCard form={form} target={target} title="Modelo" description="Descrição" />
      <button type="button" onClick={() => onValues?.(form.getValues())}>
        ler valores
      </button>
    </>
  )
}

afterEach(() => cleanup())

describe('MaddoxModelCard com modelos de fallback', () => {
  it('modelo padrão: mostra a lista e trocar o modelo principal preserva os fallbacks', () => {
    const onValues = vi.fn()
    render(<Harness target="main" onValues={onValues} />)
    expect(screen.getByText('Modelos de fallback')).toBeTruthy()
    fireEvent.click(screen.getByText('maddox-main-model: principal GPT'))
    fireEvent.click(screen.getByText('ler valores'))
    expect(onValues).toHaveBeenLastCalledWith(expect.objectContaining({ main: { model: 'openai/gpt', variant: null, fallbacks: FALLBACKS } }))
    // A lista continua na tela depois da troca.
    expect(screen.getByRole('button', { name: 'Remover o fallback 1' })).toBeTruthy()
  })

  it('subagente de título: não mostra a lista e não mexe nos fallbacks do modelo padrão', () => {
    const onValues = vi.fn()
    render(<Harness target="title" onValues={onValues} />)
    expect(screen.queryByText('Modelos de fallback')).toBeNull()
    fireEvent.click(screen.getByText('maddox-title-model: principal Flash'))
    fireEvent.click(screen.getByText('ler valores'))
    expect(onValues).toHaveBeenLastCalledWith(expect.objectContaining({ title: { model: 'deepseek/flash', variant: null }, main: expect.objectContaining({ fallbacks: FALLBACKS }) }))
  })
})
