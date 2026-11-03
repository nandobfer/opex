import { describe, expect, it } from 'vitest'
import { adminTokens, appSummaries, appTokenInUse, filterAppSummaries, tokenHealth, tokensOfAgent, tokensOfApp } from '@/features/engramind/identities'
import type { EngramindAgent, EngramindApp, EngramindToken } from '@/features/engramind/types'

/** OPE-117: aba Identidades — tokens administrativos na lista geral, agrupamento por app/agente, token em uso e alertas. */

const NOW = new Date('2026-11-03T12:00:00Z')
const ago = (days: number) => new Date(NOW.getTime() - days * 86400_000).toISOString()
const app = (slug: string, extra: Partial<EngramindApp> = {}): EngramindApp => ({ id: `app_${slug}`, slug, name: slug.toUpperCase(), description: null, created_at: ago(100), disabled_at: null, webhook: null, ...extra })
const agent = (appSlug: string, slug: string, extra: Partial<EngramindAgent> = {}): EngramindAgent => ({ id: `ag_${slug}`, slug, qualified_slug: `${appSlug}/${slug}`, name: slug, description: null, app: { id: `app_${appSlug}`, slug: appSlug }, created_at: ago(100), disabled_at: null, ...extra })
const token = (id: string, extra: Partial<EngramindToken> = {}): EngramindToken => ({ id, prefix: `eng.${id}`, kind: 'agent', scopes: ['read'], app: { id: 'app_opex', slug: 'opex' }, agent: null, label: null, status: 'active', created_at: ago(1), expires_at: null, revoked_at: null, last_used_at: ago(1), ...extra })

const tokens = [
  token('tk_admin', { kind: 'admin' }),
  token('tk_app_old', { kind: 'app', last_used_at: ago(5) }),
  token('tk_app_new', { kind: 'app', last_used_at: ago(1) }),
  token('tk_dev', { kind: 'agent', agent: { id: 'ag_desenvolvedor', slug: 'desenvolvedor' } }),
  token('tk_other_app', { kind: 'app', app: { id: 'app_outro', slug: 'outro' } }),
]

describe('aba Identidades', () => {
  it('a lista geral mostra só os tokens administrativos', () => {
    expect(adminTokens(tokens).map((item) => item.id)).toEqual(['tk_admin'])
  })

  it('token em uso: o do próprio Opex quando conhecido; senão o kind app ativo usado por último', () => {
    expect(appTokenInUse(tokens, { slug: 'opex' })!.id).toBe('tk_app_new')
    expect(appTokenInUse(tokens, { slug: 'opex' }, ['tk_app_old'])!.id).toBe('tk_app_old')
    expect(appTokenInUse(tokens, { slug: 'sem' })).toBeNull()
  })

  it('agrupa por app (sem agente, sem o em uso) e por agente', () => {
    const inUse = appTokenInUse(tokens, { slug: 'opex' })
    expect(tokensOfApp(tokens, { slug: 'opex' }, inUse).map((item) => item.id)).toEqual(['tk_admin', 'tk_app_old'])
    expect(tokensOfAgent(tokens, agent('opex', 'desenvolvedor')).map((item) => item.id)).toEqual(['tk_dev'])
  })

  it('alertas: expira em até 7 dias, sem uso há 30 dias (inclusive nunca usado criado há mais de 30) e dono desativado', () => {
    const context = { apps: [app('opex'), app('off', { disabled_at: ago(1) })], agents: [agent('opex', 'parado', { disabled_at: ago(2) })] }
    expect(tokenHealth(token('a', { expires_at: new Date(NOW.getTime() + 3 * 86400_000).toISOString() }), context, NOW)).toEqual(['expiring'])
    expect(tokenHealth(token('b', { last_used_at: ago(31) }), context, NOW)).toEqual(['idle'])
    expect(tokenHealth(token('c', { last_used_at: null, created_at: ago(40) }), context, NOW)).toEqual(['idle'])
    expect(tokenHealth(token('d', { last_used_at: null, created_at: ago(2) }), context, NOW)).toEqual([])
    expect(tokenHealth(token('e', { app: { id: 'app_off', slug: 'off' } }), context, NOW)).toEqual(['owner-disabled'])
    expect(tokenHealth(token('f', { agent: { id: 'ag_parado', slug: 'parado' } }), context, NOW)).toEqual(['owner-disabled'])
    expect(tokenHealth(token('g', { status: 'revoked', last_used_at: ago(90) }), context, NOW)).toEqual([])
  })

  it('resumo por app (agentes, tokens ativos, última atividade) e filtros', () => {
    const rows = appSummaries([app('opex'), app('outro', { disabled_at: ago(1) })], [agent('opex', 'desenvolvedor'), agent('opex', 'opex')], tokens, NOW)
    expect(rows[0]).toMatchObject({ agents: 2, activeTokens: 4, lastActivity: ago(1) })
    expect(rows[1]).toMatchObject({ agents: 0, activeTokens: 1, alerts: 1 })
    expect(filterAppSummaries(rows, { term: 'out', status: 'all', alertsOnly: false }).map((row) => row.app.slug)).toEqual(['outro'])
    expect(filterAppSummaries(rows, { term: '', status: 'active', alertsOnly: false }).map((row) => row.app.slug)).toEqual(['opex'])
    expect(filterAppSummaries(rows, { term: '', status: 'all', alertsOnly: true }).map((row) => row.app.slug)).toEqual(['outro'])
  })
})
