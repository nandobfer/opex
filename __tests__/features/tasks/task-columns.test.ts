import { beforeEach, describe, expect, it, vi } from 'vitest'

type Doc = Record<string, unknown>

/** Coleção em memória com o subconjunto de Mongoose usado por `server/columns.ts`. */
function fakeModel() {
  const docs: Doc[] = []
  const matches = (doc: Doc, filter: Doc) =>
    Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === 'object' && '$in' in (value as Doc)) return ((value as { $in: unknown[] }).$in).includes(doc[key])
      if (value && typeof value === 'object' && '$ne' in (value as Doc)) return doc[key] !== (value as { $ne: unknown }).$ne
      return doc[key] === value
    })
  const query = (result: () => unknown) => {
    const chain = {
      sort: (spec: Record<string, 1 | -1>) => {
        const [[field, dir]] = Object.entries(spec)
        const inner = result
        return query(() => {
          const value = inner()
          return Array.isArray(value) ? [...value].sort((a, b) => ((a as Doc)[field!] as number) > ((b as Doc)[field!] as number) ? dir! : -dir!) : value
        })
      },
      select: () => chain,
      lean: async () => result(),
      then: (resolve: (v: unknown) => void) => resolve(result()),
    }
    // `findOne().sort()` precisa do primeiro depois de ordenar.
    return chain
  }
  return {
    docs,
    find: (filter: Doc = {}) => query(() => docs.filter((doc) => matches(doc, filter))),
    findOne: (filter: Doc) => {
      const base = query(() => docs.find((doc) => matches(doc, filter)) ?? null)
      return {
        ...base,
        sort: (spec: Record<string, 1 | -1>) => query(() => {
          const [[field, dir]] = Object.entries(spec)
          return docs.filter((doc) => matches(doc, filter)).sort((a, b) => ((a[field!] as number) > (b[field!] as number) ? dir! : -dir!))[0] ?? null
        }),
      }
    },
    create: async (doc: Doc) => {
      docs.push({ createdAt: new Date(), ...doc })
      return docs.at(-1)!
    },
    updateOne: async (filter: Doc, update: { $set: Doc }, options?: { upsert?: boolean }) => {
      const found = docs.find((doc) => matches(doc, filter))
      if (found) Object.assign(found, update.$set)
      else if (options?.upsert) docs.push({ ...filter, ...update.$set })
    },
    findOneAndUpdate: (filter: Doc, update: { $set: Doc }, options?: { upsert?: boolean; returnDocument?: string }) => query(() => {
      const found = docs.find((doc) => matches(doc, filter))
      const before = found ? { ...found } : null
      if (found) Object.assign(found, update.$set)
      else if (options?.upsert) docs.push({ ...filter, ...update.$set })
      return options?.returnDocument === 'before' ? before : docs.find((doc) => matches(doc, filter)) ?? null
    }),
    findOneAndDelete: (filter: Doc) => query(() => {
      const index = docs.findIndex((doc) => matches(doc, filter))
      return index === -1 ? null : docs.splice(index, 1)[0]
    }),
    deleteOne: async (filter: Doc) => {
      const index = docs.findIndex((doc) => matches(doc, filter))
      if (index !== -1) docs.splice(index, 1)
    },
    deleteMany: async (filter: Doc) => {
      for (let i = docs.length - 1; i >= 0; i--) if (matches(docs[i]!, filter)) docs.splice(i, 1)
    },
  }
}

const mocks = vi.hoisted(() => ({ recordAudit: vi.fn(), publish: vi.fn(), models: {} as Record<string, ReturnType<typeof fakeModel>>, linkedRepos: [] as string[] }))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', MOVER: 'MOVER' } }))
vi.mock('@/lib/pusher/channels', () => ({ appChannel: () => 'private-app', publishToChannels: mocks.publish }))
vi.mock('@/lib/db/models/TaskBoard', () => ({
  get TaskBoardColumn() { return mocks.models.columns },
  get TaskBoardLayout() { return mocks.models.layout },
  get TaskLocalState() { return mocks.models.states },
}))
vi.mock('@/lib/db/models/Github', () => ({
  get TaskDraft() { return mocks.models.drafts },
}))
vi.mock('@/features/github/server/links', () => ({ linksUsingColumn: async () => mocks.linkedRepos }))

