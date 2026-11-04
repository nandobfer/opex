/** @vitest-environment happy-dom */

import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('framer-motion', async () => (await import('../helpers/framer-motion')).framerMotionMock())

import { ColorPicker, type FavoriteColor } from '@/components/ui/color-picker'

const FAVORITES: FavoriteColor[] = [
  { color: '#A78BFA', name: 'Violeta' },
  { color: '#8000FF', name: null },
]

function Harness({ initial = null, allowNone = false, onChange = vi.fn(), onAddFavorite }: { initial?: string | null; allowNone?: boolean; onChange?: (color: string | null) => void; onAddFavorite?: (color: string) => void }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <ColorPicker
      id="cor"
      value={value}
      favorites={FAVORITES}
      allowNone={allowNone}
      onAddFavorite={onAddFavorite}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

const open = () => fireEvent.click(document.getElementById('cor')!)
const hexInput = () => document.getElementById('cor-hex') as HTMLInputElement

afterEach(cleanup)

describe('ColorPicker', () => {
  it('mostra o nome da favorita escolhida e seleciona favoritas e a grade com um clique', () => {
    const onChange = vi.fn()
    render(<Harness initial="#A78BFA" onChange={onChange} />)
    expect(document.getElementById('cor')!.textContent).toContain('Violeta')
    open()
    expect(screen.getByRole('radio', { name: 'Violeta' }).getAttribute('aria-checked')).toBe('true')
    // Favorita sem nome aparece pelo hex.
    fireEvent.click(screen.getByRole('radio', { name: '#8000FF' }))
    expect(onChange).toHaveBeenLastCalledWith('#8000FF')
    fireEvent.click(screen.getByRole('radio', { name: 'Verde 500' }))
    expect(onChange).toHaveBeenLastCalledWith('#10B981')
  })

  it('aplica hex válido digitado e rejeita o inválido com mensagem', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    open()
    fireEvent.change(hexInput(), { target: { value: '#12ab3' } })
    fireEvent.keyDown(hexInput(), { key: 'Enter' })
    expect(screen.getByRole('alert').textContent).toContain('#RRGGBB')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(hexInput(), { target: { value: '#12ab34' } })
    expect(onChange).toHaveBeenCalledWith('#12AB34')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('adiciona a cor atual às favoritas; desligado quando já é favorita', () => {
    const onAddFavorite = vi.fn()
    render(<Harness initial="#A78BFA" onAddFavorite={onAddFavorite} />)
    open()
    const button = screen.getByRole('button', { name: /já está nas favoritas/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Rosa 500' }))
    fireEvent.click(screen.getByRole('button', { name: /adicionar às favoritas/i }))
    expect(onAddFavorite).toHaveBeenCalledWith('#F43F5E')
  })

  it('"Sem cor" só com allowNone; avisa cor de pouco contraste', () => {
    const onChange = vi.fn()
    const { unmount } = render(<Harness initial="#3F3F46" onChange={onChange} />)
    expect(screen.getByTestId('low-contrast-warning').textContent).toContain('Pouco contraste')
    open()
    expect(screen.queryByRole('radio', { name: 'Sem cor' })).toBeNull()
    unmount()

    render(<Harness initial="#A78BFA" allowNone onChange={onChange} />)
    expect(screen.queryByTestId('low-contrast-warning')).toBeNull()
    open()
    fireEvent.click(screen.getByRole('radio', { name: 'Sem cor' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
