/** @vitest-environment jsdom */

import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { ChipInput } from '@/components/ui/chip-input'

function Harness({ onChange = vi.fn(), suggestions = [] as Array<{ value: string; label: string }> }) {
  const [value, setValue] = useState<string[]>([])
  return (
    <ChipInput
      aria-label="Cidades"
      value={value}
      suggestions={suggestions}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

afterEach(() => cleanup())

describe('ChipInput', () => {
  it('Enter e o botão Adicionar criam chips; repetido sem acento/caixa é ignorado', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByRole('combobox', { name: 'Cidades' })

    fireEvent.change(input, { target: { value: 'Uberlândia' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'Rio Verde' } })
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }))
    expect(onChange).toHaveBeenLastCalledWith(['Uberlândia', 'Rio Verde'])

    fireEvent.change(input, { target: { value: 'uberlandia' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Remover Uberlândia' }))
    expect(onChange).toHaveBeenLastCalledWith(['Rio Verde'])
  })

  it('colar uma lista separada por vírgula/ponto e vírgula adiciona várias cidades', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.paste(screen.getByRole('combobox', { name: 'Cidades' }), { clipboardData: { getData: () => 'Jataí, Rio Verde; Catalão' } })
    expect(onChange).toHaveBeenLastCalledWith(['Jataí', 'Rio Verde', 'Catalão'])
  })

  it('sugestão escolhida pelo teclado é adicionada', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} suggestions={[{ value: 'Uberaba', label: 'Uberaba — MG' }]} />)
    const input = screen.getByRole('combobox', { name: 'Cidades' })
    fireEvent.change(input, { target: { value: 'uber' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(['Uberaba'])
  })
})
