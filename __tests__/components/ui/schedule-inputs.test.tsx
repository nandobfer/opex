/** @vitest-environment happy-dom */

import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { Slider } from '@/components/ui/slider'
import { TimeSlotList, buildTimeSlots } from '@/components/ui/time-slot-list'

afterEach(() => cleanup())

describe('TimeSlotList', () => {
  it('gera horários de 30 em 30 min dentro do mínimo e máximo', () => {
    expect(buildTimeSlots('08:00', '10:00', 30)).toEqual(['08:00', '08:30', '09:00', '09:30', '10:00'])
  })

  it('marca o escolhido, desabilita os indisponíveis e navega pelo teclado', () => {
    const onChange = vi.fn()
    render(<TimeSlotList aria-label="Fim" value="09:00" onChange={onChange} min="08:00" max="10:00" isDisabled={(slot) => slot <= '08:30'} />)
    expect(screen.getByRole('option', { name: '09:00' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: '08:30' }).hasAttribute('disabled')).toBe(true)
    fireEvent.keyDown(screen.getByRole('option', { name: '09:00' }), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('09:30')
    fireEvent.keyDown(screen.getByRole('option', { name: '09:00' }), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('09:00')
    fireEvent.click(screen.getByRole('option', { name: '08:30' }))
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})

describe('Slider', () => {
  function Harness({ initial = 8 }: { initial?: number }) {
    const [value, setValue] = useState(initial)
    return (
      <>
        <Slider aria-label="Velocidade" value={value} onChange={setValue} min={2} max={20} marks={[{ value: 2 }, { value: 20 }]} formatValue={(v) => `${v} por minuto`} />
        <output data-testid="value">{value}</output>
      </>
    )
  }

  it('expõe valor acessível e muda pelo teclado e pelas marcas', () => {
    render(<Harness />)
    const thumb = screen.getByRole('slider', { name: 'Velocidade' })
    expect(thumb.getAttribute('aria-valuenow')).toBe('8')
    expect(thumb.getAttribute('aria-valuetext')).toBe('8 por minuto')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    expect(screen.getByTestId('value').textContent).toBe('9')
    fireEvent.keyDown(thumb, { key: 'End' })
    expect(screen.getByTestId('value').textContent).toBe('20')
    fireEvent.click(screen.getByText('2'))
    expect(screen.getByTestId('value').textContent).toBe('2')
  })
})
