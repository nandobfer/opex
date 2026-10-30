import { describe, expect, it } from 'vitest'
import { centralsByProject, NEUTRAL_PRODUCT_COLOR_CLASS, productColorClass, taskProductLabel } from '@/features/agentic/dev-center-product'
import type { ColumnColor } from '@/features/tasks/board'

/** Linha do projeto nos cards da Central de desenvolvimento e cor da central (OPE-100, port do MT-31). */

const project = { id: 'p1', name: 'Opex', repo: 'nandobfer/opex', sigla: 'OPE' }

describe('taskProductLabel', () => {
  it('prefere o repositório da central, depois o da tarefa, depois o nome do projeto', () => {
    expect(taskProductLabel({ project }, { projectName: 'Opex', repo: 'org/central' })).toBe('org/central')
    expect(taskProductLabel({ project }, { projectName: 'Opex', repo: null })).toBe('nandobfer/opex')
    expect(taskProductLabel({ project: null }, { projectName: 'Opex', repo: '  ' })).toBe('Opex')
    expect(taskProductLabel({ project }, undefined)).toBe('nandobfer/opex')
  })

  it('sem projeto nem central: sem linha', () => {
    expect(taskProductLabel({ project: null }, null)).toBeNull()
  })
})

describe('productColorClass', () => {
  it('usa o texto da cor da paleta; sem cor ou cor desconhecida = neutra', () => {
    expect(productColorClass('emerald')).toBe('text-emerald-400')
    expect(productColorClass(null)).toBe(NEUTRAL_PRODUCT_COLOR_CLASS)
    expect(productColorClass(undefined)).toBe(NEUTRAL_PRODUCT_COLOR_CLASS)
    expect(productColorClass('magenta' as ColumnColor)).toBe(NEUTRAL_PRODUCT_COLOR_CLASS)
  })
})

describe('centralsByProject', () => {
  it('indexa as centrais pelo projeto', () => {
    const map = centralsByProject([{ projectId: 'p1', id: 'c1' }, { projectId: 'p2', id: 'c2' }])
    expect(map.get('p2')?.id).toBe('c2')
    expect(map.get('p3')).toBeUndefined()
  })
})
