/** @vitest-environment happy-dom */

import React from 'react'
import { useForm } from 'react-hook-form'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Card "Provedor e modelo" com os modelos de fallback (OPE-181): com `fallbacksName` e o OpenCode, a
 * lista aparece abaixo do modelo e grava no campo do formulário; sem a prop (ou fora do OpenCode), não.
 */

const models = { data: [{ id: 'anthropic/claude', name: 'Claude', variants: [], group: 'Anthropic' }, { id: 'deepseek/flash', name: 'Flash', variants: [], group: 'DeepSeek' }], isLoading: false, isError: false, error: null }

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => models, useAiAgents: () => ({ data: [], isError: false, error: null }) }))
vi.mock('@/features/ai/components/ModelFields', () => ({ ModelPickerField: () => <div>modelo principal</div>, VariantSelectField: () => null }))
// Busca de modelos simplificada: o gatilho + um botão por modelo.
vi.mock('@/features/ai/components/model-picker/ModelSearchPicker', () => ({
  ModelSearchPicker: ({ trigger, models: list, onPick }: { trigger: React.ReactElement; models: { data?: { id: string; name: string }[] }; onPick: (model: { id: string }) => void }) => (
    <div>
      {trigger}
      {(list.data ?? []).map((model) => (
        <button key={model.id} type="button" onClick={() => onPick(model)}>
          escolher {model.name}
        </button>
      ))}
    </div>
  ),
}))

import { ProviderModelCard } from '@/features/ai/components/shared/ProviderModelCard'

type Values = { provider: 'opencode' | 'gemini' | null; model: string | null; agent: string | null; variant: string | null; fallbacks: { model: string; variant: string | null }[] }

function Harness({ fallbacksName, provider = 'opencode', onValues }: { fallbacksName?: string; provider?: 'opencode' | 'gemini'; onValues?: (values: Values) => void }) {
  const form = useForm<Values>({ defaultValues: { provider, model: 'anthropic/claude', agent: null, variant: null, fallbacks: [] } })
  return (
    <>
      <ProviderModelCard form={form} providers={[]} fixedProvider={provider} hideAgent fallbacksName={fallbacksName} />
      <button type="button" onClick={() => onValues?.(form.getValues())}>
        ler valores
      </button>
    </>
  )
}

afterEach(() => cleanup())

describe('ProviderModelCard com modelos de fallback', () => {
  it('com fallbacksName no OpenCode: adiciona e remove itens no campo do formulário', () => {
    const onValues = vi.fn()
    render(<Harness fallbacksName="fallbacks" onValues={onValues} />)
    expect(screen.getByText('Modelos de fallback')).toBeTruthy()
    fireEvent.click(screen.getByText('escolher Flash'))
    fireEvent.click(screen.getByText('ler valores'))
    expect(onValues).toHaveBeenLastCalledWith(expect.objectContaining({ fallbacks: [{ model: 'deepseek/flash', variant: null }] }))
    fireEvent.click(screen.getByRole('button', { name: 'Remover o fallback 1' }))
    fireEvent.click(screen.getByText('ler valores'))
    expect(onValues).toHaveBeenLastCalledWith(expect.objectContaining({ fallbacks: [] }))
  })

  it('aponta o fallback igual ao modelo principal', () => {
    render(<Harness fallbacksName="fallbacks" />)
    fireEvent.click(screen.getByText('escolher Claude'))
    expect(screen.getByText('Igual ao modelo principal')).toBeTruthy()
  })

  it('sem fallbacksName ou fora do OpenCode, a lista não aparece', () => {
    const { unmount } = render(<Harness />)
    expect(screen.queryByText('Modelos de fallback')).toBeNull()
    unmount()
    render(<Harness fallbacksName="fallbacks" provider="gemini" />)
    expect(screen.queryByText('Modelos de fallback')).toBeNull()
  })
})
