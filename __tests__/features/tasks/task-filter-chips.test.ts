import { describe, expect, it } from 'vitest'
import { activeTaskFilterChips, type TaskFilterChipContext } from '@/features/tasks/filter-chips'
import { DEFAULT_TASK_FILTERS, type TaskFilters } from '@/features/tasks/filters'

const ctx: TaskFilterChipContext = {
  projects: new Map([
    ['p1', 'CRM Marketing'],
    ['p2', 'Portal'],
  ]),
  columns: new Map([
    ['todo', 'A Fazer'],
    ['doing', 'Em Andamento'],
    ['done', 'Concluído'],
    ['col-abc', 'Revisar'],
  ]),
}
const with_ = (patch: Partial<TaskFilters>): TaskFilters => ({ ...DEFAULT_TASK_FILTERS, ...patch })

describe('activeTaskFilterChips', () => {
  it('sem filtros: nenhum chip (visão e ordenação padrão não contam)', () => {
    expect(activeTaskFilterChips(with_({ view: 'table' }), ctx)).toEqual([])
  })

  it('rótulos com nomes de projeto, coluna, prioridade e tipo', () => {
    const chips = activeTaskFilterChips(
      with_({ search: ' login ', projects: ['p1'], columns: ['col-abc'], priorities: ['high'], types: ['bugfix'], showArchived: true }),
      ctx,
    )
    expect(chips.map((chip) => chip.label)).toEqual([
      'Busca: "login"',
      'Projeto: CRM Marketing',
      'Coluna: Revisar',
      'Prioridade: Alta',
      'Tipo: Correção',
      'Arquivadas: mostrando',
    ])
  })

  it('mais de 2 valores vira "N selecionados" com a lista completa no title', () => {
    const [chip] = activeTaskFilterChips(with_({ columns: ['todo', 'doing', 'done'] }), ctx)
    expect(chip!.label).toBe('Coluna: 3 selecionados')
    expect(chip!.title).toBe('Coluna: A Fazer, Em Andamento, Concluído')
  })

  it('remover: cada chip zera o próprio filtro', () => {
    const chips = activeTaskFilterChips(with_({ projects: ['p1'], showArchived: true }), ctx)
    const byKey = Object.fromEntries(chips.map((chip) => [chip.key, chip.remove]))
    expect(byKey.projects).toEqual({ projects: [] })
    expect(byKey.showArchived).toEqual({ showArchived: false })
  })

  it('ordenação fora do padrão aparece como chip discreto que volta para Prioridade', () => {
    const [chip] = activeTaskFilterChips(with_({ sort: 'manual' }), ctx)
    expect(chip).toMatchObject({ key: 'sort', label: 'Ordem: Manual (arrastar)', subtle: true, remove: { sort: 'priority' } })
  })

  it('coluna que não existe mais é ignorada', () => {
    expect(activeTaskFilterChips(with_({ columns: ['sumiu'] }), ctx)).toEqual([])
  })
})
