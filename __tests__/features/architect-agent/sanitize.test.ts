import { describe, expect, it } from 'vitest'
import { ARCHITECT_DEPTH_DEFS } from '@/features/architect-agent/constants'
import { architectGraphSchema } from '@/features/architect-agent/graph'
import { sanitizeGraph } from '@/features/architect-agent/sanitize'

/** Saneamento do grafo do modelo: ids, deduplicação, arestas soltas, objetivo e teto do nível. */

const node = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: `Nó ${id}`, kind: 'module', status: 'existing', ...extra })

describe('sanitizeGraph', () => {
  it('descarta arestas com nó inexistente, laços e duplicadas', () => {
    const { graph, warnings } = sanitizeGraph(
      {
        title: 'T',
        nodes: [node('objective', { kind: 'objective' }), node('a'), node('b')],
        edges: [
          { source: 'objective', target: 'a', kind: 'flow' },
          { source: 'a', target: 'ghost', kind: 'uses' },
          { source: 'a', target: 'a', kind: 'uses' },
          { source: 'objective', target: 'a', kind: 'flow' },
          { from: 'a', to: 'b' },
        ],
      },
      3,
    )
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(['objective->a', 'a->b'])
    expect(graph.edges[1]!.kind).toBe('uses')
    expect(warnings.some((warning) => warning.includes('1 aresta(s) com nó inexistente'))).toBe(true)
    expect(architectGraphSchema.safeParse(graph).success).toBe(true)
  })

  it('deduplica ids (vale o primeiro) e troca grupo inexistente por nenhum', () => {
    const { graph, warnings } = sanitizeGraph({ groups: [{ id: 'g', label: 'UI', layer: 'ui' }, { id: 'g', label: 'Outro' }], nodes: [node('a', { groupId: 'g', label: 'Primeiro' }), node('a', { label: 'Segundo' }), node('b', { groupId: 'nada' })] }, 3)
    expect(graph.nodes.filter((item) => item.id === 'a').map((item) => item.label)).toEqual(['Primeiro'])
    expect(graph.nodes.find((item) => item.id === 'b')!.groupId).toBeNull()
    expect(graph.groups).toHaveLength(1)
    expect(warnings.some((warning) => warning.includes('id repetido'))).toBe(true)
  })

  it('cria o nó do objetivo a partir do título quando falta', () => {
    const { graph } = sanitizeGraph({ title: 'Exportar CSV', summary: 'Resumo', nodes: [node('a')] }, 3)
    const objective = graph.nodes.find((item) => item.kind === 'objective')
    expect(objective?.label).toBe('Exportar CSV')
    expect(objective?.status).toBe('new')
  })

  it.each([1, 2, 3, 4, 5] as const)('respeita o teto de nós do nível %i, priorizando objetivo e o que o plano cria/altera', (depth) => {
    const max = ARCHITECT_DEPTH_DEFS[depth].maxNodes
    const nodes = [
      ...Array.from({ length: max + 10 }, (_, index) => node(`e${index}`)),
      node('new1', { status: 'new' }),
      node('chg1', { status: 'changed' }),
      node('objective', { kind: 'objective', status: 'new' }),
    ]
    const { graph, trimmed } = sanitizeGraph({ nodes }, depth)
    expect(graph.nodes).toHaveLength(max)
    expect(trimmed.nodes).toBe(nodes.length - max)
    const ids = graph.nodes.map((item) => item.id)
    expect(ids).toEqual(expect.arrayContaining(['objective', 'new1', 'chg1']))
  })

  it('corta acima do teto de arestas priorizando as relações sobre o "contém"', () => {
    const nodes = Array.from({ length: 8 }, (_, index) => node(`n${index}`))
    const edges = [
      ...Array.from({ length: 7 }, (_, index) => ({ source: 'n0', target: `n${index + 1}`, kind: 'contains' })),
      ...Array.from({ length: 7 }, (_, index) => ({ source: `n${index + 1}`, target: 'n0', kind: 'uses' })),
    ]
    const { graph, trimmed } = sanitizeGraph({ nodes: [node('objective', { kind: 'objective' }), ...nodes.slice(0, 7)], edges }, 1)
    expect(graph.edges.length).toBeLessThanOrEqual(ARCHITECT_DEPTH_DEFS[1].maxEdges)
    expect(trimmed.nodes).toBe(0)
    expect(graph.edges.filter((edge) => edge.kind === 'uses').length).toBeGreaterThan(0)
  })

  it('normaliza valores fora da enumeração e corta arquivos repetidos', () => {
    const { graph } = sanitizeGraph({ nodes: [node('a', { kind: 'componente', status: 'novo', files: ['./src/a.ts', 'src/a.ts', 3] })] }, 3)
    const a = graph.nodes.find((item) => item.id === 'a')!
    expect(a.kind).toBe('module')
    expect(a.status).toBe('existing')
    expect(a.files).toEqual(['src/a.ts', '3'])
  })
})
