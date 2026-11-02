import { describe, expect, it } from 'vitest'
import { ARCHITECT_DEPTH_DEFS, ARCHITECT_NODE_DETAIL_MAX, ARCHITECT_TEXT_LIMITS } from '@/features/architect-agent/constants'
import { architectGraphSchema } from '@/features/architect-agent/graph'
import { looksLikeCode, needsIdeaRepair, normalizeLegacyGraph, sanitizeGraph } from '@/features/architect-agent/sanitize'
import { legacyGraph } from './fixtures'
import type { ArchitectGraph } from '@/features/architect-agent/graph'

/** Saneamento do grafo do modelo: ids, deduplicação, arestas soltas, objetivo e teto do nível. */

const node = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: `Nó ${id}`, kind: 'structure', status: 'existing', ...extra })

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

  it('mais de 8 grupos com nós: fica o teto do schema, priorizando os grupos com nós novos/alterados, sem descartar nós', () => {
    const groups = Array.from({ length: 12 }, (_, index) => ({ id: `g${index}`, label: `G${index}`, layer: 'structures' }))
    // Os 4 primeiros grupos só têm nós existentes; os demais, nós novos.
    const nodes = groups.map((group, index) => ({ id: `n${index}`, label: `N${index}`, groupId: group.id, kind: 'structure', status: index < 4 ? 'existing' : 'new' }))
    const result = sanitizeGraph({ title: 'T', groups, nodes: [{ id: 'objective', label: 'O', kind: 'objective' }, ...nodes] }, 5)
    expect(() => architectGraphSchema.parse(result.graph)).not.toThrow()
    expect(result.graph.groups).toHaveLength(8)
    expect(result.graph.groups.map((group) => group.id)).not.toContain('g0')
    expect(result.graph.nodes).toHaveLength(13)
    expect(result.graph.nodes.find((node) => node.id === 'n0')!.groupId).toBeNull()
    expect(result.warnings.some((warning) => warning.includes('4 grupo(s) acima do teto de 8'))).toBe(true)
  })

  it('id de aresta repetido gera um id novo sem passar do tamanho máximo do schema', () => {
    const long = 'e'.repeat(80)
    const result = sanitizeGraph({ title: 'T', nodes: [{ id: 'a', label: 'A', kind: 'objective' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ id: long, source: 'a', target: 'b' }, { id: long, source: 'a', target: 'c' }] }, 3)
    expect(() => architectGraphSchema.parse(result.graph)).not.toThrow()
    const ids = result.graph.edges.map((edge) => edge.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids.every((id) => id.length <= 80)).toBe(true)
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
    const nodes = Array.from({ length: 4 }, (_, index) => node(`n${index}`))
    const edges = [
      ...Array.from({ length: 3 }, (_, index) => ({ source: 'n0', target: `n${index + 1}`, kind: 'contains' })),
      ...Array.from({ length: 3 }, (_, index) => ({ source: `n${index + 1}`, target: 'n0', kind: 'uses' })),
      { source: 'objective', target: 'n0', kind: 'flow' },
    ]
    const { graph, trimmed } = sanitizeGraph({ nodes: [node('objective', { kind: 'objective' }), ...nodes], edges }, 1)
    expect(graph.edges.length).toBeLessThanOrEqual(ARCHITECT_DEPTH_DEFS[1].maxEdges)
    expect(trimmed.nodes).toBe(0)
    expect(graph.edges.filter((edge) => edge.kind === 'uses').length).toBeGreaterThan(0)
  })

  it('normaliza valores fora da enumeração e nunca guarda arquivos (diagrama de ideias)', () => {
    const { graph } = sanitizeGraph({ nodes: [node('a', { kind: 'componente', status: 'novo', files: ['./src/a.ts', 'src/a.ts', 3] })] }, 3)
    const a = graph.nodes.find((item) => item.id === 'a')!
    expect(a.kind).toBe('structure')
    expect(a.status).toBe('existing')
    expect(a.files).toEqual([])
  })

  it('tipos, camadas e ligações do vocabulário antigo viram os equivalentes de ideias', () => {
    const { graph } = sanitizeGraph({ groups: [{ id: 'g', label: 'UI', layer: 'ui' }], nodes: [node('objective', { kind: 'objective' }), node('a', { kind: 'route', groupId: 'g' }), node('b', { kind: 'data' })], edges: [{ source: 'a', target: 'b', kind: 'event' }] }, 3)
    expect(graph.groups[0]!.layer).toBe('people')
    expect(graph.nodes.map((item) => item.kind)).toEqual(['objective', 'process', 'information'])
    expect(graph.edges[0]!.kind).toBe('notifies')
  })

  it('rótulos e descrições com nome de código viram aviso e são devolvidos para a correção', () => {
    const { codeLabels, warnings } = sanitizeGraph({ nodes: [node('objective', { kind: 'objective', label: 'Diagrama do plano' }), node('a', { label: 'useArchitectTab' }), node('b', { label: 'Aprovação do plano', detail: 'grava em architect_diagrams' })] }, 3)
    expect(codeLabels).toEqual(['useArchitectTab'])
    expect(warnings.some((warning) => warning.includes('1 rótulo(s) com nome de código'))).toBe(true)
    expect(warnings.some((warning) => warning.includes('1 descrição(ões) com nome de código'))).toBe(true)
  })

  it('nível Minucioso: detalhe acima do limite é cortado e avisado; abaixo dele, fica inteiro', () => {
    const long = 'x'.repeat(ARCHITECT_NODE_DETAIL_MAX + 500)
    const fits = 'regra do bloco; '.repeat(60)
    const { graph, warnings } = sanitizeGraph({ nodes: [node('objective', { kind: 'objective' }), node('a', { detail: long }), node('b', { detail: fits })] }, 5)
    expect(graph.nodes.find((item) => item.id === 'a')!.detail).toHaveLength(ARCHITECT_NODE_DETAIL_MAX)
    expect(graph.nodes.find((item) => item.id === 'b')!.detail).toBe(fits.trim())
    expect(warnings).toContain('descrição de nó: 1 corte(s) no teto de proteção de 1.500 caracteres')
    expect(architectGraphSchema.safeParse(graph).success).toBe(true)
  })

  it('o teto de proteção fica bem acima do tamanho pedido no prompt, e o que o prompt pede nunca é cortado', () => {
    for (const limit of Object.values(ARCHITECT_TEXT_LIMITS)) expect(limit.max).toBeGreaterThanOrEqual(limit.prompt * 1.5)
    const asked = 'y'.repeat(ARCHITECT_TEXT_LIMITS.detail.prompt)
    const { graph, warnings } = sanitizeGraph({ nodes: [node('objective', { kind: 'objective' }), node('a', { detail: asked })] }, 5)
    expect(graph.nodes.find((item) => item.id === 'a')!.detail).toBe(asked)
    expect(warnings.some((warning) => warning.includes('corte(s)'))).toBe(false)
  })

  it('resposta acima do maior teto: resumo, nota, grupo e rótulos são cortados e cada corte vira aviso', () => {
    const over = (field: keyof typeof ARCHITECT_TEXT_LIMITS) => 'z'.repeat(ARCHITECT_TEXT_LIMITS[field].max + 10)
    const { graph, warnings } = sanitizeGraph(
      {
        title: over('title'),
        summary: over('summary'),
        groups: [{ id: 'g', label: over('groupLabel'), layer: 'people', detail: over('groupDetail') }],
        nodes: [node('objective', { kind: 'objective' }), node('a', { label: over('nodeLabel'), groupId: 'g' })],
        edges: [{ source: 'objective', target: 'a', label: over('edgeLabel') }],
        notes: [{ kind: 'risk', text: over('note') }, { kind: 'decision', text: over('note') }],
      },
      5,
    )
    expect(graph.summary).toHaveLength(ARCHITECT_TEXT_LIMITS.summary.max)
    expect(graph.notes[0]!.text).toHaveLength(ARCHITECT_TEXT_LIMITS.note.max)
    expect(architectGraphSchema.safeParse(graph).success).toBe(true)
    expect(warnings).toEqual(
      expect.arrayContaining([
        'título: 1 corte(s) no teto de proteção de 160 caracteres',
        'resumo: 1 corte(s) no teto de proteção de 2.000 caracteres',
        'rótulo de grupo: 1 corte(s) no teto de proteção de 80 caracteres',
        'descrição de grupo: 1 corte(s) no teto de proteção de 600 caracteres',
        'rótulo de nó: 1 corte(s) no teto de proteção de 120 caracteres',
        'rótulo de aresta: 1 corte(s) no teto de proteção de 80 caracteres',
        'nota: 2 corte(s) no teto de proteção de 1.000 caracteres',
      ]),
    )
  })
})

