/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import { sampleGraph } from './fixtures'

/**
 * Aba "Arquitetura (N)" da mesa: visibilidade, estados (gerando com skeleton, falhou, vazio, pronto),
 * versões "Plano vX · arquitetura vY", atualização em tempo real sem recarregar e "Pedir ajustes".
 */

const mocks = vi.hoisted(() => ({
  diagrams: [] as unknown[],
  generate: vi.fn(async (input: unknown) => ({ id: 'novo', input })),
  retry: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@xyflow/react', async () => (await import('../../helpers/xyflow')).xyflowMock())
vi.mock('@/features/architect-agent/hooks/useArchitect', () => ({
  useWorkbenchDiagrams: () => ({ data: mocks.diagrams, isLoading: false, isError: false, refetch: vi.fn() }),
  useArchitectRealtime: vi.fn(),
  useArchitectSettings: () => ({ data: undefined }),
  useGenerateDiagram: () => ({ mutateAsync: mocks.generate, isPending: false }),
  useRetryDiagram: () => ({ mutate: mocks.retry, isPending: false }),
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
        <select aria-label="Versão da arquitetura" value={ctx.value} onChange={(event) => ctx.onValueChange(event.target.value)}>
          {children}
        </select>
      )
    },
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  }
})
vi.mock('@/components/agent-reply/ReplyTextarea', () => ({ ReplyTextarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { onValueChange?: (value: string) => void }) => { const { onValueChange, ...rest } = props; return <textarea {...rest} onChange={(event) => onValueChange?.(event.target.value)} /> } }))

import { ArchitectTab, useArchitectTab } from '@/features/architect-agent/components/workbench/ArchitectTab'

const diagram = (overrides: Record<string, unknown> = {}) => ({
  id: 'd1',
  workbenchId: 'w1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'OPE-9',
  taskTitle: 'T',
  version: 1,
  planVersion: 1,
  planSeq: 1,
  depth: 3,
  origin: 'auto',
  feedback: null,
  state: 'done',
  phase: null,
  tools: 0,
  graph: sampleGraph(),
  trimmed: { nodes: 0, edges: 0 },
  warnings: [],
  repaired: false,
  error: null,
  costUsd: 0.05,
  durationMs: 61_000,
  createdAt: '2026-10-31T12:00:00.000Z',
  finishedAt: '2026-10-31T12:01:01.000Z',
  ...overrides,
})

const workbench = (architect: { applies: boolean; approvedPlanVersion: number | null } | null = { applies: true, approvedPlanVersion: 1 }) => ({ id: 'w1', taskCode: 'OPE-9', architect })

