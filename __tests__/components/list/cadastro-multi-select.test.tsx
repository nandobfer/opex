/** @vitest-environment jsdom */

import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CadastroMultiSelect } from '@/components/list/CadastroMultiSelect'

const OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'development', label: 'Desenvolvimento' },
  { value: 'validation', label: 'Validação' },
]

afterEach(() => cleanup())

function Harness({ initial, onSelect, selectAllLabel }: { initial: string[]; onSelect?: (values: string[]) => void; selectAllLabel?: string }) {
  const [selected, setSelected] = useState(initial)
  return (
    <CadastroMultiSelect
      placeholder="Colunas"
      options={OPTIONS}
      selected={selected}
      onSelect={(values) => {
        onSelect?.(values)
        setSelected(values)
      }}
      selectAllLabel={selectAllLabel}
    />
  )
}

const open = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }))
const selectAll = () => screen.getByRole('checkbox', { name: 'Todos' }) as HTMLInputElement

describe('CadastroMultiSelect com "Todos"', () => {
  it('marca todas as opções quando só parte está escolhida (marcação parcial)', () => {
    const onSelect = vi.fn()
    render(<Harness initial={['development']} onSelect={onSelect} selectAllLabel="Todos" />)
    open(/Desenvolvimento/)
    expect(selectAll().checked).toBe(false)
    expect(selectAll().getAttribute('aria-checked')).toBe('mixed')

    fireEvent.click(screen.getByText('Todos'))
    expect(onSelect).toHaveBeenLastCalledWith(['backlog', 'development', 'validation'])
    expect(selectAll().checked).toBe(true)
    // Todas escolhidas: o gatilho mostra "Todos".
    expect(screen.getByRole('button', { name: /Todos/ })).toBeTruthy()
  })

  it('desmarca todas quando todas estão escolhidas', () => {
    const onSelect = vi.fn()
    render(<Harness initial={['backlog', 'development', 'validation']} onSelect={onSelect} selectAllLabel="Todos" />)
    open(/Todos/)
    fireEvent.click(screen.getByText('Todos', { selector: 'div' }))
    expect(onSelect).toHaveBeenLastCalledWith([])
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeTruthy()
  })

  it('sem o rótulo, não oferece a opção "Todos"', () => {
    render(<Harness initial={[]} />)
    open('Colunas')
    expect(screen.queryByRole('checkbox', { name: 'Todos' })).toBeNull()
    expect(screen.getByText('Backlog')).toBeTruthy()
  })
})
