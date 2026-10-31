import { describe, expect, it } from 'vitest'
import { ENGRAMIND_OPERATIONS, findEngramindOperation, isValidSubscriptionTarget, matchEngramindRoute, normalizeEngramindQuery, channelSlugSchema } from '@/features/engramind/operations'
import { combinationOf, SCOPE_COMBINATIONS } from '@/features/engramind/constants'
import { scopesSchema } from '@/features/engramind/schemas/scopes'

/** Catálogo das operações do Engramind (rota do Opex, agente e serviço usam a mesma entrada). */

describe('catálogo de operações', () => {
  it('ids, rotas e ferramentas únicos, com rótulo e descrição em pt-BR', () => {
    const ids = ENGRAMIND_OPERATIONS.map((op) => op.id)
    const tools = ENGRAMIND_OPERATIONS.map((op) => op.tool)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(tools).size).toBe(tools.length)
    const routes = ENGRAMIND_OPERATIONS.map((op) => `${op.method} ${op.route}`)
    expect(new Set(routes).size).toBe(routes.length)
    for (const op of ENGRAMIND_OPERATIONS) {
      expect(op.tool).toMatch(/^[a-z][a-z0-9_]{2,63}$/)
      expect(op.label.length).toBeGreaterThan(3)
      expect(op.description.length).toBeGreaterThan(10)
    }
  })

  it('só exclusões, arquivamentos e a revogação são destrutivas, todas com a frase de confirmação', () => {
    const destructive = ENGRAMIND_OPERATIONS.filter((op) => op.risk === 'destructive').map((op) => op.id).sort()
    expect(destructive).toEqual(['archive_channel', 'archive_memory', 'delete_agent', 'delete_app', 'delete_channel', 'delete_memory', 'revoke_token'].sort())
    for (const op of ENGRAMIND_OPERATIONS.filter((item) => item.risk === 'destructive')) expect(op.summarize?.({ channel: 'eng/x', memory: 'm_1', app: 'a', agent: 'a/b', token: 'tk_1' } as never)).toBeTruthy()
  })

  it('a rota do Opex encontra a operação certa (literal vence parâmetro)', () => {
    expect(matchEngramindRoute('POST', ['memories', 'search'])?.operation.id).toBe('search_memories')
    expect(matchEngramindRoute('GET', ['memories', 'm_1'])).toMatchObject({ operation: { id: 'get_memory' }, params: { memory: 'm_1' } })
    expect(matchEngramindRoute('GET', ['channels', 'eng/global', 'stats'])).toMatchObject({ operation: { id: 'channel_stats' }, params: { channel: 'eng/global' } })
    expect(matchEngramindRoute('PUT', ['channels', 'eng/global', 'settings'])?.operation.id).toBe('update_channel_settings')
    expect(matchEngramindRoute('POST', ['tokens', 'tk_1', 'revoke'])?.operation.id).toBe('revoke_token')
    expect(matchEngramindRoute('DELETE', ['settings'])).toBeNull()
  })

  it('a query vira os tipos que o schema espera (sem conversão no schema)', () => {
    expect(normalizeEngramindQuery({ include_archived: 'true', limit: '50', cursor: 'abc' })).toEqual({ include_archived: true, limit: 50, cursor: 'abc' })
    const parsed = findEngramindOperation('list_channels')!.input.safeParse(normalizeEngramindQuery({ include_archived: 'false', limit: '20' }))
    expect(parsed.success).toBe(true)
  })

  it('pedido ao Engramind com o slug codificado no caminho', () => {
    const op = findEngramindOperation('archive_channel')!
    expect(op.request({ channel: 'eng/global' })).toEqual({ path: '/v1/channels/eng%2Fglobal/archive', body: {} })
    expect(findEngramindOperation('set_secret')!.redact!({ key: 'redator.api_key', value: 'sk-segredo' })).toEqual({ key: 'redator.api_key', value: '[segredo omitido]' })
  })
})

describe('regras de entrada', () => {
  it('escopos: só as quatro combinações aceitas', () => {
    for (const combination of SCOPE_COMBINATIONS) expect(scopesSchema.safeParse(combination.split('+')).success).toBe(true)
    expect(scopesSchema.safeParse(['write']).success).toBe(false)
    expect(scopesSchema.safeParse(['delete', 'write']).success).toBe(false)
    expect(combinationOf(['delete', 'read'])).toBe('read+delete')
    expect(combinationOf(['write'])).toBeNull()
  })

  it('alvo de assinatura: canal exato ou prefixo com um segmento completo', () => {
    for (const ok of ['eng/global', 'eng/*', 'eng/projeto-*', 'eng/projeto/docs']) expect(isValidSubscriptionTarget(ok)).toBe(true)
    for (const bad of ['*', 'eng*', 'Eng/x', 'eng//x', '-eng/x']) expect(isValidSubscriptionTarget(bad)).toBe(false)
  })

  it('slug de canal hierárquico', () => {
    expect(channelSlugSchema.safeParse('eng/projeto-atlas').success).toBe(true)
    expect(channelSlugSchema.safeParse('eng/projeto--atlas').success).toBe(false)
    expect(channelSlugSchema.safeParse('a/b/c/d/e/f/g/h/i').success).toBe(false)
  })

  it('token agent exige o agente; admin exige o app', () => {
    const issue = findEngramindOperation('issue_token')!.input
    expect(issue.safeParse({ kind: 'agent', scopes: ['read'] }).success).toBe(false)
    expect(issue.safeParse({ kind: 'agent', agent: 'app-a/curador', scopes: ['read', 'write'] }).success).toBe(true)
    expect(issue.safeParse({ kind: 'admin', scopes: ['read'] }).success).toBe(false)
    expect(issue.safeParse({ kind: 'admin', app: 'opex', scopes: ['read', 'write', 'delete'] }).success).toBe(true)
  })
})
