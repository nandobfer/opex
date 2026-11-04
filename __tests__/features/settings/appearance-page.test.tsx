/** @vitest-environment happy-dom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ColorPalette } from '@/features/color-palette/hooks'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

const palette = vi.hoisted(() => ({
  current: {
    favorites: [{ color: '#A78BFA', name: 'Violeta' }],
    isLoading: false,
    isError: false,
    refetch: () => undefined,
    addFavorite: () => undefined,
    removeFavorite: () => undefined,
    updateFavorite: () => undefined,
    isFavorite: () => false,
  } as unknown as ColorPalette,
}))
vi.mock('@/features/color-palette/hooks', () => ({ useColorPalette: () => palette.current }))

const nav = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: nav.redirect, usePathname: () => '/configuracoes/aparencia' }))

import AparenciaPage from '@/app/(app)/configuracoes/aparencia/page'
import ConfiguracoesPage from '@/app/(app)/configuracoes/page'

afterEach(cleanup)

describe('Configurações › Aparência', () => {
  it('/configuracoes/aparencia mostra o cabeçalho Aparência e as cores favoritas', () => {
    render(<AparenciaPage />)
    expect(screen.getByRole('heading', { name: 'Aparência' })).toBeTruthy()
    expect(screen.getByText('Cores favoritas usadas pelas telas')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Cores favoritas' })).toBeTruthy()
    expect(screen.getAllByTestId('favorite-color').map((tile) => tile.textContent)).toEqual([expect.stringContaining('Violeta')])
  })

  it('/configuracoes redireciona para /configuracoes/aparencia', () => {
    ConfiguracoesPage()
    expect(nav.redirect).toHaveBeenCalledWith('/configuracoes/aparencia')
  })
})
