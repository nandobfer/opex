import { describe, expect, it } from 'vitest'
import { centralsByProject, NEUTRAL_PRODUCT_COLOR_CLASS, productColorProps, taskProductLabel } from '@/features/agentic/dev-center-product'

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

describe('productColorProps', () => {
  it('cor hex da central vai por style; nome antigo da paleta vira o hex equivalente', () => {
    expect(productColorProps('#8000FF')).toEqual({ style: { color: '#8000FF' } })
    expect(productColorProps('sky')).toEqual({ style: { color: '#38BDF8' } })
  })

  it('sem cor (ou inválida) fica neutra', () => {
    expect(productColorProps(null)).toEqual({ className: NEUTRAL_PRODUCT_COLOR_CLASS })
    expect(productColorProps(undefined)).toEqual({ className: NEUTRAL_PRODUCT_COLOR_CLASS })
    expect(productColorProps('magenta')).toEqual({ className: NEUTRAL_PRODUCT_COLOR_CLASS })
  })
})

describe('centralsByProject', () => {
  it('indexa as centrais pelo projeto', () => {
    const map = centralsByProject([{ projectId: 'p1', id: 'c1' }, { projectId: 'p2', id: 'c2' }])
    expect(map.get('p2')?.id).toBe('c2')
    expect(map.get('p3')).toBeUndefined()
  })
})
