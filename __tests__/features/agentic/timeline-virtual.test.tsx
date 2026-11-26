/** @vitest-environment happy-dom */

import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { Timeline } from '@/features/agentic/components/workbench/Timeline'
import type { TimelineItem, TimelineState } from '@/features/agentic/timeline'

/**
 * OPE-188: a Saída da IA de uma mesa grande (milhares de itens) desenha só o que está na tela
 * (TanStack Virtual acima de 50 itens); até 50 itens a lista é inteira, como antes.
 */

const items = (count: number): TimelineItem[] => Array.from({ length: count }, (_, index) => ({ kind: 'notice', key: `n-${index}`, level: 'info', message: `aviso ${index}`, memories: [] }))
const state = (list: TimelineItem[]): TimelineState => ({ items: list, reasoning: false, loaded: true })
const drawn = (container: HTMLElement) => container.querySelectorAll('[data-timeline-item]').length

describe('Timeline (virtualização)', () => {
  it('até 50 itens desenha a lista inteira', () => {
    const { container } = render(<Timeline timeline={state(items(50))} running={false} />)
    expect(drawn(container)).toBe(50)
  })

  it('acima de 50 itens desenha só a janela visível e alcança o último item ao rolar até o fim', () => {
    // O DOM de teste não faz layout: a área visível tem 600 px e cada item mede 72 px.
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 72, width: 300, height: 72, toJSON: () => ({}) })
    const total = 1500
    const { container } = render(<Timeline timeline={state(items(total))} running={false} />)
    const count = drawn(container)
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(100)

    const scroller = container.querySelector('[aria-live="polite"]') as HTMLElement
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 600 })
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => total * 72 })
    let top = 0
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (value: number) => void (top = value) })
    act(() => {
      // Rola até o fim (além da altura total: o virtualizador fica nos últimos itens).
      top = total * 200
      fireEvent.scroll(scroller)
    })
    expect(screen.queryByText(new RegExp(`aviso ${total - 1}$`))).not.toBeNull()
    expect(screen.queryByText(/aviso 0$/)).toBeNull()
    expect(drawn(container)).toBeLessThan(100)
    height.mockRestore()
    rect.mockRestore()
  })
})
