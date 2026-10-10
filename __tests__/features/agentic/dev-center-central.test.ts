import { describe, expect, it } from 'vitest'
import { DEFAULT_DEV_CENTER_CENTRAL, centralSigla, devCenterCentralSchema, pickActiveCentral } from '@/features/agentic/dev-center-central'
import type { CentralDto } from '@/features/agentic/types'

const central = (id: string, projectId: string, patch: Partial<CentralDto> = {}): CentralDto =>
  ({ id, projectId, projectName: `Projeto ${id}`, sigla: id.toUpperCase(), repo: null, ...patch }) as unknown as CentralDto

describe('central selecionada da Central de desenvolvimento', () => {
  it('schema: rejeita valor inválido e aceita um id', () => {
    expect(devCenterCentralSchema.safeParse({ id: 1 }).success).toBe(false)
    expect(devCenterCentralSchema.safeParse({ id: 'c1' }).success).toBe(true)
    expect(DEFAULT_DEV_CENTER_CENTRAL).toEqual({ id: '' })
  })

  it('a central do projeto da tarefa vence a salva', () => {
    const list = [central('c1', 'p1'), central('c2', 'p2')]
    expect(pickActiveCentral(list, 'c1', 'p2')?.id).toBe('c2')
  })

  it('sem tarefa, usa a salva; salva inexistente cai na primeira', () => {
    const list = [central('c1', 'p1'), central('c2', 'p2')]
    expect(pickActiveCentral(list, 'c2', null)?.id).toBe('c2')
    expect(pickActiveCentral(list, 'zzz', null)?.id).toBe('c1')
  })

  it('sem centrais devolve null', () => {
    expect(pickActiveCentral([], 'c1', null)).toBeNull()
  })

  it('sigla: usa a do projeto e cai no nome quando vazia', () => {
    expect(centralSigla(central('c1', 'p1', { sigla: 'OPX' }))).toBe('OPX')
    expect(centralSigla(central('c1', 'p1', { sigla: '', projectName: 'sap-painel' }))).toBe('SAP')
  })
})
