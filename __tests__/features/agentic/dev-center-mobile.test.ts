import { describe, expect, it } from 'vitest'
import { activeTaskIndex, mobileFilterChips, seeTasksLabel } from '@/features/agentic/dev-center-mobile'

describe('coluna Tarefas no celular (OPE-166, plano v2)', () => {
  const tasks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('activeTaskIndex acha a tarefa que estava aberta na lista filtrada', () => {
    expect(activeTaskIndex(tasks, 'b')).toBe(1)
  })

  it('activeTaskIndex devolve -1 sem tarefa ou quando o filtro a tirou da lista', () => {
    expect(activeTaskIndex(tasks, null)).toBe(-1)
    expect(activeTaskIndex(tasks, 'z')).toBe(-1)
    expect(activeTaskIndex([], 'a')).toBe(-1)
  })

  it('a busca sai dos chips do celular (tem campo próprio); os demais filtros ficam', () => {
    const chips = [{ key: 'central' }, { key: 'search' }, { key: 'states' }]
    expect(mobileFilterChips(chips).map((chip) => chip.key)).toEqual(['central', 'states'])
    expect(mobileFilterChips([{ key: 'search' }])).toEqual([])
  })

  it('rótulo do botão que fecha a folha de filtros', () => {
    expect(seeTasksLabel(0)).toBe('Nenhuma tarefa')
    expect(seeTasksLabel(1)).toBe('Ver 1 tarefa')
    expect(seeTasksLabel(12)).toBe('Ver 12 tarefas')
  })
})
