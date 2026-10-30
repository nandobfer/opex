/** @vitest-environment happy-dom */

import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/** Filtro Arquivadas de Tarefas como switch "Mostrar" (OPE-100, port do MT-30). */

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/repository-recency/hooks', () => ({ useOwnerRepoRecents: () => ({ recents: [], record: vi.fn() }) }))

import { TaskFiltersBar } from '@/features/tasks/components/TaskFiltersBar'
import { DEFAULT_TASK_FILTERS, type TaskFilters } from '@/features/tasks/filters'

afterEach(() => cleanup())

function Harness({ initial = DEFAULT_TASK_FILTERS, onChange }: { initial?: TaskFilters; onChange?: (filters: TaskFilters) => void }) {
  const [filters, setFilters] = useState(initial)
  return (
    <TaskFiltersBar
      filters={filters}
      setFilters={(next) =>
        setFilters((prev) => {
          const value = typeof next === 'function' ? next(prev) : next
          onChange?.(value)
          return value
        })
      }
      total={0}
      tasks={[]}
      options={undefined}
      columns={[]}
    />
  )
}

// O cartão de filtros de Tarefas começa recolhido: expandir mostra os campos.
const expand = () => fireEvent.click(screen.getByRole('button', { name: 'Expandir filtros' }))
// O `Switch` do projeto é um checkbox estilizado (`role=checkbox`).
const archivedSwitch = () => screen.getByRole('checkbox', { name: 'Mostrar tarefas arquivadas' }) as HTMLInputElement

describe('TaskFiltersBar › Arquivadas', () => {
  it('é um switch "Mostrar", desligado por padrão, e ligar mostra as arquivadas', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    expand()
    expect(archivedSwitch().checked).toBe(false)
    expect(screen.getByText('Mostrar')).toBeTruthy()
    fireEvent.click(archivedSwitch())
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ showArchived: true }))
    expect(archivedSwitch().checked).toBe(true)
  })

  it('não usa mais o botão alternável (aria-pressed) e fica com o fundo do card', () => {
    render(<Harness initial={{ ...DEFAULT_TASK_FILTERS, showArchived: true }} />)
    expand()
    expect(archivedSwitch().checked).toBe(true)
    expect(document.querySelector('[aria-pressed]')).toBeNull()
    const box = archivedSwitch().closest('label')!.parentElement!
    expect(box.classList.contains('bg-transparent')).toBe(true)
    expect(box.classList.contains('h-10')).toBe(true)
  })
})
