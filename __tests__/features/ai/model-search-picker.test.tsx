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

import { ModelSearchPicker } from '@/features/ai/components/model-picker/ModelSearchPicker'

/** Busca de modelos do OpenCode (fallbacks, mesa e fork): estrela e favoritos no topo (OPE-152). */

const MODELS = [
  { id: 'anthropic/opus', name: 'Claude Opus', variants: [], group: 'Anthropic', contextWindow: null, free: false },
  { id: 'openai/gpt-5', name: 'GPT-5', variants: [], group: 'OpenAI', contextWindow: null, free: false },
  { id: 'google/gemini-pro', name: 'Gemini Pro', variants: [], group: 'Google', contextWindow: null, free: false },
]

afterEach(() => cleanup())
beforeEach(() => {
  fav.favorites = []
  fav.setFavorite.mockReset()
})

function renderPicker(onPick = vi.fn()) {
  render(<ModelSearchPicker trigger={<button type="button">Trocar modelo</button>} models={{ data: MODELS, isLoading: false }} onPick={onPick} />)
  fireEvent.click(screen.getByRole('button', { name: 'Trocar modelo' }))
  return onPick
}

describe('ModelSearchPicker: favoritos', () => {
  it('favoritos do OpenCode no topo; favorito de outro provedor com o mesmo id não conta', () => {
    fav.favorites = [{ provider: 'opencode', model: 'google/gemini-pro' }, { provider: 'gemini', model: 'openai/gpt-5' }]
    renderPicker()
    const options = screen.getAllByRole('option').map((option) => option.textContent ?? '')
    expect(options[0]).toContain('Gemini Pro')
    expect(options[1]).toContain('Claude Opus')
    expect(options[2]).toContain('GPT-5')
    expect(screen.getAllByRole('button', { name: 'Remover dos favoritos' })).toHaveLength(1)
  })

  it('com termo, o favorito que casa vem antes', () => {
    fav.favorites = [{ provider: 'opencode', model: 'openai/gpt-5' }]
    renderPicker()
    fireEvent.change(screen.getByLabelText('Buscar modelo'), { target: { value: 'o' } })
    expect(screen.getAllByRole('option')[0]!.textContent).toContain('GPT-5')
  })

  it('a estrela favorita no escopo do OpenCode sem escolher o modelo', () => {
    const onPick = renderPicker()
    fireEvent.click(screen.getAllByRole('button', { name: 'Favoritar modelo' })[1]!)
    expect(fav.setFavorite).toHaveBeenCalledWith({ provider: 'opencode', model: 'openai/gpt-5', favorite: true })
    expect(onPick).not.toHaveBeenCalled()
  })
})
