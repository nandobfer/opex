import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Entrega do diagrama ao vivo: stream NDJSON com retrato (seq) e depois as operações na ordem, fim
 * com o estado final; sem geração viva, o retrato vem do rascunho gravado. No cliente, reconectar
 * recomeça pelo retrato sem perder nem repetir operações, e linha incompleta não entra.
 */

const mocks = vi.hoisted(() => ({ getDiagram: vi.fn() }))
vi.mock('@/features/architect-agent/server/diagrams', () => ({ getDiagram: mocks.getDiagram }))

import { openDiagramStream } from '@/features/architect-agent/server/stream'
import { closeLive, emitOps, emitProgress, openLive } from '@/features/architect-agent/server/live-hub'
import { applyOps, emptyDraft, type AppliedOp } from '@/features/architect-agent/stream-parser'
import { LIVE_INITIAL, reduceLiveLine, splitLiveLines } from '@/features/architect-agent/hooks/useLiveDiagram'
import type { ArchitectStreamLine } from '@/features/architect-agent/types'
import { sampleGraph } from './fixtures'

const node = (id: string): AppliedOp => ({ op: 'node', node: { id, label: id.toUpperCase(), groupId: null, kind: 'module', detail: '', files: [], status: 'new' } })

async function readLines(response: Response, until: (lines: ArchitectStreamLine[]) => boolean, act?: () => void): Promise<ArchitectStreamLine[]> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const lines: ArchitectStreamLine[] = []
  let acted = false
  while (!until(lines)) {
    if (!acted && lines.length && act) {
      acted = true
      act()
    }
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = splitLiveLines(buffer)
    buffer = parsed.rest
    lines.push(...parsed.lines)
  }
  return lines
}

const dto = (overrides: Record<string, unknown> = {}) => ({ id: 'd1', state: 'running', phase: 'writing', tools: 2, graph: null, draft: null, ...overrides })

beforeEach(() => {
  mocks.getDiagram.mockReset()
})

describe('openDiagramStream', () => {
  it('conectar no meio da geração: retrato com o seq atual, depois as operações na ordem e o fim', async () => {
    mocks.getDiagram.mockResolvedValue(dto())
    openLive('d1', emptyDraft())
    emitOps('d1', [node('objective')])
    emitOps('d1', [node('a')])
    const response = await openDiagramStream('d1', new AbortController().signal)
    expect(response.headers.get('Content-Type')).toContain('application/x-ndjson')
    const lines = await readLines(
      response,
      (current) => current.some((line) => line.type === 'end'),
      () => {
        emitProgress('d1', { tools: 5 })
        emitOps('d1', [node('b')])
        emitOps('d1', [{ op: 'remove', id: 'a' }])
        closeLive('d1', 'done')
      },
    )
    const [snapshot, ...rest] = lines
    expect(snapshot).toMatchObject({ type: 'snapshot', seq: 2, live: true })
    expect((snapshot as Extract<ArchitectStreamLine, { type: 'snapshot' }>).graph.nodes.map((item) => item.id)).toEqual(['objective', 'a'])
    expect(rest.map((line) => line.type)).toEqual(['progress', 'ops', 'ops', 'end'])
    expect(rest.filter((line) => line.type === 'ops').map((line) => (line as { seq: number }).seq)).toEqual([3, 4])
    expect(rest.at(-1)).toEqual({ type: 'end', state: 'done' })
  })

  it('sem geração viva neste processo: retrato do rascunho gravado e fim com o estado da versão', async () => {
    mocks.getDiagram.mockResolvedValue(dto({ state: 'failed', draft: sampleGraph() }))
    const lines = await readLines(await openDiagramStream('d2', new AbortController().signal), (current) => current.some((line) => line.type === 'end'))
    expect(lines[0]).toMatchObject({ type: 'snapshot', live: false, progress: { nodes: 6, edges: 5 } })
    expect(lines[1]).toEqual({ type: 'end', state: 'failed' })
  })

  it('versão inexistente: o erro de domínio (404) sobe para a rota', async () => {
    mocks.getDiagram.mockRejectedValue(Object.assign(new Error('Versão do diagrama não encontrada'), { status: 404 }))
    await expect(openDiagramStream('nada', new AbortController().signal)).rejects.toMatchObject({ status: 404 })
  })
})

describe('cliente do stream', () => {
  it('linha incompleta não entra antes de fechar', () => {
    const first = splitLiveLines('{"type":"ops","seq":1,"ops":[]}\n{"type":"ops","se')
    expect(first.lines).toHaveLength(1)
    expect(first.rest).toBe('{"type":"ops","se')
    expect(splitLiveLines(`${first.rest}q":2,"ops":[]}\n`).lines).toEqual([{ type: 'ops', seq: 2, ops: [] }])
  })

  it('queda e reconexão: o retrato novo substitui o estado e nada se perde nem se repete', () => {
    const progress = { phase: 'writing' as const, tools: 1, nodes: 1, edges: 0 }
    let state = reduceLiveLine(LIVE_INITIAL, { type: 'snapshot', seq: 1, live: true, graph: applyOps(emptyDraft(), [node('objective')]), progress })
    state = reduceLiveLine(state, { type: 'ops', seq: 2, ops: [node('a')] })
    // Cai a conexão; enquanto isso o servidor aplicou b (seq 3). Reconecta: retrato com o seq 3.
    const server = applyOps(state.graph!, [node('b')])
    state = reduceLiveLine(state, { type: 'snapshot', seq: 3, live: true, graph: server, progress })
    // Operação repetida (seq antigo) é ignorada; a nova entra.
    state = reduceLiveLine(state, { type: 'ops', seq: 3, ops: [node('b')] })
    state = reduceLiveLine(state, { type: 'ops', seq: 4, ops: [node('c')] })
    expect(state.graph!.nodes.map((item) => item.id)).toEqual(['objective', 'a', 'b', 'c'])
    expect(state.seq).toBe(4)
    expect(reduceLiveLine(state, { type: 'end', state: 'done' }).ended).toBe(true)
  })
})
