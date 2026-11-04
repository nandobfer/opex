import { describe, expect, it } from 'vitest'
import { buildBoardColumns, columnBorderStyle, columnDotStyle, mergeVisibleOrder, normalizeLayout, placeColumnAfter, type TaskBoardDto } from '@/features/tasks/board'

const board = (columns: TaskBoardDto['columns'], layout: string[]): TaskBoardDto => ({ columns, layout })
const column = (key: string, name = key, overrides: Partial<TaskBoardDto['columns'][number]> = {}) => ({
  key,
  name,
  color: '#A78BFA',
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

  it('cor inválida ou ausente cai na cor padrão das colunas (Violeta)', () => {
    const [view] = buildBoardColumns(board([column('x', 'X', { color: 'magenta' })], ['x']))
    expect(view!.accent).toBe('#A78BFA')
  })

  it('buildBoardColumns segue a ordem salva e monta a cor/ícone', () => {
    const columns = buildBoardColumns(board([column('todo', 'A Fazer', { color: '#A1A1AA', icon: 'inbox' }), column('col-1', 'Revisar', { color: 'sky', icon: 'eye', wipLimit: 2 })], ['col-1', 'todo']))
    expect(columns.map((c) => c.key)).toEqual(['col-1', 'todo'])
    // Nome antigo da paleta (`sky`) vira o hex do tom 400; a borda e o bullet vão por style.
    expect(columns[0]).toMatchObject({ label: 'Revisar', accent: '#38BDF8', column: { wipLimit: 2 } })
    expect(columnBorderStyle(columns[0]!)).toEqual({ borderTopColor: '#38BDF8' })
    expect(columnDotStyle(columns[1]!)).toEqual({ backgroundColor: '#A1A1AA' })
    expect(buildBoardColumns(undefined)).toEqual([])
  })
})
