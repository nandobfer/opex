/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { ModelOption, ModelPickerField, VariantSelectField } from '@/features/ai/components/ModelFields'

/** Campos compartilhados de modelo/variante (abas de IA, Agente Opex e Agente Mentor). */

afterEach(() => cleanup())

const models = [
  { id: 'flash', name: 'Gemini Flash', variants: ['low', 'high'], group: null, contextWindow: null, free: true },
  { id: 'pro', name: 'Gemini Pro', variants: [], group: null, contextWindow: null, free: false },
]
const query = (overrides: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {}) => ({ data: models, isLoading: false, isError: false, error: null, ...overrides })

describe('ModelPickerField', () => {
  it('mostra o nome do modelo salvo e, fora da lista, o id salvo', () => {
    const { rerender } = render(<ModelPickerField id="x-model" models={query()} modelId="flash" onPick={vi.fn()} />)
    expect(document.getElementById('x-model')!.textContent).toContain('Gemini Flash')
    rerender(<ModelPickerField id="x-model" models={query()} modelId="antigo" onPick={vi.fn()} />)
    expect(document.getElementById('x-model')!.textContent).toContain('antigo')
  })

  it('erro ao listar aparece no campo quando não há erro de validação', () => {
    const { rerender } = render(<ModelPickerField id="x-model" models={query({ isError: true, error: new Error('x') })} modelId={null} onPick={vi.fn()} />)
    expect(document.body.textContent).toContain('Não foi possível listar os modelos')
    rerender(<ModelPickerField id="x-model" models={query({ isError: true, error: new Error('x') })} modelId={null} error="Selecione o modelo" onPick={vi.fn()} />)
    expect(document.body.textContent).toContain('Selecione o modelo')
  })
})

describe('ModelOption', () => {
  it('mostra nome, id e o selo grátis', () => {
    render(<ModelOption model={models[0]!} />)
    expect(document.body.textContent).toContain('Gemini Flash')
    expect(document.body.textContent).toContain('flash')
    expect(screen.getByText('grátis')).toBeTruthy()
  })
})

describe('VariantSelectField', () => {
  it('mostra "Padrão do modelo" sem variante escolhida', () => {
    render(<VariantSelectField id="x-variant" label="Raciocínio" variants={['low', 'high']} value={null} onChange={vi.fn()} />)
    expect(document.getElementById('x-variant')!.textContent).toContain('Padrão do modelo')
    expect(screen.getByText('Raciocínio')).toBeTruthy()
  })

  it('mostra a variante salva', () => {
    render(<VariantSelectField id="x-variant" label="Raciocínio" variants={['low', 'high']} value="high" onChange={vi.fn()} />)
    expect(document.getElementById('x-variant')!.textContent).toContain('high')
  })
})
