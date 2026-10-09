/** @vitest-environment jsdom */

import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OptionTabs } from '@/components/ui/option-tabs'

const OPTIONS = [
  { value: 'pf', label: 'Pessoa física' },
  { value: 'pj', label: 'Pessoa jurídica' },
] as const

function Harness({ onChange = vi.fn(), disabled = false }: { onChange?: (value: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState<'pf' | 'pj'>('pj')
  return (
    <OptionTabs
      aria-label="Tipo de pessoa"
      options={OPTIONS}
      value={value}
      disabled={disabled}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('OptionTabs', () => {
  it('marca a opção ativa com a cor do tema (primary) e troca ao clicar', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const pj = screen.getByRole('radio', { name: 'Pessoa jurídica' })
    expect(pj.getAttribute('aria-checked')).toBe('true')
    expect(pj.classList.contains('bg-primary')).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: 'Pessoa física' }))
    expect(onChange).toHaveBeenCalledWith('pf')
    expect(screen.getByRole('radio', { name: 'Pessoa física' }).getAttribute('aria-checked')).toBe('true')
  })

  it('setas do teclado navegam e selecionam; só a opção marcada entra na tabulação', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const pj = screen.getByRole('radio', { name: 'Pessoa jurídica' })
    expect(pj.getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('radio', { name: 'Pessoa física' }).getAttribute('tabindex')).toBe('-1')
    fireEvent.keyDown(pj, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('pf')
  })

  it('desabilitado não troca a seleção', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} disabled />)
    fireEvent.click(screen.getByRole('radio', { name: 'Pessoa física' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
