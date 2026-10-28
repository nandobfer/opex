/** @vitest-environment happy-dom */

import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { PrWatchCountdown, formatRemaining } from '@/features/agentic/components/workbench/PrWatchCountdown'
import { PrWatchItem } from '@/features/agentic/components/workbench/PrWatchItem'
import { Timeline } from '@/features/agentic/components/workbench/Timeline'
import type { TimelineItem } from '@/features/agentic/timeline'

type PrWatchTimelineItem = Extract<TimelineItem, { kind: 'pr-watch' }>

const ts = '2026-10-16T12:00:00.000Z'
const check = (checkId: string, patch: Partial<PrWatchTimelineItem> = {}): PrWatchTimelineItem => ({
  kind: 'pr-watch',
  key: `prw-${checkId}`,
  checkId,
  prNumber: 7,
  startedAt: ts,
  steps: [
    { ts, level: 'info', text: 'Consultando o PR #7 no GitHub…' },
    { ts, level: 'success', text: 'Sem conflito de merge' },
  ],
  outcome: 'idle',
  summary: 'Nada a fazer',
  nextCheckAt: null,
  ...patch,
})

afterEach(() => vi.useRealTimers())

describe('PrWatchItem', () => {
  it('verificação mais recente aberta com os passos; clicar recolhe', () => {
    render(<PrWatchItem item={check('a')} latest />)
    expect(screen.getByText('Verificação do PR #7')).toBeTruthy()
    expect(screen.getByText('Nada a fazer')).toBeTruthy()
    expect(screen.getByText('Sem conflito de merge')).toBeTruthy()
    const toggle = screen.getByRole('button', { expanded: true })
    fireEvent.click(toggle)
    expect(screen.queryByText('Sem conflito de merge')).toBeNull()
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy()
  })

  it('verificação antiga fica recolhida e abre com um clique', () => {
    render(<PrWatchItem item={check('b', { outcome: 'action', summary: 'Pedido de mudança → replanejando' })} />)
    expect(screen.getByText('Pedido de mudança → replanejando')).toBeTruthy()
    expect(screen.queryByText('Consultando o PR #7 no GitHub…')).toBeNull()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Consultando o PR #7 no GitHub…')).toBeTruthy()
  })

  it('em andamento: aberta e "verificando…"', () => {
    render(<PrWatchItem item={check('c', { outcome: null, summary: null })} />)
    expect(screen.getByText(/verificando…/)).toBeTruthy()
    expect(screen.getByText('Sem conflito de merge')).toBeTruthy()
  })
})

describe('PrWatchCountdown', () => {
  it('formatRemaining em m:ss, sem negativo', () => {
    expect(formatRemaining(84_000)).toBe('1:24')
    expect(formatRemaining(500)).toBe('0:01')
    expect(formatRemaining(-5_000)).toBe('0:00')
  })

  it('conta até a próxima verificação e, ao zerar, mostra "em instantes"', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-16T12:00:00.000Z'))
    render(<PrWatchCountdown enabled checking={false} nextCheckAt="2026-10-16T12:00:03.000Z" />)
    expect(screen.getByText('0:03')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('0:02')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('Verificação em instantes…')).toBeTruthy()
  })

  it('verificando agora e rotina desligada', () => {
    const { rerender } = render(<PrWatchCountdown enabled checking nextCheckAt={null} />)
    expect(screen.getByText('Verificando o PR agora…')).toBeTruthy()
    rerender(<PrWatchCountdown enabled={false} checking={false} nextCheckAt={null} />)
    expect(screen.getByText(/Acompanhamento automático do PR desligado/)).toBeTruthy()
  })
})

describe('Timeline com acompanhamento do PR', () => {
  it('só a verificação mais recente abre; a contagem aparece com a mesa parada', () => {
    const items = [check('a', { outcome: 'action', summary: 'Conflito de merge → resolvendo automaticamente', steps: [{ ts, level: 'warn', text: 'Conflito de merge com main' }] }), check('b')]
    const { rerender } = render(<Timeline timeline={{ items, reasoning: false, loaded: true }} running={false} prWatch={{ enabled: true, checking: true, nextCheckAt: null }} />)
    expect(screen.queryByText('Conflito de merge com main')).toBeNull()
    expect(screen.getByText('Sem conflito de merge')).toBeTruthy()
    expect(screen.getByText('Verificando o PR agora…')).toBeTruthy()

    rerender(<Timeline timeline={{ items, reasoning: false, loaded: true }} running prWatch={{ enabled: true, checking: true, nextCheckAt: null }} />)
    expect(screen.queryByText('Verificando o PR agora…')).toBeNull()
  })
})
