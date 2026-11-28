/** @vitest-environment happy-dom */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTickingNow } from '@/hooks/useTickingNow'

/** Relógio por useSyncExternalStore: null no servidor, redesenho por tick e intervalo cancelado. */

function Clock({ interval = 250, active = true }: { interval?: number; active?: boolean }) {
  const now = useTickingNow(interval, active)
  return <span data-testid="now">{now === null ? 'pendente' : String(now)}</span>
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useTickingNow', () => {
  it('no servidor o snapshot é null (o primeiro render não depende do relógio)', () => {
    expect(renderToString(<Clock />)).toContain('pendente')
  })

  it('um tick atrasado mostra o instante real, não um valor somado', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-26T15:00:00Z'))
    const { getByTestId } = render(<Clock />)
    expect(getByTestId('now').textContent).toBe(String(Date.parse('2026-11-26T15:00:00Z')))
    // O relógio anda 10 min sem disparar o intervalo; um único tick depois já mostra o tempo real.
    vi.setSystemTime(new Date('2026-11-26T15:10:00Z'))
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(getByTestId('now').textContent).toBe(String(Date.parse('2026-11-26T15:10:00.250Z')))
  })

  it('inativo devolve null e não liga intervalo; desmontar cancela o intervalo', () => {
    vi.useFakeTimers()
    const inactive = render(<Clock active={false} />)
    expect(inactive.getByTestId('now').textContent).toBe('pendente')
    expect(vi.getTimerCount()).toBe(0)
    inactive.unmount()
    const active = render(<Clock interval={500} />)
    expect(vi.getTimerCount()).toBe(1)
    active.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
