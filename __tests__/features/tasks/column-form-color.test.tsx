/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

const palette = vi.hoisted(() => ({ addFavorite: vi.fn() }))
vi.mock('@/features/color-palette/hooks', () => ({
  useColorPalette: () => ({
    favorites: [{ color: '#8000FF', name: 'Roxo Opex' }],
    addFavorite: palette.addFavorite,
  }),
}))

import { ColumnFormDialog } from '@/features/tasks/components/ColumnFormDialog'

afterEach(cleanup)

describe('ColumnFormDialog: cor pelo seletor central de cores', () => {
  it('oferece as favoritas compartilhadas e envia o hex escolhido', async () => {
    const onSubmit = vi.fn()
    render(<ColumnFormDialog open column={null} submitting={false} onSubmit={onSubmit} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Aguardando cliente' } })
    fireEvent.click(document.getElementById('column-color')!)
    fireEvent.click(screen.getByRole('radio', { name: 'Roxo Opex' }))
    expect(document.getElementById('column-color')!.textContent).toContain('Roxo Opex')

    expect((screen.getByRole('button', { name: /já está nas favoritas/i }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: 'Ciano 500' }))
    fireEvent.click(screen.getByRole('button', { name: /adicionar às favoritas/i }))
    expect(palette.addFavorite).toHaveBeenCalledWith({ color: '#06B6D4' })

    // Esc fecha só o seletor (camada de cima), não o diálogo da coluna.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('radio', { name: 'Ciano 500' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Criar coluna' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ name: 'Aguardando cliente', color: '#06B6D4' })
  })

  it('coluna salva com o nome antigo da paleta abre com o hex equivalente e salva em hex', async () => {
    const onSubmit = vi.fn()
    const column = { key: 'col-1', name: 'Revisar', color: 'violet', icon: 'star' as const, description: null, wipLimit: null }
    render(<ColumnFormDialog open column={column} submitting={false} onSubmit={onSubmit} onClose={vi.fn()} />)
    expect(document.getElementById('column-color')!.textContent).toContain('#A78BFA')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Revisão' } })
    const save = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement
    await waitFor(() => expect(save.disabled).toBe(false))
    fireEvent.click(save)
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ name: 'Revisão', color: '#A78BFA' })
  })
})
