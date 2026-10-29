/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { Timeline } from '@/features/agentic/components/workbench/Timeline'
import type { TimelineItem, TimelineState } from '@/features/agentic/timeline'

const text = (key: string, value: string): TimelineItem => ({ kind: 'text', key, text: value })

const turn = (key: string, ended: boolean): TimelineItem => ({
  kind: 'turn',
  key,
  stage: 'planning',
  title: 'Planejando',
  agent: 'build',
  model: 'openai/gpt',
  ts: '2026-10-09T12:00:00.000Z',
  end: ended ? { outcome: 'succeeded', message: null, durationMs: 60_000, costUsd: 0.01 } : null,
})

const state = (items: TimelineItem[], patch: Partial<TimelineState> = {}): TimelineState => ({ items, reasoning: false, loaded: true, ...patch })

/**
 * O DOM de teste não faz layout: define as métricas de rolagem no container e devolve um medidor. O
 * `scrollHeight` é mutável para simular o conteúdo crescendo durante o stream.
 */
function stubLayout(element: HTMLElement, initial: { scrollHeight: number; clientHeight: number }) {
  let scrollTop = 0
  const box = { ...initial }
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => box.scrollHeight })
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => box.clientHeight })
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value
    },
  })
  return {
    get scrollTop() {
      return scrollTop
    },
    set scrollTop(value: number) {
      scrollTop = value
    },
    set scrollHeight(value: number) {
      box.scrollHeight = value
    },
  }
}

const scrollContainer = (container: HTMLElement): HTMLElement => container.querySelector('[aria-live="polite"]') as HTMLElement
const toBottomButton = () => screen.queryByRole('button', { name: 'Ir para o final' })

beforeEach(() => vi.clearAllMocks())

describe('Timeline (scroll)', () => {
  it('acompanha o fim mesmo quando um item do meio cresce (fim de turno)', () => {
    // Regressão: o `turn-end` atualiza um item do meio — a quantidade de itens e o último item
    // não mudam, então a heurística antiga não rolava.
    const { container, rerender } = render(<Timeline timeline={state([turn('t1', false), text('x1', 'ok')])} running={false} />)
    const layout = stubLayout(scrollContainer(container), { scrollHeight: 1000, clientHeight: 200 })
    layout.scrollHeight = 1200

    rerender(<Timeline timeline={state([turn('t1', true), text('x1', 'ok')])} running={false} />)

    expect(layout.scrollTop).toBe(1200)
  })

  it('acompanha o texto do agente chegando em streaming', () => {
    const { container, rerender } = render(<Timeline timeline={state([text('x1', 'a')])} running />)
    const layout = stubLayout(scrollContainer(container), { scrollHeight: 1000, clientHeight: 200 })
    layout.scrollHeight = 1100

    rerender(<Timeline timeline={state([text('x1', 'abc')])} running />)

    expect(layout.scrollTop).toBe(1100)
  })

  it('para de acompanhar quando o usuário rola para cima e mostra o botão', () => {
    const { container, rerender } = render(<Timeline timeline={state([text('x1', 'a')])} running />)
    const layout = stubLayout(scrollContainer(container), { scrollHeight: 1000, clientHeight: 200 })

    fireEvent.scroll(scrollContainer(container))
    expect(toBottomButton()).not.toBeNull()

    layout.scrollHeight = 1400
    rerender(<Timeline timeline={state([text('x1', 'a muito mais texto')])} running />)

    expect(layout.scrollTop).toBe(0)
    expect(toBottomButton()).not.toBeNull()
  })

  it('o botão volta ao fim e retoma o acompanhamento', () => {
    const { container, rerender } = render(<Timeline timeline={state([text('x1', 'a')])} running />)
    const layout = stubLayout(scrollContainer(container), { scrollHeight: 1000, clientHeight: 200 })
    fireEvent.scroll(scrollContainer(container))

    fireEvent.click(toBottomButton()!)
    expect(layout.scrollTop).toBe(1000)
    expect(toBottomButton()).toBeNull()

    layout.scrollHeight = 1300
    rerender(<Timeline timeline={state([text('x1', 'mais texto ainda')])} running />)
    expect(layout.scrollTop).toBe(1300)
  })

  it('voltar para perto do fim esconde o botão (limiar de 80px)', () => {
    const { container } = render(<Timeline timeline={state([text('x1', 'a')])} running />)
    const element = scrollContainer(container)
    const layout = stubLayout(element, { scrollHeight: 1000, clientHeight: 200 })

    fireEvent.scroll(element)
    expect(toBottomButton()).not.toBeNull()

    layout.scrollTop = 1000 - 200 - 10
    fireEvent.scroll(element)
    expect(toBottomButton()).toBeNull()
  })
})
