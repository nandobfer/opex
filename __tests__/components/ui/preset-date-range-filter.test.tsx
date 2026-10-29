/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/** Cópia adaptada do teste do Smart Desk (`preset-date-range-filter.test.tsx`). */

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const calendarMock = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))
vi.mock('@/components/ui/calendar', () => ({
  Calendar: (props: Record<string, unknown>) => {
    calendarMock.props = props
    const day = (label: string, date: Date) => (
      <button type="button" onClick={() => (props.onDayClick as (d: Date) => void)(date)}>
        {label}
      </button>
    )
    return (
      <div>
        {day('dia 05', new Date(2026, 5, 5))}
        {day('dia 10', new Date(2026, 5, 10))}
        {day('dia 15', new Date(2026, 5, 15))}
      </div>
    )
  },
}))

import { DATE_PRESET, lastDaysPreset, PresetDateRangeFilter, type DateRangeValue } from '@/components/ui/preset-date-range-filter'
import { DateRangeCalendar } from '@/components/ui/date-range-calendar'

function Harness({ onChange, presets }: { onChange: (value: DateRangeValue) => void; presets?: React.ComponentProps<typeof PresetDateRangeFilter>['presets'] }) {
  const [value, setValue] = React.useState({ startDate: '', endDate: '' })
  return (
    <PresetDateRangeFilter
      startDate={value.startDate}
      endDate={value.endDate}
      presets={presets}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 5, 11, 10)) // 2026-06-11
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('PresetDateRangeFilter', () => {
  it('atalhos padrão: Hoje, Última semana e Último mês', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Hoje/ }))
    expect(onChange).toHaveBeenLastCalledWith({ startDate: '2026-06-11', endDate: '2026-06-11' })
    expect(screen.getByRole('button', { name: /Hoje/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Última semana/ }))
    expect(onChange).toHaveBeenLastCalledWith({ startDate: '2026-06-04', endDate: '2026-06-11' })
    fireEvent.click(screen.getByRole('button', { name: /Último mês/ }))
    expect(onChange).toHaveBeenLastCalledWith({ startDate: '2026-05-11', endDate: '2026-06-11' })
  })

  it('atalhos personalizáveis por tela; [] esconde a seção', () => {
    const onChange = vi.fn()
    const { unmount } = render(<Harness onChange={onChange} presets={[DATE_PRESET.today, lastDaysPreset(90)]} />)
    expect(screen.queryByRole('button', { name: /Última semana/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Últimos 90 dias/ }))
    expect(onChange).toHaveBeenLastCalledWith({ startDate: '2026-03-13', endDate: '2026-06-11' })
    unmount()
    render(<Harness onChange={onChange} presets={[]} />)
    expect(screen.queryByText('Atalhos')).toBeNull()
  })

  it('mostra o período formatado no botão e permite limpar', () => {
    const onChange = vi.fn()
    render(<PresetDateRangeFilter startDate="2026-06-10" endDate="2026-06-15" onChange={onChange} />)
    expect(screen.getAllByText('10/06/2026 - 15/06/2026').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Limpar período/ }))
    expect(onChange).toHaveBeenLastCalledWith({ startDate: '', endDate: '' })
  })
})

describe('DateRangeCalendar (calendário de intervalo)', () => {
  function CalendarHarness({ onChange }: { onChange: (value: DateRangeValue) => void }) {
    const [value, setValue] = React.useState({ startDate: '', endDate: '' })
    return (
      <DateRangeCalendar
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      />
    )
  }

  it('1º clique marca o início, 2º o fim; clicar antes do início inverte as pontas', () => {
    const onChange = vi.fn()
    render(<CalendarHarness onChange={onChange} />)
    expect(calendarMock.props?.mode).toBe('range')
    fireEvent.click(screen.getByRole('button', { name: 'dia 10' }))
    expect(onChange).toHaveBeenLastCalledWith({ startDate: '2026-06-10', endDate: '' })
    expect(screen.getByText('Desde 10/06/2026')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'dia 05' }))
    expect(onChange).toHaveBeenLastCalledWith({ startDate: '2026-06-05', endDate: '2026-06-10' })
    fireEvent.click(screen.getByRole('button', { name: 'dia 15' }))
    expect(onChange).toHaveBeenLastCalledWith({ startDate: '2026-06-15', endDate: '' })
  })
})
