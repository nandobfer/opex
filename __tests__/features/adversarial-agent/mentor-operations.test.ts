import { describe, expect, it } from 'vitest'
import { parseWriterOps, resolveWriterOps, type WriterMemory } from '@/features/adversarial-agent/mentor/operations'

/** OPE-165: operações do redator (criar, atualizar, fundir, arquivar) e a proteção da memória do dono. */

const memories: WriterMemory[] = [
  { id: 'm_a', summary: 'A', text: 'Regra A', version: 3, owner: false },
  { id: 'm_b', summary: 'B', text: 'Regra B', version: 1, owner: false },
  { id: 'm_dono', summary: 'Dono', text: 'Do dono', version: 7, owner: true },
]
const resolve = (answer: unknown) => resolveWriterOps(parseWriterOps(JSON.stringify(answer))!, memories, ['m_outra'])

describe('operações do redator do Agente Mentor', () => {
  it('lê várias operações e usa a versão LIDA da lista (nunca a do modelo)', () => {
    const result = resolve({ operations: [{ op: 'create', text: 'Regra nova', category: 'PROJECT_RULES' }, { op: 'update', memoryId: 'm_a', version: 99, text: 'Regra A melhor' }, { op: 'archive', memoryId: 'm_b', reason: 'obsoleta' }] })
    expect(result.kind).toBe('operations')
    if (result.kind !== 'operations') return
    expect(result.operations.map((item) => [item.op, item.memoryId, item.version])).toEqual([
      ['create', null, null],
      ['update', 'm_a', 3],
      ['archive', 'm_b', 1],
    ])
    expect(result.operations[0]!.category).toBe('PROJECT_RULES')
  })

  it('fusão: a que recebe fica, as absorvidas (com a versão lida) serão arquivadas', () => {
    const result = resolve({ operations: [{ op: 'merge', into: 'm_a', absorb: [{ memoryId: 'm_b' }, { memoryId: 'm_b' }], text: 'Regra unificada' }] })
    expect(result).toMatchObject({ kind: 'operations', operations: [{ op: 'merge', memoryId: 'm_a', version: 3, absorb: [{ memoryId: 'm_b', version: 1 }] }] })
  })

  it('memória do dono: pode ser atualizada e receber a fusão; nunca arquivada nem absorvida', () => {
    expect(resolve({ operations: [{ op: 'update', memoryId: 'm_dono', text: 'Do dono, completa' }] }).kind).toBe('operations')
    expect(resolve({ operations: [{ op: 'merge', into: 'm_dono', absorb: [{ memoryId: 'm_a' }], text: 'Unificada' }] }).kind).toBe('operations')
    const archive = resolve({ operations: [{ op: 'archive', memoryId: 'm_dono', reason: 'x' }] })
    expect(archive).toMatchObject({ kind: 'rejected' })
    if (archive.kind === 'rejected') expect(archive.rejection).toContain('escrita pelo dono')
    expect(resolve({ operations: [{ op: 'merge', into: 'm_a', absorb: [{ memoryId: 'm_dono' }], text: 'Unificada' }] }).kind).toBe('rejected')
  })

  it('não existe excluir: a operação delete é recusada pelo formato', () => {
    expect(parseWriterOps(JSON.stringify({ operations: [{ op: 'delete', memoryId: 'm_a' }] }))).toBeNull()
  })

  it('update de memória que não existe vira create; arquivar fora da lista e repetir a mesma memória são recusados', () => {
    expect(resolve({ operations: [{ op: 'update', memoryId: 'm_sumiu', text: 'Regra' }] })).toMatchObject({ kind: 'operations', operations: [{ op: 'create', memoryId: null }] })
    expect(resolve({ operations: [{ op: 'archive', memoryId: 'm_outra', reason: 'x' }] }).kind).toBe('rejected')
    expect(resolve({ operations: [{ op: 'update', memoryId: 'm_a', text: 'x1x' }, { op: 'archive', memoryId: 'm_a' }] }).kind).toBe('rejected')
  })

  it('skip: cobertura só com uma memória da lista de destino; sem operações nem skip, recusa', () => {
    expect(resolve({ operations: [], skip: { kind: 'covered', memoryId: 'm_a', reason: 'já coberta' } })).toEqual({ kind: 'skip', skipKind: 'covered', memoryId: 'm_a', reason: 'já coberta' })
    expect(resolve({ operations: [], skip: { kind: 'covered', memoryId: 'm_outra' } }).kind).toBe('rejected')
    expect(resolve({ operations: [], skip: { kind: 'no_lesson' } })).toMatchObject({ kind: 'skip', skipKind: 'no_lesson', memoryId: null })
    expect(resolve({ operations: [] }).kind).toBe('rejected')
  })
})
