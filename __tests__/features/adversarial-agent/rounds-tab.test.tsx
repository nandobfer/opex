/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({
  reviews: [] as unknown[],
  enabled: [] as boolean[],
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/adversarial-agent/hooks/useAdversarial', () => ({
  useWorkbenchAdversarialReviews: (_id: string, enabled: boolean) => {
    mocks.enabled.push(enabled)
    return { data: enabled ? mocks.reviews : undefined, isLoading: false, isError: false, refetch: vi.fn() }
  },
  useAdversarialRealtime: vi.fn(),
  useAdversarialReview: () => ({ data: null, isLoading: false, isError: false }),
}))
// O Select do Radix não abre no DOM de teste: um <select> nativo com as mesmas opções.
vi.mock('@/components/ui/select', () => {
  const Ctx = React.createContext<{ value: string; onValueChange: (value: string) => void }>({ value: '', onValueChange: () => {} })
  return {
    Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>,
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx)
      return (
        <select aria-label="Rodada do agente adversário" value={ctx.value} onChange={(event) => ctx.onValueChange(event.target.value)}>
          {children}
        </select>
      )
    },
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  }
})

import { AdversarialRoundsView, AdversarialTabNavProvider, useAdversarialTab } from '@/features/adversarial-agent/components/workbench/AdversarialRoundsView'
import { AdversarialVerdictItem } from '@/features/adversarial-agent/components/workbench/AdversarialVerdictItem'

afterEach(() => {
  cleanup()
  mocks.reviews = []
  mocks.enabled = []
})

const finding = (id: string, blocking: boolean) => ({ id, severity: blocking ? 'high' : 'low', category: 'bug', title: `Problema ${id}`, file: 'src/a.ts', line: 2, evidence: 'x', scenario: 'y', suggestion: 'z', inDiff: true, carriedOver: false, introducedByFix: false, blocking, demotedReason: null })

const review = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  workbenchId: 'w1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'GO-1',
  taskTitle: 'CSV',
  cycle: 1,
  round: 1,
  level: 'balanced',
  state: 'done',
  decision: 'approved',
  limitReached: false,
  summary: 'Sem bloqueios.',
  blocking: 0,
  counts: { critical: 0, high: 0, medium: 0, low: 0, nit: 0 },
  error: null,
  costUsd: 0.01,
  durationMs: 61000,
  createdAt: '2026-10-26T12:00:00.000Z',
  finishedAt: '2026-10-26T12:01:01.000Z',
  findings: [],
  previous: [],
  disputes: [],
  excluded: [],
  userText: null,
  report: 'Relatório',
  ...overrides,
})

describe('aba "Adversário (N)" da mesa', () => {
  it('aparece sempre que a mesa tiver rodadas, com o total no rótulo', () => {
    mocks.reviews = [review(), review({ id: 'r2', round: 2 })]
    expect(renderHook(() => useAdversarialTab({ id: 'w1' })).result.current).toEqual({ visible: true, count: 2 })
    mocks.reviews = []
    expect(renderHook(() => useAdversarialTab({ id: 'w1' })).result.current).toEqual({ visible: false, count: 0 })
  })

  it('mostra a rodada mais recente; o seletor troca para outra (com "atual" na mais recente)', () => {
    mocks.reviews = [review({ summary: 'Bloqueou no F1.', decision: 'fix-auto', findings: [finding('F1', true)] }), review({ id: 'r2', round: 2, summary: 'Corrigido.', findings: [finding('F2', false)], disputes: [{ id: 'F1', reason: 'Já tratado' }] })]
    const onSelect = vi.fn()
    const { rerender } = render(<AdversarialRoundsView workbenchId="w1" selectedId={null} onSelect={onSelect} />)
    expect(screen.getByText('Corrigido.')).toBeTruthy()
    // Mesmo card da Saída da IA: cabeçalho da rodada, nível e decisão.
    expect(screen.getByText('Agente adversário · rodada 2')).toBeTruthy()
    expect(screen.getByText('Equilibrado')).toBeTruthy()
    expect(screen.getByText('Aprovado')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Relatório completo/ })).toBeTruthy()
    expect(screen.getByText('Problema F2')).toBeTruthy()
    expect(screen.getByText(/Já tratado/)).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Ciclo 1 · rodada 2 (atual)' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Rodada do agente adversário'), { target: { value: 'r1' } })
    expect(onSelect).toHaveBeenCalledWith('r1')
    rerender(<AdversarialRoundsView workbenchId="w1" selectedId="r1" onSelect={onSelect} />)
    expect(screen.getByText('Bloqueou no F1.')).toBeTruthy()
    expect(screen.getByText('Problema F1')).toBeTruthy()
  })

  it('rodada em andamento mostra "Revisando…"; rodada que falhou mostra o erro', () => {
    mocks.reviews = [review({ state: 'running', decision: null, summary: null, report: null })]
    const { rerender } = render(<AdversarialRoundsView workbenchId="w1" selectedId={null} onSelect={vi.fn()} />)
    expect(screen.getByText(/Revisando… o resultado aparece aqui/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Relatório completo/ })).toBeNull()
    mocks.reviews = [review({ state: 'failed', decision: 'failed', summary: null, error: 'Agente adversário falhou: tempo esgotado' })]
    rerender(<AdversarialRoundsView workbenchId="w1" selectedId={null} onSelect={vi.fn()} />)
    expect(screen.getByText('Agente adversário falhou: tempo esgotado')).toBeTruthy()
  })
})

describe('card do veredito na saída', () => {
  const card = <AdversarialVerdictItem reviewId="r9" round={1} level="Equilibrado" summary="Ok" outcome="Aprovado" findings={[]} />

  it('na mesa, "Ver na aba" abre a aba na rodada', () => {
    const open = vi.fn()
    render(<AdversarialTabNavProvider value={open}>{card}</AdversarialTabNavProvider>)
    expect(screen.queryByRole('button', { name: /Detalhes/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ver na aba/ }))
    expect(open).toHaveBeenCalledWith('r9')
  })

  it('sem a aba, mantém "Detalhes" (diálogo)', () => {
    render(card)
    expect(screen.getByRole('button', { name: /Detalhes/ })).toBeTruthy()
  })
})
