/** @vitest-environment jsdom */

import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { FilterGroup } from '@/components/list/FilterGroup'
import { ListFilters, type ActiveFilterChip } from '@/components/list/ListFilters'

/** `ListFilters` recolhível: resumo com chips, expandir pelo cartão e recolher pelo ⌃. */

function Harness({ initial = ['abertas'] }: { initial?: string[] }) {
  const [status, setStatus] = useState<string[]>(initial)
  const chips: ActiveFilterChip[] = status.map((value) => ({ key: value, label: `Status: ${value}`, onRemove: () => setStatus((prev) => prev.filter((item) => item !== value)) }))
  return (
    <ListFilters collapsible chips={chips} total={7} onClear={() => setStatus([])}>
      <FilterGroup label="Status" className="flex-1">
        <button type="button">Campo de status</button>
      </FilterGroup>
    </ListFilters>
  )
}

afterEach(cleanup)

describe('ListFilters recolhível', () => {
  it('começa recolhido: só o resumo (chips, total, limpar, expandir), sem os campos', () => {
    render(<Harness />)
    expect(screen.queryByText('Campo de status')).toBeNull()
    expect(screen.getByTestId('filter-chip-abertas').textContent).toContain('Status: abertas')
    expect(screen.getByText('7 REGISTROS')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expandir filtros', expanded: false })).toBeTruthy()
  })

  it('clicar no cartão expande; o ⌃ após o total recolhe de volta', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('list-filters-header'))
    expect(screen.getByText('Campo de status')).toBeTruthy()
    expect(screen.queryByTestId('filter-chip-abertas')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Recolher filtros' }))
    expect(screen.queryByText('Campo de status')).toBeNull()
    expect(screen.getByTestId('filter-chip-abertas')).toBeTruthy()
  })

  it('× do chip remove só aquele filtro, sem expandir', () => {
    render(<Harness initial={['abertas', 'fechadas']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Status: abertas' }))
    expect(screen.queryByTestId('filter-chip-abertas')).toBeNull()
    expect(screen.getByTestId('filter-chip-fechadas')).toBeTruthy()
    expect(screen.queryByText('Campo de status')).toBeNull()
  })

  it('sem filtros ativos: mensagem vazia e sem o botão limpar; limpar zera tudo', async () => {
    const { unmount } = render(<Harness />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' })))
    expect(screen.getByText('Nenhum filtro ativo · clique para filtrar')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
    expect(screen.queryByText('Campo de status')).toBeNull()
    unmount()
  })

  it('sem `collapsible` continua sempre aberto (comportamento anterior)', () => {
    render(
      <ListFilters onClear={() => {}}>
        <span>campo</span>
      </ListFilters>,
    )
    expect(screen.getByText('campo')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Expandir filtros|Recolher filtros/ })).toBeNull()
  })
})
