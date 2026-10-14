import { describe, expect, it } from 'vitest'
import { filterCentrals } from '@/features/agentic/central-filters'
import type { CentralDto } from '@/features/agentic/types'

const directory = (id: string) => ({ enabled: true, sessionDirectory: `/home/burgos/code/${id}` }) as CentralDto['config']

const central = (id: string, patch: Partial<CentralDto> = {}): CentralDto =>
  ({
    id,
    projectId: `p-${id}`,
    projectName: `Projeto ${id}`,
    sigla: id.toUpperCase(),
    repo: `org/${id}`,
    repoUrl: null,
    lastTest: null,
    activeWorkbenches: 0,
    runningWorkbenches: 0,
    createdAt: '',
    updatedAt: '',
    config: directory(id),
    ...patch,
  }) as unknown as CentralDto

const centrals = [
  central('opex', { projectName: 'Opex', repo: 'nandobfer/opex' }),
  central('automacao', { projectName: 'Automação', repo: 'sipal/automacao' }),
  central('portal', { projectName: 'Portal do cliente', repo: null }),
]

const ids = (search: string) => filterCentrals(centrals, search).map((item) => item.id)

describe('filterCentrals', () => {
  it('sem busca (ou só espaços) devolve todas, na ordem original', () => {
    expect(ids('')).toEqual(['opex', 'automacao', 'portal'])
    expect(ids('   ')).toEqual(['opex', 'automacao', 'portal'])
  })

  it('busca pelo projeto, pelo repositório e pelo diretório das sessões', () => {
    expect(ids('portal')).toEqual(['portal'])
    expect(ids('nandobfer')).toEqual(['opex'])
    expect(ids('/code/automacao')).toEqual(['automacao'])
  })

  it('ignora acentos e caixa', () => {
    expect(ids('AUTOMACAO')).toEqual(['automacao'])
    expect(ids('automação')).toEqual(['automacao'])
  })

  it('exige todos os termos digitados e preserva a ordem original', () => {
    expect(ids('code')).toEqual(['opex', 'automacao', 'portal'])
    expect(ids('code opex')).toEqual(['opex'])
  })

  it('tolera erro de digitação quando nenhum trecho casa', () => {
    expect(ids('automcao')).toEqual(['automacao'])
  })

  it('sem correspondência devolve lista vazia', () => {
    expect(ids('inexistente')).toEqual([])
  })

  it('central sem repositório vinculado não quebra a busca', () => {
    expect(ids('portal cliente')).toEqual(['portal'])
    const single = central('sozinha', { repo: null, projectName: 'Sem repo' })
    expect(filterCentrals([single], 'sem repo')).toEqual([single])
  })
})
