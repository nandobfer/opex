/** @vitest-environment happy-dom */

import { useRef } from 'react'
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveHorizontalWheel, useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll'

afterEach(cleanup)

const base = { deltaX: 0, deltaY: 120, deltaMode: 0, shiftKey: false, scrollLeft: 0, scrollWidth: 600, clientWidth: 200 }

describe('resolveHorizontalWheel', () => {
  it('converte a roda vertical em rolagem horizontal quando a faixa tem overflow', () => {
    expect(resolveHorizontalWheel(base)).toBe(120)
  })

  it('não converte o evento com Shift: o navegador já rola na horizontal', () => {
    expect(resolveHorizontalWheel({ ...base, shiftKey: true })).toBeNull()
  })

  it('não sequestra o zoom do navegador nem a pinça do trackpad (Ctrl + roda)', () => {
    expect(resolveHorizontalWheel({ ...base, ctrlKey: true })).toBeNull()
  })

  it('não sequestra o gesto horizontal dominante do trackpad', () => {
    expect(resolveHorizontalWheel({ ...base, deltaX: 90, deltaY: 10 })).toBeNull()
    expect(resolveHorizontalWheel({ ...base, deltaX: -90, deltaY: -10 })).toBeNull()
  })

  it('não converte nada quando as abas cabem na faixa (a roda segue rolando a página)', () => {
    expect(resolveHorizontalWheel({ ...base, scrollWidth: 200, clientWidth: 200 })).toBeNull()
  })

  it('devolve a roda para a página no início e no fim da faixa', () => {
    expect(resolveHorizontalWheel({ ...base, deltaY: -120, scrollLeft: 0 })).toBeNull()
    expect(resolveHorizontalWheel({ ...base, deltaY: 120, scrollLeft: 400 })).toBeNull()
  })

  it('converte linha e página para pixels', () => {
    expect(resolveHorizontalWheel({ ...base, deltaMode: 1, deltaY: 3 })).toBe(48)
    expect(resolveHorizontalWheel({ ...base, deltaMode: 2, deltaY: 1 })).toBe(200)
  })
})

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  useHorizontalWheelScroll(ref)
  return <div ref={ref} data-testid="faixa" />
}

function setupStrip({ scrollWidth = 600, clientWidth = 200 } = {}) {
  const { unmount } = render(<Harness />)
  const strip = screen.getByTestId('faixa')
  let scrollLeft = 0
  Object.defineProperties(strip, {
    scrollWidth: { configurable: true, value: scrollWidth },
    clientWidth: { configurable: true, value: clientWidth },
    scrollLeft: {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value
      },
    },
  })
  return { strip, unmount, scrollLeft: () => scrollLeft }
}

describe('useHorizontalWheelScroll', () => {
  it('rola a faixa com a roda vertical e impede a rolagem vertical da página', () => {
    const { strip, scrollLeft } = setupStrip()
    expect(fireEvent.wheel(strip, { deltaY: 100 })).toBe(false)
    expect(scrollLeft()).toBe(100)
  })

  it('mantém a rolagem nativa quando Shift está pressionado', () => {
    const { strip, scrollLeft } = setupStrip()
    // O happy-dom não preenche `shiftKey` no WheelEvent: a propriedade é fixada no evento.
    const event = createEvent.wheel(strip, { deltaY: 100 }) as WheelEvent
    Object.defineProperty(event, 'shiftKey', { value: true })
    expect(fireEvent(strip, event)).toBe(true)
    expect(scrollLeft()).toBe(0)
  })

  it('não bloqueia a página quando as abas cabem na faixa', () => {
    const { strip, scrollLeft } = setupStrip({ scrollWidth: 200, clientWidth: 200 })
    expect(fireEvent.wheel(strip, { deltaY: 100 })).toBe(true)
    expect(scrollLeft()).toBe(0)
  })

  it('remove o ouvinte quando a faixa desmonta', () => {
    const { strip, unmount, scrollLeft } = setupStrip()
    unmount()
    expect(fireEvent.wheel(strip, { deltaY: 100 })).toBe(true)
    expect(scrollLeft()).toBe(0)
  })
})
