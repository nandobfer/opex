/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import { sampleGraph } from './fixtures'

/**
 * Diagrama interativo: hover destaca o nó, os vizinhos e as arestas dele e esmaece o resto; clique
 * abre o painel com arquivos e vizinhos; filtros; recolher/expandir grupos; troca de visão; e as
 * posições arrastadas ficam no navegador, por mesa, versão e visão.
 */

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@xyflow/react', async () => (await import('../../helpers/xyflow-interactive')).xyflowMock())

import { ArchitectDiagramView } from '@/features/architect-agent/components/workbench/ArchitectDiagramView'
import { positionsKey } from '@/features/architect-agent/hooks/useDiagramLayout'
import { ARCHITECT_NODE_KINDS, type ArchitectView } from '@/features/architect-agent/constants'
import { FLOW_THEME_STYLE } from '@/components/flow/flow-theme'
import { flowSpies } from '../../helpers/xyflow-interactive'

const allKinds = { kinds: [...ARCHITECT_NODE_KINDS], onlyChanges: false }
const view = (props: { view?: ArchitectView; filter?: typeof allKinds; diagramId?: string } = {}) => (
  <ArchitectDiagramView workbenchId="w1" diagramId={props.diagramId ?? 'd1'} graph={sampleGraph()} view={props.view ?? 'architecture'} filter={props.filter ?? allKinds} showFiles />
)
const node = (id: string) => screen.getByTestId(`architect-node-${id}`)

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('ArchitectDiagramView', () => {
  it('hover no nó destaca as arestas dele e esmaece o resto', () => {
    render(view())
    fireEvent.mouseEnter(screen.getByTestId('rf-node-route'))
    expect(node('route').getAttribute('data-dimmed')).toBe('false')
    expect(node('tab').getAttribute('data-dimmed')).toBe('false')
    expect(node('model').getAttribute('data-dimmed')).toBe('false')
    expect(node('view').getAttribute('data-dimmed')).toBe('true')
    expect(node('objective').getAttribute('data-dimmed')).toBe('true')
    expect(screen.getByTestId('architect-edge-e3').getAttribute('data-dimmed')).toBe('false')
    expect(screen.getByTestId('architect-edge-e1').getAttribute('data-dimmed')).toBe('true')
    expect(screen.getByTestId('architect-edge-e3').getAttribute('class')).toContain('stroke-primary')
    fireEvent.mouseLeave(screen.getByTestId('rf-node-route'))
    expect(node('view').getAttribute('data-dimmed')).toBe('false')
  })

  it('clique abre o painel lateral com descrição, arquivos e vizinhos; clicar num vizinho troca o nó', () => {
    render(view())
    fireEvent.click(screen.getByTestId('rf-node-tab'))
    const panel = screen.getByRole('complementary', { name: 'Detalhes de Aba "Arquitetura"' })
    expect(panel.textContent).toContain('React Flow')
    expect(panel.textContent).toContain('src/features/architect-agent/components/workbench/ArchitectTab.tsx')
    expect(panel.textContent).toContain('Vizinhos (3)')
    fireEvent.click(screen.getByRole('button', { name: /POST \/api\/architect/ }))
    expect(screen.getByRole('complementary', { name: 'Detalhes de POST /api/architect/…' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('"Só o que o plano cria/altera" e o filtro por tipo escondem os nós', () => {
    const { rerender } = render(view({ filter: { ...allKinds, onlyChanges: true } }))
    expect(screen.queryByTestId('architect-node-pusher')).toBeNull()
    expect(node('objective')).toBeTruthy()
    rerender(view({ filter: { kinds: ['route'], onlyChanges: false } }))
    expect(screen.queryByTestId('architect-node-tab')).toBeNull()
    expect(node('route')).toBeTruthy()
  })

  it('recolhe e expande um grupo', () => {
    render(view())
    expect(screen.getByTestId('rf-node-tab').getAttribute('data-parent')).toBe('cluster:g-ui')
    fireEvent.click(screen.getByRole('button', { name: 'Recolher o grupo UI' }))
    expect(screen.queryByTestId('architect-node-tab')).toBeNull()
    expect(screen.getByTestId('architect-collapsed-g-ui').textContent).toContain('2 nós')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir o grupo UI' }))
    expect(node('tab')).toBeTruthy()
  })

  it('mapa mental: sem caixas de grupo e o objetivo no centro', () => {
    render(view({ view: 'mindmap' }))
    expect(screen.queryByTestId('architect-group-g-ui')).toBeNull()
    const root = screen.getByTestId('rf-node-objective')
    expect(Number(root.getAttribute('data-x')) + 110).toBeCloseTo(0)
    expect(Number(root.getAttribute('data-y')) + 34).toBeCloseTo(0)
  })

  it('arrastar grava a posição só no navegador, por mesa, versão e visão, e "Restaurar layout" limpa', () => {
    const { unmount } = render(view())
    const before = Number(screen.getByTestId('rf-node-objective').getAttribute('data-x'))
    fireEvent.click(screen.getByTestId('rf-drag-objective'))
    const saved = JSON.parse(localStorage.getItem(positionsKey('w1', 'd1', 'architecture'))!)
    expect(saved.objective.x).toBe(Math.round(before + 40))
    expect(localStorage.getItem(positionsKey('w1', 'd1', 'mindmap'))).toBeNull()
    unmount()
    render(view())
    expect(Number(screen.getByTestId('rf-node-objective').getAttribute('data-x'))).toBe(Math.round(before + 40))
    fireEvent.click(screen.getByRole('button', { name: /Restaurar layout/ }))
    expect(Object.keys(JSON.parse(localStorage.getItem(positionsKey('w1', 'd1', 'architecture')) ?? '{}'))).toHaveLength(0)
    expect(Number(screen.getByTestId('rf-node-objective').getAttribute('data-x'))).toBe(before)
  })
})

describe('ArchitectDiagramView ao vivo', () => {
  const live = { progress: { phase: 'writing' as const, tools: 3, nodes: 6, edges: 5 }, connected: true }

  it('sem arrasto durante a geração; ao terminar, volta a arrastar no mesmo canvas', () => {
    const { rerender } = render(<ArchitectDiagramView workbenchId="w1" diagramId="d1" graph={sampleGraph()} view="architecture" filter={allKinds} showFiles live={live} />)
    const flow = screen.getByTestId('rf')
    expect(flow.getAttribute('data-draggable')).toBe('false')
    expect(screen.getByTestId('architect-live-bar').textContent).toContain('6 nós')
    expect(screen.getByRole('button', { name: /Restaurar layout/ }).hasAttribute('disabled')).toBe(true)
    rerender(<ArchitectDiagramView workbenchId="w1" diagramId="d1" graph={sampleGraph()} view="architecture" filter={allKinds} showFiles />)
    expect(screen.getByTestId('rf')).toBe(flow)
    expect(flow.getAttribute('data-draggable')).toBe('true')
    expect(screen.queryByTestId('architect-live-bar')).toBeNull()
  })

  it('a câmera acompanha até o usuário mover a visão; "Acompanhar" religa', async () => {
    flowSpies.fitView.mockClear()
    render(<ArchitectDiagramView workbenchId="w1" diagramId="d1" graph={sampleGraph()} view="architecture" filter={allKinds} showFiles live={live} />)
    await vi.waitFor(() => expect(flowSpies.fitView).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Acompanhar/ })).toBeNull()
    fireEvent.click(screen.getByTestId('rf-user-move'))
    fireEvent.click(await screen.findByRole('button', { name: /Acompanhar/ }))
    expect(screen.queryByRole('button', { name: /Acompanhar/ })).toBeNull()
  })

  it('nós que saem do grafo somem e os novos aparecem sem remontar', async () => {
    const graph = sampleGraph()
    const { rerender } = render(<ArchitectDiagramView workbenchId="w1" diagramId="d1" graph={graph} view="mindmap" filter={allKinds} showFiles live={live} />)
    const flow = screen.getByTestId('rf')
    const next = { ...graph, nodes: [...graph.nodes.filter((item) => item.id !== 'pusher'), { id: 'auth', label: 'Autenticação', groupId: null, kind: 'feature' as const, detail: '', files: [], status: 'new' as const }], edges: graph.edges.filter((edge) => edge.target !== 'pusher') }
    rerender(<ArchitectDiagramView workbenchId="w1" diagramId="d1" graph={next} view="mindmap" filter={allKinds} showFiles live={live} />)
    expect(await screen.findByTestId('architect-node-auth')).toBeTruthy()
    expect(screen.queryByTestId('architect-node-pusher')).toBeNull()
    expect(screen.getByTestId('rf')).toBe(flow)
  })

  it('o canvas usa o tema compartilhado (fundo do app, sem o cinza do React Flow)', () => {
    render(view())
    expect(JSON.parse(screen.getByTestId('rf').getAttribute('data-style')!)).toEqual(FLOW_THEME_STYLE)
  })
})
