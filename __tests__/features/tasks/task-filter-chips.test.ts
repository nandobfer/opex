import { describe, expect, it } from 'vitest'
import { activeTaskFilterChips, type TaskFilterChipContext } from '@/features/tasks/filter-chips'
import { DEFAULT_TASK_FILTERS, type TaskFilters } from '@/features/tasks/filters'
import { UNASSIGNED } from '@/features/tasks/constants'

const ctx: TaskFilterChipContext = {
  products: new Map([['p1', 'CRM Marketing'], ['p2', 'Go! Sipal']]),
  people: new Map([['me', 'Fernando'], ['ana', 'Ana']]),
  workPackages: new Map([['wp1', 'Sprint 12']]),
  columns: new Map([['development', 'Desenvolvimento'], ['validation', 'Validação'], ['backlog', 'Backlog'], ['custom-abc', 'Revisar']]),
  currentUserId: 'me',
}
const with_ = (patch: Partial<TaskFilters>): TaskFilters => ({ ...DEFAULT_TASK_FILTERS, ...patch })

describe('activeTaskFilterChips', () => {
  it('sem filtros: nenhum chip (visão e ordenação padrão não contam)', () => {
    expect(activeTaskFilterChips(with_({ view: 'table' }), ctx)).toEqual([])
  })

  it('rótulos com nomes, "(eu)", "Sem responsável" e coluna pessoal', () => {
    const chips = activeTaskFilterChips(
      with_({ search: ' login ', products: ['p1'], assignees: ['me', UNASSIGNED], statuses: ['custom-abc'], priorities: ['high'], types: ['bugfix'], workPackages: ['wp1'], showArchived: true }),
      ctx,
    )
    expect(chips.map((chip) => chip.label)).toEqual([
      'Busca: "login"',
      'Produto: CRM Marketing',
      'Responsável: Fernando (eu), Sem responsável',
      'Status: Revisar',
      'Prioridade: Alta',
      'Tipo: Correção',
      'Pacote: Sprint 12',
      'Arquivadas: mostrando',
    ])
  })

  it('mais de 2 valores vira "N selecionados" com a lista completa no title', () => {
    const [chip] = activeTaskFilterChips(with_({ statuses: ['backlog', 'development', 'validation'] }), ctx)
    expect(chip!.label).toBe('Status: 3 selecionados')
    expect(chip!.title).toBe('Status: Backlog, Desenvolvimento, Validação')
  })

  it('remover: cada chip zera o próprio filtro; produto também limpa os pacotes', () => {
    const chips = activeTaskFilterChips(with_({ products: ['p1'], workPackages: ['wp1'], showArchived: true }), ctx)
    const byKey = Object.fromEntries(chips.map((chip) => [chip.key, chip.remove]))
    expect(byKey.products).toEqual({ products: [], workPackages: [] })
    expect(byKey.workPackages).toEqual({ workPackages: [] })
    expect(byKey.showArchived).toEqual({ showArchived: false })
  })

  it('ordenação fora do padrão aparece como chip discreto que volta para Prioridade', () => {
    const [chip] = activeTaskFilterChips(with_({ sort: 'manual' }), ctx)
    expect(chip).toMatchObject({ key: 'sort', label: 'Ordem: Manual (arrastar)', subtle: true, remove: { sort: 'priority' } })
  })

  it('status de coluna que não existe mais é ignorado', () => {
    expect(activeTaskFilterChips(with_({ statuses: ['custom-removida'] }), ctx)).toEqual([])
  })
})
