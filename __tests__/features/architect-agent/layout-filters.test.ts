import { describe, expect, it } from 'vitest'
import { collapsedId, filterGraph, neighborsOf, toViewGraph } from '@/features/architect-agent/filters'
import { layoutArchitecture, layoutMindMap } from '@/features/architect-agent/layout'
import { approvedPlanVersionOf } from '@/features/architect-agent/plan-version'
import { ARCHITECT_NODE_KINDS } from '@/features/architect-agent/constants'
import { sampleGraph } from './fixtures'

/** Filtros, grupos recolhidos, layouts das duas visões e a versão do plano aprovado. */

const allKinds = { kinds: [...ARCHITECT_NODE_KINDS], onlyChanges: false }

describe('filterGraph', () => {
  it('"só o que o plano cria/altera" mantém o objetivo e tira o contexto existente', () => {
    const graph = filterGraph(sampleGraph(), { ...allKinds, onlyChanges: true })
    expect(graph.nodes.map((node) => node.id)).not.toContain('pusher')
    expect(graph.nodes.map((node) => node.id)).toContain('objective')
    expect(graph.edges.some((edge) => edge.target === 'pusher')).toBe(false)
  })

  it('filtra por tipo, mantém o objetivo e remove grupos vazios', () => {
    const graph = filterGraph(sampleGraph(), { kinds: ['module'], onlyChanges: false })
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(['objective', 'tab', 'view'])
    expect(graph.groups.map((group) => group.id)).toEqual(['g-ui'])
  })
})

describe('toViewGraph', () => {
  it('recolher um grupo troca os nós por um só e agrega as arestas da fronteira', () => {
    const view = toViewGraph(sampleGraph(), new Set(['g-ui']))
    const ids = view.nodes.map((node) => node.id)
    expect(ids).toContain(collapsedId('g-ui'))
    expect(ids).not.toContain('tab')
    expect(view.nodes.find((node) => node.id === collapsedId('g-ui'))!.collapsed).toEqual({ groupId: 'g-ui', label: 'UI', count: 2 })
    // view→tab é interna (some); objective→tab e tab→route viram arestas do grupo.
    expect(view.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(expect.arrayContaining(['objective->group:g-ui', 'group:g-ui->route']))
    expect(view.groups.map((group) => group.id)).not.toContain('g-ui')
  })
})

describe('neighborsOf', () => {
  it('lista as ligações de entrada e saída', () => {
    const neighbors = neighborsOf(sampleGraph(), 'route')
    expect(neighbors.map((item) => `${item.direction}:${item.node.id}`).sort()).toEqual(['in:tab', 'out:model', 'out:pusher'])
  })
})

describe('layoutArchitecture', () => {
  it('camadas da esquerda para a direita e filhos posicionados dentro do grupo', () => {
    const { items, edges } = layoutArchitecture(toViewGraph(sampleGraph()))
    const byId = new Map(items.map((item) => [item.id, item]))
    expect(byId.get('objective')!.rank).toBeLessThan(byId.get('route')!.rank)
    expect(byId.get('route')!.rank).toBeLessThan(byId.get('model')!.rank)
    const group = byId.get('cluster:g-ui')!
    const tab = byId.get('tab')!
    expect(group.kind).toBe('group')
    expect(tab.parentId).toBe('cluster:g-ui')
    expect(tab.x).toBeGreaterThanOrEqual(0)
    expect(tab.y).toBeGreaterThan(0)
    expect(tab.x + tab.width).toBeLessThanOrEqual(group.width)
    expect(edges).toHaveLength(5)
    // O grupo vem antes dos filhos (exigência do React Flow).
    expect(items.findIndex((item) => item.id === 'cluster:g-ui')).toBeLessThan(items.findIndex((item) => item.id === 'tab'))
  })
})

describe('layoutMindMap', () => {
  it('objetivo no centro, anéis por distância e nós soltos ainda posicionados', () => {
    const graph = sampleGraph()
    graph.nodes.push({ id: 'solto', label: 'Solto', groupId: null, kind: 'risk', detail: '', files: [], status: 'new' })
    graph.edges.push({ id: 'e6', source: 'tab', target: 'model', label: null, kind: 'data' })
    const { items, edges } = layoutMindMap(toViewGraph(graph))
    const byId = new Map(items.map((item) => [item.id, item]))
    expect(items).toHaveLength(graph.nodes.length)
    const root = byId.get('objective')!
    expect(root.rank).toBe(0)
    expect(root.x + root.width / 2).toBeCloseTo(0)
    expect(byId.get('solto')!.rank).toBe(1)
    expect(byId.get('route')!.rank).toBe(2)
    // BFS: tab alcança model por e6 antes de route; route→model (e4) fica fora da árvore.
    expect(edges.find((edge) => edge.id === 'e4')!.secondary).toBe(true)
    expect(edges.find((edge) => edge.id === 'e1')!.secondary).toBe(false)
  })
})

describe('approvedPlanVersionOf', () => {
  it('usa a versão gravada na aprovação', () => {
    expect(approvedPlanVersionOf({ approvedPlanVersion: 2, stage: 'plan_review', plans: [1, 2, 3], branch: 'b' })).toBe(2)
  })

  it('deriva nas mesas antigas pelo estado', () => {
    expect(approvedPlanVersionOf({ stage: 'implementing', plans: [1, 2], branch: 'b' })).toBe(2)
    expect(approvedPlanVersionOf({ stage: 'plan_review', plans: [1], branch: null })).toBeNull()
    expect(approvedPlanVersionOf({ stage: 'plan_review', plans: [1, 2], branch: 'b' })).toBe(1)
    expect(approvedPlanVersionOf({ stage: 'planning', plans: [1], branch: 'b' })).toBe(1)
    expect(approvedPlanVersionOf({ stage: 'planning', plans: [], branch: null })).toBeNull()
  })
})
