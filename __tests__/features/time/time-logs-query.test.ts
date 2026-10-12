import { describe, expect, it } from 'vitest'
import { queryToObject } from '@/lib/api/query'
import { timeLogsQuerySchema } from '@/features/time/schemas'

/** Contrato da consulta dos apontamentos (`GET /api/time/logs`): período + repositórios + tipos. */

const PROJ = 'a'.repeat(24)
const parse = (search: string) => timeLogsQuerySchema.safeParse(queryToObject(new URLSearchParams(search), ['projects', 'types']))

describe('consulta dos apontamentos', () => {
  it('sem parâmetros usa página 1 e nenhum recorte', () => {
    const parsed = parse('')
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data).toEqual({ page: 1, projects: [], types: [] })
  })

  it('aceita as listas separadas por vírgula ou repetidas na query string', () => {
    const csv = parse(`from=2026-10-01T00:00:00.000Z&to=2026-10-31T00:00:00.000Z&page=2&projects=${PROJ}&types=feature,bugfix`)
    expect(csv.success && csv.data).toMatchObject({ page: 2, from: '2026-10-01T00:00:00.000Z', projects: [PROJ], types: ['feature', 'bugfix'] })

    const repeated = parse(`types=feature&types=bugfix&projects=${PROJ}`)
    expect(repeated.success && repeated.data.types).toEqual(['feature', 'bugfix'])
    // Data vazia (`?from=`) não é um recorte inválido: a chave é simplesmente ignorada.
    expect(parse('from=&to=').success).toBe(true)
  })

  it('recusa repositório malformado e tipo desconhecido', () => {
    expect(parse('projects=nao-e-um-id').success).toBe(false)
    expect(parse('types=inventado').success).toBe(false)
  })
})