beforeEach(() => {
  mocks.diagrams = []
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(cleanup)

describe('useArchitectTab', () => {
  it('aparece com versões ou com o arquiteto aplicável e plano aprovado; some sem nada', () => {
    expect(renderHook(() => useArchitectTab(workbench(null))).result.current).toEqual({ visible: false, count: 0 })
    expect(renderHook(() => useArchitectTab(workbench({ applies: true, approvedPlanVersion: null }))).result.current.visible).toBe(false)
    expect(renderHook(() => useArchitectTab(workbench())).result.current).toEqual({ visible: true, count: 0 })
    mocks.diagrams = [diagram(), diagram({ id: 'd2', version: 2, planSeq: 2 })]
    expect(renderHook(() => useArchitectTab(workbench(null))).result.current).toEqual({ visible: true, count: 2 })
  })
})

describe('ArchitectTab', () => {
  it('vazio: "Gerar arquitetura" pede com a profundidade padrão; sem o agente, só explica', async () => {
    const { rerender } = render(<ArchitectTab workbench={workbench()} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Gerar arquitetura/ })))
    expect(mocks.generate).toHaveBeenCalledWith({ depth: 3 })
    rerender(<ArchitectTab workbench={workbench({ applies: false, approvedPlanVersion: 1 })} />)
    expect(screen.queryByRole('button', { name: /Gerar arquitetura/ })).toBeNull()
    expect(screen.getByText(/desativado para esta central/)).toBeTruthy()
  })

  it('gerando mostra o skeleton no formato do canvas e nunca um grafo parcial; o Pusher troca para pronto sem recarregar', () => {
    mocks.diagrams = [diagram({ state: 'running', phase: 'reading', tools: 4, graph: null })]
    const { rerender } = render(<ArchitectTab workbench={workbench()} />)
    expect(screen.getByTestId('architect-skeleton')).toBeTruthy()
    expect(screen.getByText(/Lendo o plano e o código/)).toBeTruthy()
    expect(screen.queryByTestId('architect-canvas')).toBeNull()
    // Evento do Pusher: a consulta é relida e a mesma aba (montada) passa a mostrar o diagrama.
    mocks.diagrams = [diagram()]
    rerender(<ArchitectTab workbench={workbench()} />)
    expect(screen.queryByTestId('architect-skeleton')).toBeNull()
    expect(screen.getByTestId('architect-canvas')).toBeTruthy()
    expect(screen.getByTestId('architect-node-tab')).toBeTruthy()
    // E volta a "gerando" quando uma versão nova começa.
    mocks.diagrams = [diagram(), diagram({ id: 'd2', version: 2, planSeq: 2, state: 'running', graph: null })]
    rerender(<ArchitectTab workbench={workbench()} />)
    expect(screen.getByTestId('architect-skeleton')).toBeTruthy()
  })

  it('falhou: "Tentar novamente" refaz a versão e "Regerar com profundidade maior" sobe um nível', async () => {
    mocks.diagrams = [diagram({ state: 'failed', graph: null, error: 'Tempo esgotado' })]
    render(<ArchitectTab workbench={workbench()} />)
    expect(screen.getByText('Tempo esgotado')).toBeTruthy()
    expect(screen.getByText(/A mesa segue normalmente/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.retry).toHaveBeenCalledWith('d1')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Regerar com profundidade maior/ })))
    expect(mocks.generate).toHaveBeenCalledWith({ depth: 4 })
  })

  it('versões: o seletor mostra "Plano vX · arquitetura vY" e a atual', () => {
    mocks.diagrams = [diagram(), diagram({ id: 'd2', version: 2, planVersion: 2, planSeq: 1 })]
    render(<ArchitectTab workbench={workbench({ applies: true, approvedPlanVersion: 2 })} />)
    const select = screen.getByLabelText('Versão da arquitetura') as HTMLSelectElement
    expect([...select.options].map((option) => option.textContent)).toEqual(['Plano v2 · arquitetura v1 (atual)', 'Plano v1 · arquitetura v1'])
    fireEvent.change(select, { target: { value: 'd1' } })
    expect(screen.getAllByText(/Plano v1 · arquitetura v1 · Equilibrado/).length).toBeGreaterThan(0)
  })

  it('"Pedir ajustes" envia o pedido, a profundidade e a versão exibida como base', async () => {
    mocks.diagrams = [diagram()]
    render(<ArchitectTab workbench={workbench()} />)
    fireEvent.click(screen.getByRole('button', { name: /Pedir ajustes/ }))
    fireEvent.change(screen.getByLabelText('Pedir ajustes no diagrama'), { target: { value: 'expanda o fluxo de autenticação' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Gerar nova versão/ })))
    expect(mocks.generate).toHaveBeenCalledWith({ feedback: 'expanda o fluxo de autenticação', depth: 3, baseDiagramId: 'd1' })
  })

  it('sem o arquiteto aplicável, o diagrama pronto continua visível, sem pedir ajustes', () => {
    mocks.diagrams = [diagram()]
    render(<ArchitectTab workbench={workbench({ applies: false, approvedPlanVersion: 1 })} />)
    expect(screen.getByTestId('architect-canvas')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Pedir ajustes/ })).toBeNull()
  })
})