describe('diagrama de ideias', () => {
  it.each(['src/a.tsx', 'useArchitectTab', 'runDiagram()', 'architect_diagrams', 'GET /api/x', 'ArchitectTab.tsx', 'features/architect-agent'])('reconhece código: %s', (text) => {
    expect(looksLikeCode(text)).toBe(true)
  })

  it.each(['Aprovação do plano', 'Pusher', 'Histórico de versões', 'OpenCode', 'GitHub', 'Dono aprova o plano', 'Serviço de e-mail'])('não marca texto comum: %s', (text) => {
    expect(looksLikeCode(text)).toBe(false)
  })

  it('a correção é pedida com um terço ou mais dos rótulos com cara de código', () => {
    const code = (count: number, total: number) => sanitizeGraph({ nodes: [node('objective', { kind: 'objective', label: 'Objetivo do plano' }), ...Array.from({ length: total - 1 }, (_, index) => node(`n${index}`, { label: index < count ? `runStep${index}` : `Etapa ${index}` }))] }, 5)
    expect(needsIdeaRepair(code(4, 12))).toBe(true)
    expect(needsIdeaRepair(code(2, 12))).toBe(false)
    expect(needsIdeaRepair(code(0, 12))).toBe(false)
  })

  it('versão antiga (diagrama de código) é normalizada ao ler, sem arquivos e sem cortar pelos tetos novos', () => {
    const old = legacyGraph() as unknown as ArchitectGraph
    const big = { ...old, nodes: [...old.nodes, ...Array.from({ length: 30 }, (_, index) => ({ id: `x${index}`, label: `X${index}`, groupId: null, kind: 'module', detail: '', files: ['src/x.ts'], status: 'existing' }))] } as unknown as ArchitectGraph
    const normalized = normalizeLegacyGraph(big)
    expect(normalized.nodes).toHaveLength(35)
    expect(normalized.nodes.every((item) => item.files.length === 0)).toBe(true)
    expect(normalized.nodes.slice(0, 5).map((item) => item.kind)).toEqual(['objective', 'structure', 'process', 'information', 'structure'])
    expect(normalized.groups.map((group) => group.layer)).toEqual(['people', 'processes', 'information'])
    expect(normalized.edges.map((edge) => edge.kind)).toEqual(['notifies', 'produces'])
  })
})