import { buildBoardColumns, mergeVisibleOrder, normalizeLayout, placeColumnAfter } from '@/features/tasks/board'
import { applyLocalStates, createColumn, deleteColumn, getBoard, reorderColumns, setLocalColumn } from '@/features/tasks/server/columns'
import { planBulkMove } from '@/features/tasks/bulk-items'
import type { TaskDto } from '@/features/tasks/types'

const GO = ['backlog', 'prioritized', 'specification', 'development', 'validation', 'awaiting_production', 'in_production']
const input = { name: 'Aguardando cliente', color: 'amber' as const, icon: 'hourglass' as const, description: '', wipLimit: 3 }

const task = (id: string, overrides: Partial<TaskDto> = {}): TaskDto => ({
  id, code: `GO-DEV-${id}`, title: id, status: 'development', order: 0, taskType: 'feature', priority: 'medium', product: null, workPackage: null,
  assignee: null, commitUrl: null, pullRequestUrl: null, archived: false, createdAt: null, updatedAt: null, localColumn: null, localOrder: null, ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.models = { columns: fakeModel(), layout: fakeModel(), states: fakeModel(), drafts: fakeModel() }
  mocks.linkedRepos = []
})

describe('ordem das colunas (puro)', () => {
  it('normalizeLayout: Go! Sipal sempre todas e em ordem; customizadas presas à coluna anterior', () => {
    expect(normalizeLayout([], [])).toEqual(GO)
    const layout = normalizeLayout(['custom-aaaaaa', 'validation', 'backlog', 'custom-bbbbbb', 'xpto', 'custom-bbbbbb'], ['custom-aaaaaa', 'custom-bbbbbb', 'custom-cccccc'])
    expect(layout).toEqual(['custom-aaaaaa', 'backlog', 'custom-bbbbbb', ...GO.slice(1), 'custom-cccccc'])
  })

  it('placeColumnAfter e mergeVisibleOrder (com colunas escondidas pelo filtro)', () => {
    expect(placeColumnAfter(['a', 'b', 'c'], 'x', 'a')).toEqual(['a', 'x', 'b', 'c'])
    expect(placeColumnAfter(['a', 'b'], 'x')).toEqual(['a', 'b', 'x'])
    expect(mergeVisibleOrder(['a', 'b', 'c', 'd'], ['d', 'b'])).toEqual(['a', 'd', 'c', 'b'])
  })

  it('buildBoardColumns marca Go! Sipal x pessoais', () => {
    const columns = buildBoardColumns({ columns: [{ key: 'custom-aaaaaa', ...input, description: null }], layout: ['backlog', 'custom-aaaaaa'] })
    expect(columns.map((c) => c.kind)).toEqual(['go', 'custom', 'go', 'go', 'go', 'go', 'go', 'go'])
    expect(columns[1]).toMatchObject({ label: 'Aguardando cliente', border: 'border-t-amber-400' })
  })
})

