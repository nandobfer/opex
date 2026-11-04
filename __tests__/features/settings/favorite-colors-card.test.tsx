/** @vitest-environment happy-dom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ColorPalette } from '@/features/color-palette/hooks'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

const palette = vi.hoisted(() => ({ current: null as unknown as ColorPalette }))
vi.mock('@/features/color-palette/hooks', () => ({ useColorPalette: () => palette.current }))

import { FavoriteColorsCard } from '@/features/settings/components/FavoriteColorsCard'

const base = (): ColorPalette => ({
  favorites: [
    { color: '#A78BFA', name: 'Violeta' },
    { color: '#3F3F46', name: null },
  ],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  updateFavorite: vi.fn(),
  isFavorite: () => false,
})

beforeEach(() => {
  palette.current = base()
})
afterEach(cleanup)

describe('FavoriteColorsCard', () => {
  it('lista as favoritas (nome ou hex) e avisa a de pouco contraste', () => {
    render(<FavoriteColorsCard />)
    const tiles = screen.getAllByTestId('favorite-color')
    expect(tiles.map((tile) => tile.textContent)).toEqual([expect.stringContaining('Violeta'), expect.stringContaining('#3F3F46')])
    expect(tiles[1]!.querySelector('[aria-label="Pouco contraste com o tema escuro"]')).not.toBeNull()
    expect(tiles[0]!.querySelector('[aria-label="Pouco contraste com o tema escuro"]')).toBeNull()
  })

  it('remove só depois de confirmar', () => {
    render(<FavoriteColorsCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Remover Violeta das favoritas' }))
    expect(palette.current.removeFavorite).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }))
    expect(palette.current.removeFavorite).toHaveBeenCalledWith('#A78BFA')
  })

  it('estados de carregamento, erro (tentar novamente) e vazio', () => {
    palette.current = { ...base(), isLoading: true }
    const { rerender } = render(<FavoriteColorsCard />)
    expect(screen.getByTestId('favorite-colors-skeleton')).toBeTruthy()

    palette.current = { ...base(), isError: true }
    rerender(<FavoriteColorsCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(palette.current.refetch).toHaveBeenCalled()

    palette.current = { ...base(), favorites: [] }
    rerender(<FavoriteColorsCard />)
    expect(screen.getByText(/Nenhuma cor favorita/)).toBeTruthy()
  })

  describe('editar favorita', () => {
    /** O resolver Zod valida de forma assíncrona: deixa a validação terminar antes de olhar o botão. */
    const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
    const openEdit = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Editar Violeta nas favoritas' }))
      await settle()
    }
    // Com o seletor (popover modal) aberto, o Radix esconde o diálogo da árvore acessível.
    const saveButton = () => screen.getByRole('button', { name: 'Salvar', hidden: true }) as HTMLButtonElement

    it('abre com nome e cor preenchidos; Salvar só depois de mudar algo', async () => {
      render(<FavoriteColorsCard />)
      await openEdit()
      expect((document.getElementById('favorite-edit-name') as HTMLInputElement).value).toBe('Violeta')
      expect(document.getElementById('favorite-edit-color')!.textContent).toContain('#A78BFA')
      expect(saveButton().disabled).toBe(true)

      fireEvent.change(document.getElementById('favorite-edit-name')!, { target: { value: 'Roxo claro' } })
      await settle()
      expect(saveButton().disabled).toBe(false)
      fireEvent.click(saveButton())
      await waitFor(() => expect(palette.current.updateFavorite).toHaveBeenCalledWith('#A78BFA', { color: '#A78BFA', name: 'Roxo claro' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('cor de outra favorita é bloqueada; cor nova avisa que quem usa a antiga continua com ela', async () => {
      render(<FavoriteColorsCard />)
      await openEdit()
      fireEvent.click(document.getElementById('favorite-edit-color')!)
      fireEvent.click(screen.getByRole('radio', { name: '#3F3F46' }))
      await settle()
      expect(screen.getByText('Esta cor já está nas favoritas')).toBeTruthy()
      expect(saveButton().disabled).toBe(true)

      fireEvent.click(screen.getByRole('radio', { name: 'Verde 500' }))
      await settle()
      expect(saveButton().disabled).toBe(false)
      expect(screen.getByText(/continuam com ela/).textContent).toContain('#A78BFA')
      expect(screen.queryByText('Esta cor já está nas favoritas')).toBeNull()
    })
  })
})
