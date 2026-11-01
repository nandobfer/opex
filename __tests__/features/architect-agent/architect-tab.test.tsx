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
  settings: undefined as unknown,
  live: { graph: null, progress: null, seq: 0, connected: false, ended: false } as Record<string, unknown>,
  liveIds: [] as (string | null)[],
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@xyflow/react', async () => (await import('../../helpers/xyflow-interactive')).xyflowMock())
vi.mock('@/features/architect-agent/hooks/useLiveDiagram', () => ({
  useLiveDiagram: (_workbenchId: string, id: string | null) => {
    mocks.liveIds.push(id)
    return id ? mocks.live : { graph: null, progress: null, seq: 0, connected: false, ended: false }
  },
}))
vi.mock('@/features/architect-agent/hooks/useArchitect', () => ({
  useWorkbenchDiagrams: () => ({ data: mocks.diagrams, isLoading: false, isError: false, refetch: vi.fn() }),
  useArchitectRealtime: vi.fn(),
  useArchitectSettings: () => ({ data: mocks.settings }),
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
import { DEFAULT_ARCHITECT_SETTINGS } from '@/features/architect-agent/schemas'

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
  draft: null,
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
  mocks.live = { graph: null, progress: null, seq: 0, connected: false, ended: false }
  mocks.liveIds = []
  mocks.settings = undefined
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

  it('vazio: a profundidade padrão configurada vale, inclusive quando a configuração chega depois da montagem', async () => {
    const withDepth = (depth: number) => ({ settings: { ...DEFAULT_ARCHITECT_SETTINGS, diagram: { ...DEFAULT_ARCHITECT_SETTINGS.diagram, depth } } })
    const { rerender } = render(<ArchitectTab workbench={workbench()} />)
    expect(screen.getByText(/até 35 nós/)).toBeTruthy()
    mocks.settings = withDepth(5)
    rerender(<ArchitectTab workbench={workbench()} />)
    expect(screen.getByText(/até 120 nós/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Gerar arquitetura/ })))
    expect(mocks.generate).toHaveBeenLastCalledWith({ depth: 5 })
    cleanup()
    mocks.settings = withDepth(2)
    render(<ArchitectTab workbench={workbench()} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Gerar arquitetura/ })))
    expect(mocks.generate).toHaveBeenLastCalledWith({ depth: 2 })
  })

  it('gerando antes do primeiro nó: o canvas no formato final esperando, com a fase e as leituras', () => {
    mocks.diagrams = [diagram({ state: 'running', phase: 'reading', tools: 4, graph: null })]
    render(<ArchitectTab workbench={workbench()} />)
    expect(screen.getByTestId('architect-live-waiting')).toBeTruthy()
    expect(screen.getByText(/Lendo o plano e o código/)).toBeTruthy()
    expect(screen.getByTestId('architect-live-bar').textContent).toContain('4 leituras')
    expect(screen.queryByTestId('architect-canvas')).toBeNull()
    // O stream ao vivo é aberto para a versão gerando.
    expect(mocks.liveIds).toContain('d1')
  })

  it('ao vivo: os nós que chegam pelo stream aparecem sem remontar o canvas, e o grafo final entra no mesmo canvas', async () => {
    mocks.diagrams = [diagram({ state: 'running', phase: 'writing', graph: null })]
    const partial = sampleGraph()
    mocks.live = { graph: { ...partial, nodes: partial.nodes.slice(0, 2), edges: partial.edges.slice(0, 1) }, progress: { phase: 'writing', tools: 2, nodes: 2, edges: 1 }, seq: 3, connected: true, ended: false }
    const { rerender } = render(<ArchitectTab workbench={workbench()} />)
    const canvas = screen.getByTestId('architect-canvas')
    expect(screen.getByTestId('architect-node-objective')).toBeTruthy()
    expect(screen.queryByTestId('architect-node-route')).toBeNull()
    expect(screen.getByTestId('architect-live-bar').textContent).toContain('Desenhando o diagrama')
    // Ao vivo, Exportar fica na barra do canvas, mas desligado até terminar.
    expect(screen.getByRole('button', { name: /Exportar/ }).hasAttribute('disabled')).toBe(true)
    // Chegam mais operações: o mesmo elemento do canvas continua no DOM.
    mocks.live = { ...mocks.live, graph: partial, seq: 4 }
    rerender(<ArchitectTab workbench={workbench()} />)
    // O layout ao vivo espera o lote assentar (debounce) antes de desenhar.
    expect(await screen.findByTestId('architect-node-route')).toBeTruthy()
    expect(screen.getByTestId('architect-canvas')).toBe(canvas)
    // Fim (Pusher relê a lista): a versão pronta entra no mesmo canvas, e o stream é fechado.
    mocks.diagrams = [diagram()]
    rerender(<ArchitectTab workbench={workbench()} />)
    expect(screen.getByTestId('architect-canvas')).toBe(canvas)
    expect(screen.queryByTestId('architect-live-bar')).toBeNull()
    expect(screen.getByRole('button', { name: /Exportar/ }).hasAttribute('disabled')).toBe(false)
    expect(mocks.liveIds.at(-1)).toBeNull()
  })

  it('aberta no meio da geração, o rascunho gravado aparece antes do stream conectar; a queda mostra "Reconectando"', () => {
    const draft = sampleGraph()
    mocks.diagrams = [diagram({ state: 'running', graph: null, draft })]
    const { rerender } = render(<ArchitectTab workbench={workbench()} />)
    expect(screen.getByTestId('architect-node-tab')).toBeTruthy()
    mocks.live = { graph: draft, progress: { phase: 'writing', tools: 1, nodes: 6, edges: 5 }, seq: 2, connected: false, ended: false }
    rerender(<ArchitectTab workbench={workbench()} />)
    expect(screen.getByTestId('architect-live-bar').textContent).toContain('Reconectando')
  })

  it('volta a "gerando" quando uma versão nova começa', () => {
    mocks.diagrams = [diagram(), diagram({ id: 'd2', version: 2, planSeq: 2, state: 'running', graph: null })]
    render(<ArchitectTab workbench={workbench()} />)
    expect(screen.getByTestId('architect-live-waiting')).toBeTruthy()
  })

  it('falhou com rascunho: o desenho até a falha fica esmaecido atrás da mensagem', () => {
    mocks.diagrams = [diagram({ state: 'failed', graph: null, draft: sampleGraph(), error: 'Tempo esgotado' })]
    render(<ArchitectTab workbench={workbench()} />)
    expect(screen.getByTestId('architect-failed-draft').getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('alert').textContent).toContain('Tempo esgotado')
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

  it('controles dentro do quadro: visão, filtros, exportar, ajustar visão e restaurar layout ficam na barra do canvas', () => {
    mocks.diagrams = [diagram()]
    render(<ArchitectTab workbench={workbench()} />)
    const frame = screen.getByTestId('architect-canvas-frame')
    const toolbar = screen.getByTestId('architect-canvas-toolbar')
    expect(frame.contains(toolbar)).toBe(true)
    for (const name of [/Filtrar nós/, /Exportar/, /Ajustar visão/, /Restaurar layout/]) expect(toolbar.contains(screen.getByRole('button', { name }))).toBe(true)
    const tabs = screen.getByRole('radiogroup', { name: 'Visão do diagrama' })
    expect(toolbar.contains(tabs)).toBe(true)
    // Trocar a visão continua funcionando a partir da barra.
    fireEvent.click(screen.getByRole('radio', { name: 'Mapa mental' }))
    expect(screen.getByRole('radio', { name: 'Mapa mental' }).getAttribute('aria-checked')).toBe('true')
  })

  it('cabeçalho: o resumo vai para a dica do ícone ao lado do título, não fica como parágrafo', async () => {
    mocks.diagrams = [diagram()]
    render(<ArchitectTab workbench={workbench()} />)
    const header = screen.getByTestId('architect-header')
    expect(header.textContent).toContain('Agente Arquiteto')
    expect(header.textContent).not.toContain('Diagrama do plano aprovado.')
    const info = screen.getByRole('button', { name: 'Sobre o diagrama' })
    expect(header.contains(info)).toBe(true)
    await act(async () => {
      info.focus()
    })
    expect((await screen.findAllByText('Diagrama do plano aprovado.')).length).toBeGreaterThan(0)
  })

  it('cabeçalho: "Decisões, riscos e dúvidas" fica na linha dos dados da versão, alinhado à direita, e abre num popover sem mexer no canvas', async () => {
    mocks.diagrams = [diagram()]
    render(<ArchitectTab workbench={workbench()} />)
    const meta = screen.getByTestId('architect-meta-row')
    const trigger = screen.getByTestId('architect-notes-trigger')
    expect(meta.contains(trigger)).toBe(true)
    expect(meta.textContent).toContain('Plano v1 · arquitetura v1')
    expect(trigger.className.split(' ')).toContain('ml-auto')
    const canvas = screen.getByTestId('architect-canvas')
    const canvasClass = canvas.parentElement!.className
    expect(screen.queryByRole('list', { name: 'Decisões, riscos e dúvidas' })).toBeNull()
    await act(async () => {
      fireEvent.click(trigger)
    })
    const list = await screen.findByRole('list', { name: 'Decisões, riscos e dúvidas' })
    expect(list.textContent).toContain('Layout de grupos no dagre')
    // O popover fica fora do canvas (portal) e não muda o canvas.
    expect(screen.getByTestId('architect-canvas-frame').contains(list)).toBe(false)
    expect(screen.getByTestId('architect-canvas')).toBe(canvas)
    expect(canvas.parentElement!.className).toBe(canvasClass)
  })

  it('sem notas, o botão de decisões não aparece', () => {
    mocks.diagrams = [diagram({ graph: { ...sampleGraph(), notes: [] } })]
    render(<ArchitectTab workbench={workbench()} />)
    expect(screen.queryByTestId('architect-notes-trigger')).toBeNull()
  })

  it('altura: o canvas ocupa o resto da aba e a aba rola em telas baixas (nada vaza por baixo da barra da mesa)', () => {
    mocks.diagrams = [diagram()]
    render(<ArchitectTab workbench={workbench()} />)
    const frame = screen.getByTestId('architect-canvas-frame')
    const wrap = frame.parentElement!
    expect(wrap.className.split(' ')).toEqual(expect.arrayContaining(['flex-1', 'min-h-[360px]']))
    const tab = wrap.parentElement!
    expect(tab.className.split(' ')).toEqual(expect.arrayContaining(['flex-1', 'overflow-y-auto', 'min-h-0']))
  })
})