describe('colunas customizadas (servidor)', () => {
  it('cria depois da coluna escolhida, audita e avisa a tela', async () => {
    const column = await createColumn({ ...input, afterKey: 'development' }, 'local')
    expect(column.key).toMatch(/^custom-[a-z0-9]{12}$/)
    expect(column).toMatchObject({ name: 'Aguardando cliente', wipLimit: 3, description: null })
    const board = await getBoard()
    expect(board.layout.indexOf(column.key)).toBe(board.layout.indexOf('development') + 1)
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'ColunaTarefas', acao: 'CRIAR' }))
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'task-columns-updated', {})
  })

  it('reordenar: precisa das mesmas colunas (409 se mudaram); Go! Sipal ficam em ordem', async () => {
    const column = await createColumn({ ...input, afterKey: null }, 'local')
    const board = await reorderColumns([column.key, ...[...GO].reverse()], 'local')
    expect(board.layout).toEqual([column.key, ...GO])
    await expect(reorderColumns(GO, 'local')).rejects.toMatchObject({ status: 409, code: 'COLUMNS_CHANGED' })
  })

  it('excluir: só vazia (409 com os códigos)', async () => {
    const column = await createColumn({ ...input, afterKey: null }, 'local')
    await setLocalColumn('t1', column.key, 'development', 'GO-DEV-1')
    await expect(deleteColumn(column.key, 'local')).rejects.toMatchObject({ status: 409, code: 'COLUMN_NOT_EMPTY', message: expect.stringContaining('GO-DEV-1') })
    mocks.models.states.docs.length = 0
    await deleteColumn(column.key, 'local')
    expect((await getBoard()).columns).toHaveLength(0)
    await expect(deleteColumn('custom-naoexiste', 'local')).rejects.toMatchObject({ status: 404 })
  })

  it('excluir: coluna de entrada de um vínculo do GitHub (409 COLUMN_IN_USE) ou com rascunhos (409 COLUMN_NOT_EMPTY)', async () => {
    const column = await createColumn({ ...input, afterKey: null }, 'local')
    mocks.linkedRepos = ['sipal/app']
    await expect(deleteColumn(column.key, 'local')).rejects.toMatchObject({ status: 409, code: 'COLUMN_IN_USE', message: expect.stringContaining('sipal/app') })
    mocks.linkedRepos = []
    await mocks.models.drafts.create({ columnKey: column.key, state: 'draft', repo: 'sipal/app', number: 12 })
    await expect(deleteColumn(column.key, 'local')).rejects.toMatchObject({ status: 409, code: 'COLUMN_NOT_EMPTY', message: expect.stringContaining('app#12') })
    mocks.models.drafts.docs[0]!.state = 'discarded'
    await deleteColumn(column.key, 'local')
    expect((await getBoard()).columns).toHaveLength(0)
  })

  it('status mudou no Go! Sipal: a tarefa volta para a coluna do status e é avisada', async () => {
    const column = await createColumn({ ...input, afterKey: null }, 'local')
    await setLocalColumn('t1', column.key, 'development', 'GO-DEV-t1', 5)
    await setLocalColumn('t2', column.key, 'development', 'GO-DEV-t2')
    const { tasks, returned } = await applyLocalStates([task('t1'), task('t2', { status: 'validation' }), task('t3')])
    expect(tasks.map((t) => t.localColumn)).toEqual([column.key, null, null])
    expect(tasks[0]!.localOrder).toBe(5)
    expect(returned).toEqual([{ id: 't2', code: 'GO-DEV-t2', status: 'validation', columnName: 'Aguardando cliente' }])
    expect(mocks.models.states.docs.map((doc) => doc.taskId)).toEqual(['t1'])
  })
})

describe('lote para coluna pessoal', () => {
  it('local-move sem URL nem bloqueio de Em Produção; desfazer volta para onde estava', () => {
    const tasks = [task('1'), task('2', { status: 'in_production' }), task('3', { localColumn: 'custom-outra000', localOrder: 2 })]
    const plan = planBulkMove(tasks, 'custom-aaaaaa')
    expect(plan.items.map((item) => item.action)).toEqual([
      { type: 'local-move', column: 'custom-aaaaaa' },
      { type: 'local-move', column: 'custom-aaaaaa' },
      { type: 'local-move', column: 'custom-aaaaaa' },
    ])
    expect(plan.items[0]!.undo?.action).toEqual({ type: 'move', targetStatus: 'development' })
    expect(plan.items[2]!.undo?.action).toEqual({ type: 'local-move', column: 'custom-outra000', order: 2 })
  })

  it('de coluna pessoal para a coluna do mesmo status do Go! Sipal: só sai da pessoal', () => {
    const plan = planBulkMove([task('1', { localColumn: 'custom-aaaaaa' })], 'development')
    expect(plan.items[0]!.patch).toMatchObject({ status: 'development', localColumn: null })
  })
})
