/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { ModelFavoriteButton } from '@/features/ai/components/model-picker/ModelFavoriteButton'

afterEach(() => cleanup())

describe('ModelFavoriteButton', () => {
  it('não favorito: "Favoritar modelo", aria-pressed false e estrela vazia', () => {
    render(<ModelFavoriteButton favorite={false} onToggle={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Favoritar modelo' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.querySelector('svg')!.getAttribute('class')).not.toContain('fill-primary')
  })

  it('favorito: "Remover dos favoritos", aria-pressed true e estrela preenchida na primária', () => {
    render(<ModelFavoriteButton favorite onToggle={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Remover dos favoritos' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.querySelector('svg')!.getAttribute('class')).toContain('fill-primary')
  })

  it('clique alterna sem propagar e o mousedown não rouba o foco da busca', () => {
    const onToggle = vi.fn()
    const parent = vi.fn()
    render(
      <div onClick={parent}>
        <ModelFavoriteButton favorite={false} onToggle={onToggle} />
      </div>,
    )
    const button = screen.getByRole('button', { name: 'Favoritar modelo' })
    expect(fireEvent.mouseDown(button)).toBe(false)
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(parent).not.toHaveBeenCalled()
  })
})
