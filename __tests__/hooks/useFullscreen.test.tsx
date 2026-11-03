/** @vitest-environment happy-dom */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `useMaximizedFrame` (a alternativa sem a API) anima com `animate`: controles que também são promise.
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return {
    ...actual,
    animate: vi.fn(() => Object.assign(Promise.resolve(), { stop: vi.fn() })),
  }
})

import { useFullscreen } from '@/hooks/useFullscreen'
import { MAXIMIZED_ATTR } from '@/hooks/useMaximizedFrame'

const doc = document as Document & { fullscreenElement: Element | null }
const setFullscreen = (element: Element | null) => {
  doc.fullscreenElement = element
  document.dispatchEvent(new Event('fullscreenchange'))
}

let element: HTMLElement
let request: ReturnType<typeof vi.fn>

beforeEach(() => {
  element = document.createElement('div')
  document.body.appendChild(element)
  request = vi.fn(async () => undefined)
  Object.defineProperty(element, 'requestFullscreen', { configurable: true, value: request })
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null, writable: true })
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: vi.fn(async () => setFullscreen(null)) })
})
afterEach(() => {
  cleanup()
  element.remove()
})

describe('useFullscreen', () => {
  it('toggle pede tela cheia no próprio elemento e o estado acompanha o fullscreenchange', async () => {
    const { result } = renderHook(() => useFullscreen(element))
    await act(async () => result.current.toggle())
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.contexts[0]).toBe(element)
    expect(result.current.active).toBe(false)
    await act(async () => setFullscreen(element))
    expect(result.current).toMatchObject({ active: true, native: true })
  })

  it('saída pelo navegador (Esc) desliga o estado; toggle em tela cheia chama exitFullscreen', async () => {
    const { result } = renderHook(() => useFullscreen(element))
    await act(async () => setFullscreen(element))
    await act(async () => setFullscreen(null))
    expect(result.current.active).toBe(false)
    await act(async () => setFullscreen(element))
    await act(async () => result.current.toggle())
    expect(document.exitFullscreen).toHaveBeenCalled()
    expect(result.current.active).toBe(false)
  })

  it('tela cheia de outro elemento não conta como a deste', async () => {
    const { result } = renderHook(() => useFullscreen(element))
    await act(async () => setFullscreen(document.createElement('section')))
    expect(result.current.active).toBe(false)
  })

  it('sem a API de tela cheia, maximiza o elemento na área do app e restaura (botão ou Esc)', async () => {
    Object.defineProperty(element, 'requestFullscreen', { configurable: true, value: undefined })
    const { result } = renderHook(() => useFullscreen(element))
    await act(async () => result.current.toggle())
    expect(result.current).toMatchObject({ active: true, native: false })
    expect(element.hasAttribute(MAXIMIZED_ATTR)).toBe(true)
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(result.current.active).toBe(false)
    expect(element.hasAttribute(MAXIMIZED_ATTR)).toBe(false)
  })

  it('pedido recusado pelo navegador cai no maximizado', async () => {
    request.mockRejectedValueOnce(new Error('denied'))
    const { result } = renderHook(() => useFullscreen(element))
    await act(async () => result.current.toggle())
    expect(result.current).toMatchObject({ active: true, native: false })
  })

  it('desmontar em tela cheia sai dela', async () => {
    const { unmount } = renderHook(() => useFullscreen(element))
    await act(async () => setFullscreen(element))
    unmount()
    expect(document.exitFullscreen).toHaveBeenCalled()
  })
})
