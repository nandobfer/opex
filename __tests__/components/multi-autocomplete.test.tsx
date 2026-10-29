/** @vitest-environment happy-dom */

import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { MultiAutocomplete, type AutocompleteOption } from '@/components/ui/multi-autocomplete'

const OPTIONS: AutocompleteOption[] = [
  { value: 'f1', label: 'Uberlândia Centro', group: 'MG' },
  { value: 'f2', label: 'Uberaba', group: 'MG' },
  { value: 'f3', label: 'Rio Verde', group: 'GO' },
]

function Harness({ initial = [] as string[], onChange = vi.fn(), disabled = false }) {
  const [value, setValue] = useState<string[]>(initial)
  return (
    <MultiAutocomplete
      aria-label="Filiais"
      options={OPTIONS}
      value={value}
      selectableGroups
      disabled={disabled}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

afterEach(() => cleanup())

describe('MultiAutocomplete', () => {
  it('filtra tolerando erro de digitação e adiciona com Enter como chip removível', () => {
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'Filiais' })
    fireEvent.change(input, { target: { value: 'rio verd' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('Rio Verde')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByRole('button', { name: 'Remover Rio Verde' })).toBeTruthy()
    expect((input as HTMLInputElement).value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Remover Rio Verde' }))
    expect(screen.queryByRole('button', { name: 'Remover Rio Verde' })).toBeNull()
  })

  it('clique alterna a opção, "Selecionar todas" inclui o grupo e Backspace remove o último', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByRole('combobox', { name: 'Filiais' })
    fireEvent.focus(input)
    fireEvent.click(screen.getAllByRole('button', { name: 'Selecionar todas' })[0]!)
    expect(onChange).toHaveBeenLastCalledWith(['f1', 'f2'])

    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(onChange).toHaveBeenLastCalledWith(['f1'])

    fireEvent.click(screen.getByRole('option', { name: /Uberlândia Centro/ }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('desabilitado não permite digitar nem remover', () => {
    render(<Harness initial={['f3']} disabled />)
    expect((screen.getByRole('combobox', { name: 'Filiais' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Rio Verde')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remover Rio Verde' })).toBeNull()
  })
})
