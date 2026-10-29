/** @vitest-environment happy-dom */

import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ToggleCard } from '@/components/ui/toggle-card'

afterEach(() => cleanup())

function Harness({ disabled, onChange }: { disabled?: boolean; onChange?: (checked: boolean) => void }) {
  const [checked, setChecked] = useState(true)
  return (
    <ToggleCard
      id="ativo"
      checked={checked}
      onCheckedChange={(next) => {
        setChecked(next)
        onChange?.(next)
      }}
      label="Produto ativo"
      description="Desligado, sai das ofertas."
      disabled={disabled}
    />
  )
}

describe('ToggleCard (liga/desliga com Switch)', () => {
  it('usa interruptor e alterna o texto Ativo/Inativo', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const toggle = screen.getByRole('switch', { name: 'Produto ativo' })
    expect(screen.getByTestId('ativo-status').textContent).toBe('Ativo')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(false)
    expect(screen.getByTestId('ativo-status').textContent).toBe('Inativo')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('padrão com borda e fundo; `bare` (dentro de um Card) sem borda nem fundo', () => {
    const { rerender } = render(<ToggleCard id="x" checked onCheckedChange={vi.fn()} label="Opção" description="d" />)
    expect(screen.getByTestId('x-row').classList.contains('border')).toBe(true)
    expect(screen.getByTestId('x-row').classList.contains('bg-muted/40')).toBe(true)
    rerender(<ToggleCard id="x" bare checked onCheckedChange={vi.fn()} label="Opção" description="d" />)
    expect(screen.getByTestId('x-row').classList.contains('border')).toBe(false)
    expect(screen.getByTestId('x-row').classList.contains('bg-muted/40')).toBe(false)
    expect(screen.getByRole('switch', { name: 'Opção' })).toBeTruthy()
  })

  it('desabilitado: o interruptor fica bloqueado', () => {
    render(<Harness disabled />)
    expect(screen.getByRole('switch', { name: 'Produto ativo' }).hasAttribute('disabled')).toBe(true)
  })
})
