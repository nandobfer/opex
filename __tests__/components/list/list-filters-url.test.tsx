/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { urlFilterCodecs, useUrlFilters, type UrlFilterSchema } from '@/hooks/useUrlFilters'
import { FilterGroup } from '@/components/list/FilterGroup'
import { ListFilters, SEARCH_DEBOUNCE_MS } from '@/components/list/ListFilters'

/** Lista genérica: card FILTROS + ListFilters com o estado na URL (useUrlFilters). */

interface Filters {
  busca: string
  status: 'todas' | 'abertas' | 'fechadas'
}

const DEFAULTS: Filters = { busca: '', status: 'todas' }
const SCHEMA: UrlFilterSchema<Filters> = {
  busca: urlFilterCodecs.string(),
  status: urlFilterCodecs.string(['todas', 'abertas', 'fechadas'] as const),
}

function Harness() {
  const [values, setValues, reset] = useUrlFilters(DEFAULTS, SCHEMA)
  return (
    <ListFilters
      total={4}
      onClear={reset}
      search={{ value: values.busca, onChange: (busca) => setValues((prev) => ({ ...prev, busca })), placeholder: 'Título...' }}
    >
      <FilterGroup label="Status" className="flex-1 min-w-[150px]">
        <button type="button" onClick={() => setValues((prev) => ({ ...prev, status: 'abertas' }))}>
          Abertas
        </button>
      </FilterGroup>
    </ListFilters>
  )
}

beforeEach(() => window.history.replaceState(null, '', '/tarefas'))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('filtros de lista com estado na URL', () => {
  it('renderiza o card FILTROS com contador, busca "Busca" e grupos rotulados', () => {
    render(<Harness />)
    expect(screen.getByText('Filtros')).toBeTruthy()
    expect(screen.getByText('4 REGISTROS')).toBeTruthy()
    expect(screen.getByText('Status')).toBeTruthy()
    expect(screen.getByLabelText('Busca')).toBeTruthy()
  })

  it('busca aplica na URL após o debounce e "Limpar filtros" zera tudo', () => {
    vi.useFakeTimers()
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Busca'), { target: { value: 'deploy' } })
    expect(window.location.search).toBe('')
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))
    expect(window.location.search).toContain('busca=deploy')
    fireEvent.click(screen.getByRole('button', { name: 'Abertas' }))
    expect(window.location.search).toContain('status=abertas')
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(window.location.search).toBe('')
  })

  it('lê os filtros já presentes na URL e ignora valores fora da lista', () => {
    window.history.replaceState(null, '', '/tarefas?busca=api&status=invalido')
    render(<Harness />)
    expect((screen.getByLabelText('Busca') as HTMLInputElement).value).toBe('api')
  })
})
