/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

const fav = vi.hoisted(() => ({ favorites: [] as { provider: string; model: string }[], setFavorite: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/ai/hooks/useAiModelFavorites', () => ({
  useAiModelFavorites: () => ({ favorites: fav.favorites, setFavorite: fav.setFavorite, isFavorite: () => false }),
}))

import { ModelOption, ModelPickerField, VariantSelectField } from '@/features/ai/components/ModelFields'

/** Campos compartilhados de modelo/variante (abas de IA, Agente Opex e Agente Mentor). */

afterEach(() => cleanup())
beforeEach(() => {
  fav.favorites = []
  fav.setFavorite.mockReset()
})

const models = [
  { id: 'flash', name: 'Gemini Flash', variants: ['low', 'high'], group: null, contextWindow: null, free: true },
  { id: 'pro', name: 'Gemini Pro', variants: [], group: null, contextWindow: null, free: false },
]
const query = (overrides: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {}) => ({ data: models, isLoading: false, isError: false, error: null, ...overrides })

describe('ModelPickerField', () => {
  it('mostra o nome do modelo salvo e, fora da lista, o id salvo', () => {
    const { rerender } = render(<ModelPickerField id="x-model" provider="gemini" models={query()} modelId="flash" onPick={vi.fn()} />)
    expect(document.getElementById('x-model')!.textContent).toContain('Gemini Flash')
    rerender(<ModelPickerField id="x-model" provider="gemini" models={query()} modelId="antigo" onPick={vi.fn()} />)
    expect(document.getElementById('x-model')!.textContent).toContain('antigo')
  })

  it('erro ao listar aparece no campo quando não há erro de validação', () => {
    const { rerender } = render(<ModelPickerField id="x-model" provider="gemini" models={query({ isError: true, error: new Error('x') })} modelId={null} onPick={vi.fn()} />)
    expect(document.body.textContent).toContain('Não foi possível listar os modelos')
    rerender(<ModelPickerField id="x-model" provider="gemini" models={query({ isError: true, error: new Error('x') })} modelId={null} error="Selecione o modelo" onPick={vi.fn()} />)
    expect(document.body.textContent).toContain('Selecione o modelo')
  })
})

describe('ModelPickerField: favoritos (OPE-152)', () => {
  const open = () => fireEvent.click(document.getElementById('x-model')!)
  const optionNames = () => screen.getAllByRole('option').map((option) => option.textContent ?? '')

  it('cada opção tem a estrela; favoritos do provedor vêm primeiro e a estrela fica pressionada', () => {
    fav.favorites = [{ provider: 'gemini', model: 'pro' }, { provider: 'openai', model: 'flash' }]
    render(<ModelPickerField id="x-model" provider="gemini" models={query()} modelId={null} onPick={vi.fn()} />)
    open()
    expect(optionNames()[0]).toContain('Gemini Pro')
    expect(optionNames()[1]).toContain('Gemini Flash')
    const pressed = screen.getAllByRole('button', { name: 'Remover dos favoritos' })
    expect(pressed).toHaveLength(1)
    expect(pressed[0]!.getAttribute('aria-pressed')).toBe('true')
    // O mesmo id favoritado em OUTRO provedor não conta.
    expect(screen.getByRole('button', { name: 'Favoritar modelo' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('clicar na estrela alterna o favorito sem escolher o modelo nem fechar a lista', () => {
    const onPick = vi.fn()
    render(<ModelPickerField id="x-model" provider="gemini" models={query()} modelId={null} onPick={onPick} />)
    open()
    fireEvent.click(screen.getAllByRole('button', { name: 'Favoritar modelo' })[0]!)
    expect(fav.setFavorite).toHaveBeenCalledWith({ provider: 'gemini', model: 'flash', favorite: true })
    expect(onPick).not.toHaveBeenCalled()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('desfavoritar pede a remoção do favorito', () => {
    fav.favorites = [{ provider: 'gemini', model: 'pro' }]
    render(<ModelPickerField id="x-model" provider="gemini" models={query()} modelId={null} onPick={vi.fn()} />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Remover dos favoritos' }))
    expect(fav.setFavorite).toHaveBeenCalledWith({ provider: 'gemini', model: 'pro', favorite: false })
  })

  it('sem provedor não há estrela', () => {
    render(<ModelPickerField id="x-model" provider={null} models={query()} modelId={null} onPick={vi.fn()} />)
    open()
    expect(screen.queryByRole('button', { name: 'Favoritar modelo' })).toBeNull()
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
