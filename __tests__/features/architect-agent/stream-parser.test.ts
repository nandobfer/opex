import { describe, expect, it } from 'vitest'
import { ARCHITECT_DEPTH_DEFS, ARCHITECT_LIVE_CAP_FACTOR } from '@/features/architect-agent/constants'
import { applyOps, createGraphAssembler, emptyDraft } from '@/features/architect-agent/stream-parser'
import { sanitizeGraph } from '@/features/architect-agent/sanitize'
import { sampleGraph } from './fixtures'

/**
 * Diagrama ao vivo: o montador aplica só linhas completas dentro de ```architect, valida cada uma,
 * guarda arestas pendentes, mescla nós repetidos e devolve as operações que a tela aplica igual.
 */

const line = (value: unknown) => `${JSON.stringify(value)}\n`
const block = (...items: unknown[]) => `\`\`\`architect\n${items.map(line).join('')}\`\`\`\n`

describe('createGraphAssembler', () => {
  it('uma linha quebrada entre pedaços só entra quando fecha', () => {
    const assembler = createGraphAssembler({ depth: 3 })
    const text = block({ op: 'node', id: 'objective', label: 'Objetivo', kind: 'objective', status: 'new' })
    const cut = text.indexOf('"label"')
    expect(assembler.push(text.slice(0, cut))).toEqual([])
    expect(assembler.draft.nodes).toHaveLength(0)
    const ops = assembler.push(text.slice(cut))
    expect(ops).toEqual([{ op: 'node', node: expect.objectContaining({ id: 'objective', kind: 'objective' }) }])
    expect(assembler.draft.nodes).toHaveLength(1)
  })

  it('ignora o texto fora dos blocos e aceita vários blocos ao longo do turno', () => {
    const assembler = createGraphAssembler({ depth: 3 })
    assembler.push('Vou ler o plano.\n{"op":"node","id":"fora","label":"Fora"}\n')
    assembler.push(block({ op: 'meta', title: 'Arquitetura' }, { op: 'node', id: 'a', label: 'A' }))
    assembler.push('Lendo src/a.ts…\n')
    assembler.push(block({ op: 'node', id: 'b', label: 'B' }, { op: 'done' }))
    expect(assembler.draft.nodes.map((node) => node.id)).toEqual(['a', 'b'])
    expect(assembler.draft.title).toBe('Arquitetura')
    expect(assembler.sawBlock).toBe(true)
  })

  it('linha inválida é descartada com aviso, sem derrubar a geração', () => {
    const assembler = createGraphAssembler({ depth: 3 })
    assembler.push('```architect\n{"op":"node","id":"a","label":"A"}\n{nada disso}\n{"op":"voar"}\n{"op":"node","id":"b","label":"B"}\n```\n')
    assembler.finish()
    expect(assembler.draft.nodes.map((node) => node.id)).toEqual(['a', 'b'])
    expect(assembler.warnings).toContain('2 linha(s) inválida(s) do diagrama ao vivo descartada(s)')
  })

  it('aresta antes do nó de destino fica pendente e entra quando ele chega; a que nunca chega sai no fim', () => {
    const assembler = createGraphAssembler({ depth: 3 })
    assembler.push(block({ op: 'node', id: 'a', label: 'A' }, { op: 'edge', source: 'a', target: 'b', kind: 'uses' }, { op: 'edge', source: 'a', target: 'nunca' }))
    expect(assembler.draft.edges).toHaveLength(0)
    const ops = assembler.push(block({ op: 'node', id: 'b', label: 'B' }))
    expect(ops.map((op) => op.op)).toEqual(['node', 'edge'])
    expect(assembler.draft.edges).toEqual([expect.objectContaining({ source: 'a', target: 'b', kind: 'uses' })])
    assembler.finish()
    expect(assembler.warnings).toContain('1 aresta(s) com nó inexistente descartada(s)')
  })

  it('nó repetido mescla os campos (o mais recente vence); grupo que chega depois é aplicado ao nó', () => {
    const assembler = createGraphAssembler({ depth: 3 })
    assembler.push(block({ op: 'node', id: 'a', label: 'Aba', groupId: 'g-ui', status: 'existing', detail: 'antes' }))
    expect(assembler.draft.nodes[0]).toEqual(expect.objectContaining({ groupId: null, status: 'existing' }))
    assembler.push(block({ op: 'group', id: 'g-ui', label: 'UI', layer: 'ui' }, { op: 'node', id: 'a', status: 'changed', files: ['src/a.tsx'] }))
    expect(assembler.draft.nodes).toEqual([expect.objectContaining({ id: 'a', label: 'Aba', groupId: 'g-ui', status: 'changed', detail: 'antes', files: ['src/a.tsx'] })])
  })

  it('remove tira o nó e as arestas dele', () => {
    const assembler = createGraphAssembler({ depth: 3 })
    assembler.push(block({ op: 'node', id: 'a', label: 'A' }, { op: 'node', id: 'b', label: 'B' }, { op: 'edge', source: 'a', target: 'b' }, { op: 'remove', id: 'b' }))
    expect(assembler.draft.nodes.map((node) => node.id)).toEqual(['a'])
    expect(assembler.draft.edges).toHaveLength(0)
  })

  it('teto com folga durante a geração; o corte exato com prioridade fica para o saneamento final', () => {
    const assembler = createGraphAssembler({ depth: 1 })
    const soft = Math.ceil(ARCHITECT_DEPTH_DEFS[1].maxNodes * ARCHITECT_LIVE_CAP_FACTOR)
    const nodes = Array.from({ length: soft + 3 }, (_, index) => ({ op: 'node', id: `n${index}`, label: `N${index}`, status: index === soft - 2 ? 'new' : 'existing' }))
    assembler.push(block({ op: 'node', id: 'objective', label: 'O', kind: 'objective' }, ...nodes))
    assembler.finish()
    expect(assembler.draft.nodes).toHaveLength(soft)
    expect(assembler.overflow).toBe(4)
    const final = sanitizeGraph(assembler.draft, 1)
    expect(final.graph.nodes).toHaveLength(ARCHITECT_DEPTH_DEFS[1].maxNodes)
    expect(final.graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(['objective', `n${soft - 2}`]))
  })

  it('ajuste: parte do grafo anterior e aplica as diferenças; reset recomeça dele', () => {
    const assembler = createGraphAssembler({ depth: 3, base: sampleGraph() })
    assembler.push(block({ op: 'remove', id: 'pusher' }, { op: 'node', id: 'auth', label: 'Autenticação', status: 'new' }, { op: 'edge', source: 'route', target: 'auth', kind: 'flow' }))
    expect(assembler.draft.nodes.map((node) => node.id)).not.toContain('pusher')
    expect(assembler.draft.edges.some((edge) => edge.target === 'auth')).toBe(true)
    const [reset] = assembler.reset()
    expect(reset).toEqual({ op: 'reset', graph: sampleGraph() })
    expect(assembler.draft.nodes.map((node) => node.id)).toContain('pusher')
  })

  it('a tela chega ao mesmo rascunho aplicando as operações devolvidas', () => {
    const assembler = createGraphAssembler({ depth: 3 })
    let screenGraph = emptyDraft()
    const text = block({ op: 'meta', title: 'T', summary: 'S' }, { op: 'node', id: 'objective', label: 'O', kind: 'objective' }, { op: 'group', id: 'g', label: 'G' }, { op: 'node', id: 'a', label: 'A', groupId: 'g' }, { op: 'edge', source: 'objective', target: 'a' }, { op: 'note', kind: 'risk', text: 'Risco' })
    for (let index = 0; index < text.length; index += 7) screenGraph = applyOps(screenGraph, assembler.push(text.slice(index, index + 7)))
    screenGraph = applyOps(screenGraph, assembler.finish())
    expect(screenGraph).toEqual(assembler.draft)
    expect(screenGraph.notes).toEqual([{ kind: 'risk', text: 'Risco' }])
  })
})

describe('cortes de texto ao vivo', () => {
  it('o corte acima do teto de proteção vira aviso no fim, uma vez por linha recebida', () => {
    const assembler = createGraphAssembler({ depth: 5 })
    const long = 'x'.repeat(9_000)
    assembler.push(block({ op: 'node', id: 'a', label: 'A', detail: long }, { op: 'node', id: 'a', status: 'changed' }, { op: 'note', kind: 'risk', text: 'r'.repeat(1_200) }))
    assembler.finish()
    expect(assembler.draft.nodes[0]!.detail).toHaveLength(8_000)
    expect(assembler.warnings).toEqual(expect.arrayContaining(['descrição de nó: 1 corte(s) no teto de proteção de 8.000 caracteres', 'nota: 1 corte(s) no teto de proteção de 1.000 caracteres']))
  })
})
