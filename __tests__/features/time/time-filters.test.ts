import { describe, expect, it } from 'vitest'
import { parseUrlFilters, serializeUrlFilters } from '@/hooks/useUrlFilters'
import { hasTimeLogFilters, TIME_LOG_FILTER_SCHEMA, TIME_LOG_TYPE_OPTIONS, type TimeLogFilters } from '@/features/time/filters'
import { TASK_TYPE_LABELS } from '@/features/tasks/constants'

/** Filtros das Horas agênticas na URL: período + repositórios + tipos. */

const PROJ = 'a'.repeat(24)
const defaults: TimeLogFilters = { from: '2026-10-05', to: '2026-10-12', projects: [], types: [] }

describe('filtros das Horas agênticas', () => {
  it('URL vazia devolve o padrão da tela', () => {
    expect(parseUrlFilters('', defaults, TIME_LOG_FILTER_SCHEMA)).toEqual(defaults)
  })

  it('lê período, repositórios e tipos da URL', () => {
    const parsed = parseUrlFilters(`from=2026-09-01&to=2026-09-30&projects=${PROJ}&types=feature,bugfix`, defaults, TIME_LOG_FILTER_SCHEMA)
    expect(parsed).toEqual({ from: '2026-09-01', to: '2026-09-30', projects: [PROJ], types: ['feature', 'bugfix'] })
  })

  it('descarta id de projeto malformado e tipo desconhecido (URL editada à mão)', () => {
    const parsed = parseUrlFilters('projects=nao-e-id,xxx&types=inventado,feature', defaults, TIME_LOG_FILTER_SCHEMA)
    expect(parsed.projects).toEqual([])
    expect(parsed.types).toEqual(['feature'])
  })

  it('serializa só o que difere do padrão', () => {
    const serialized = new URLSearchParams(serializeUrlFilters('', { ...defaults, types: ['feature'], projects: [PROJ] }, defaults, TIME_LOG_FILTER_SCHEMA))
    expect(serialized.get('projects')).toBe(PROJ)
    expect(serialized.get('types')).toBe('feature')
    expect(serialized.has('from')).toBe(false)

    expect(serializeUrlFilters('', defaults, defaults, TIME_LOG_FILTER_SCHEMA)).toBe('')
  })

  it('só considera "filtrado" quando há repositório ou tipo escolhido', () => {
    expect(hasTimeLogFilters({ projects: [], types: [] })).toBe(false)
    expect(hasTimeLogFilters({ projects: [PROJ], types: [] })).toBe(true)
    expect(hasTimeLogFilters({ projects: [], types: ['feature'] })).toBe(true)
  })

  it('as opções de tipo usam o vocabulário e os rótulos das tarefas', () => {
    expect(TIME_LOG_TYPE_OPTIONS.map((option) => [option.value, option.label])).toEqual(
      Object.entries(TASK_TYPE_LABELS).map(([value, label]) => [value, label]),
    )
  })
})
