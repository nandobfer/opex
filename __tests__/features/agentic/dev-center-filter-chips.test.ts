import { describe, expect, it } from 'vitest'
import { activeDevCenterFilterChips } from '@/features/agentic/dev-center-filter-chips'
import { DEFAULT_DEV_CENTER_FILTERS, type DevCenterFilters } from '@/features/agentic/dev-center-filters'

const columns = new Map([
  ['todo', 'A Fazer'],
  ['doing', 'Em andamento'],
  ['review', 'Revisão'],
  ['done', 'Concluído'],
])
const ctx = { columns, centralName: null }
const filters = (patch: Partial<DevCenterFilters> = {}): DevCenterFilters => ({ ...DEFAULT_DEV_CENTER_FILTERS, ...patch })

describe('chips do resumo dos filtros da coluna Tarefas', () => {
  it('filtros padrão em "Todos os projetos" não geram chip', () => {
    expect(activeDevCenterFilterChips(filters(), ctx)).toEqual([])
  })

  it('todas as colunas marcadas (allColumns) não geram chip', () => {
    expect(activeDevCenterFilterChips(filters({ columns: [...columns.keys()], allColumns: true }), ctx)).toEqual([])
  })

  it('cada filtro fora do padrão vira um chip com o patch que o remove, na ordem projeto → ativas → colunas → estado → busca', () => {
    const chips = activeDevCenterFilterChips(filters({ activeOnly: true, columns: ['doing'], allColumns: false, states: ['planning'], search: '  OPE-1 ' }), { columns, centralName: 'Opex' })
    expect(chips.map((chip) => [chip.key, chip.label, chip.remove])).toEqual([
      ['central', 'Projeto: Opex', null],
      ['activeOnly', 'Só mesas ativas', { activeOnly: false }],
      ['columns', 'Colunas: Em andamento', { columns: [], allColumns: undefined }],
      ['states', 'Estado: Planejando', { states: [] }],
      ['search', 'Busca: "OPE-1"', { search: '' }],
    ])
  })

  it('nenhuma coluna (desmarcadas todas) mostra "Colunas: nenhuma" e o × volta ao padrão', () => {
    const [chip] = activeDevCenterFilterChips(filters({ columns: [], allColumns: false }), ctx)
    expect(chip?.label).toBe('Colunas: nenhuma')
    expect(chip?.remove).toEqual({ columns: [], allColumns: undefined })
  })

  it('mais de 2 valores viram "N selecionados", com a lista completa no title', () => {
    const [chip] = activeDevCenterFilterChips(filters({ columns: ['todo', 'doing', 'review'], allColumns: false }), ctx)
    expect(chip?.label).toBe('Colunas: 3 selecionados')
    expect(chip?.title).toBe('Colunas: A Fazer, Em andamento, Revisão')
  })
})
