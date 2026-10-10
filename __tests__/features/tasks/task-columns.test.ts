import { describe, expect, it } from 'vitest'
import { buildBoardColumns, COLUMN_COLOR_STYLES, mergeVisibleOrder, normalizeLayout, placeColumnAfter, type TaskBoardDto } from '@/features/tasks/board'

const board = (columns: TaskBoardDto['columns'], layout: string[]): TaskBoardDto => ({ columns, layout })
const column = (key: string, name = key, overrides: Partial<TaskBoardDto['columns'][number]> = {}) => ({
  key,
  name,
  color: 'violet' as const,
  icon: 'star' as const,
  description: null,
  wipLimit: null,
  ...overrides,
})

describe('ordem das colunas (puro)', () => {
  it('normalizeLayout tira chaves desconhecidas/repetidas e completa com as que faltam', () => {
    expect(normalizeLayout(['b', 'a'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c'])
    expect(normalizeLayout(['a', 'a', 'x'], ['a', 'b'])).toEqual(['a', 'b'])
    expect(normalizeLayout([], [])).toEqual([])
  })

  it('placeColumnAfter e mergeVisibleOrder (com colunas escondidas pelo filtro)', () => {
    expect(placeColumnAfter(['a', 'b', 'c'], 'x', 'a')).toEqual(['a', 'x', 'b', 'c'])
    expect(placeColumnAfter(['a', 'b'], 'x')).toEqual(['a', 'b', 'x'])
    expect(placeColumnAfter(['a', 'b'], 'x', 'inexistente')).toEqual(['a', 'b', 'x'])
    expect(mergeVisibleOrder(['a', 'b', 'c', 'd'], ['d', 'b'])).toEqual(['a', 'd', 'c', 'b'])
  })

  it('buildBoardColumns segue a ordem salva e monta a cor/ícone', () => {
    const columns = buildBoardColumns(board([column('todo', 'A Fazer', { color: 'zinc', icon: 'inbox' }), column('col-1', 'Revisar', { color: 'sky', icon: 'eye', wipLimit: 2 })], ['col-1', 'todo']))
    expect(columns.map((c) => c.key)).toEqual(['col-1', 'todo'])
    expect(columns[0]).toMatchObject({ label: 'Revisar', border: COLUMN_COLOR_STYLES.sky.border, dot: COLUMN_COLOR_STYLES.sky.dot, column: { wipLimit: 2 } })
    expect(buildBoardColumns(undefined)).toEqual([])
  })
})
