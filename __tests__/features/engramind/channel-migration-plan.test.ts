import { describe, expect, it } from 'vitest'
import { buildChannelMap, buildSubscriptionPlan, compareDigests, invertChannelMap, mapSubscriptionTarget, parseDigestOutput, remapSlug, type ExportDigest, type MemoryDigest } from '@/features/engramind/channel-migration/plan'
import { remapDeep } from '@/features/engramind/server/channel-migration/stored-slugs'

/** Migração B (OPE-206), parte pura: mapa, assinaturas, troca de slug e conferência dos exports. */

const channel = (slug: string, archived = false) => ({ slug, name: `Canal ${slug}`, description: null, priority: 0, archived_at: archived ? '2026-11-01T00:00:00Z' : null })

const digest = (memories: MemoryDigest[]): ExportDigest => ({ file: '/tmp/x.json', source: null, exportedAt: null, totals: { memories: memories.length, byStatus: {}, byChannel: {} }, memories })
const memory = (id: string, channelSlug: string, extra: Partial<MemoryDigest> = {}): MemoryDigest => ({ id, channel: channelSlug, status: 'active', pinned: null, key: null, textHash: `h-${id}`, ...extra })

describe('buildChannelMap', () => {
  it('leva agentes/** para opex/agentes/**, inclui arquivados e pula a raiz e os nomes novos e de usuário', () => {
    const { map } = buildChannelMap([channel('opex'), channel('agentes/maddox/dono'), channel('agentes/desenvolvedor/central/abc', true), channel('opex/agentes/adversario'), channel('vagas/x')], 'opex')
    expect(map.map((entry) => `${entry.from}→${entry.to}`)).toEqual(['agentes/desenvolvedor/central/abc→opex/agentes/desenvolvedor/central/abc', 'agentes/maddox/dono→opex/agentes/maddox/dono'])
    expect(map[0]!.wasArchived).toBe(true)
    expect(map[1]!.name).toBe('Canal agentes/maddox/dono')
  })

  it('nome novo longo demais fica na origem e vai para o relatório', () => {
    const long = `agentes/rotineiros/${'a'.repeat(110)}`
    expect(buildChannelMap([channel(long)], 'opex')).toEqual({ map: [], tooLong: [long] })
  })

  it('volta atrás inverte o mapa', () => {
    const { map } = buildChannelMap([channel('agentes/adversario')], 'opex')
    expect(invertChannelMap(map)[0]).toMatchObject({ from: 'opex/agentes/adversario', to: 'agentes/adversario' })
    expect(remapSlug('agentes/adversario', map)).toBe('opex/agentes/adversario')
    expect(remapSlug('vagas/x', map)).toBe('vagas/x')
  })
})

describe('assinaturas', () => {
  const map = [{ from: 'agentes/adversario', to: 'opex/agentes/adversario' }]

  it('canal exato pelo mapa, prefixo ganha o app; a raiz e canais do usuário ficam', () => {
    expect(mapSubscriptionTarget('agentes/adversario', 'forward', 'opex', map)).toBe('opex/agentes/adversario')
    expect(mapSubscriptionTarget('agentes/maddox/*', 'forward', 'opex', map)).toBe('opex/agentes/maddox/*')
    expect(mapSubscriptionTarget('opex', 'forward', 'opex', map)).toBeNull()
    expect(mapSubscriptionTarget('vagas/*', 'forward', 'opex', map)).toBeNull()
    expect(mapSubscriptionTarget('opex/agentes/maddox/*', 'revert', 'opex', invertChannelMap(map.map((entry) => ({ ...entry, wasArchived: false, name: '', description: null, priority: null }))))).toBe('agentes/maddox/*')
  })

  it('recria com o mesmo modo, acesso e prioridade, marca outros apps e não duplica', () => {
    const subscriptions = [
      { id: 'sub_1', agent: { id: 'ag_1', slug: 'mentor', qualified_slug: 'opex/mentor' }, target: 'agentes/adversario', mode: 'inject', access: ['read', 'write'], priority: 5 },
      { id: 'sub_1', agent: { id: 'ag_1', slug: 'mentor', qualified_slug: 'opex/mentor' }, target: 'agentes/adversario', mode: 'inject', access: ['read', 'write'], priority: 5 },
      { id: 'sub_2', agent: { id: 'ag_2', slug: 'dev', qualified_slug: 'dndicas/dev' }, target: 'agentes/desenvolvedor/*', mode: 'search', access: null, priority: null },
      { id: 'sub_3', agent: { id: 'ag_3', slug: 'opex', qualified_slug: 'opex/opex' }, target: 'opex', mode: 'inject', access: null, priority: null },
    ]
    const plan = buildSubscriptionPlan(subscriptions, 'forward', 'opex', map)
    expect(plan).toHaveLength(2)
    expect(plan[0]).toMatchObject({ oldId: 'sub_1', agent: 'opex/mentor', toTarget: 'opex/agentes/adversario', mode: 'inject', access: ['read', 'write'], priority: 5, foreign: false })
    expect(plan[1]).toMatchObject({ oldId: 'sub_2', agent: 'dndicas/dev', toTarget: 'opex/agentes/desenvolvedor/*', mode: 'search', foreign: true })
  })
})

describe('compareDigests', () => {
  const map = [{ from: 'agentes/adversario', to: 'opex/agentes/adversario' }]
  const before = digest([memory('m_1', 'agentes/adversario'), memory('m_2', 'agentes/adversario', { status: 'archived' }), memory('m_3', 'vagas/x', { status: 'permanent' })])

  it('igual: mesmos ids, textos e status, cada memória no canal mapeado', () => {
    const after = digest([memory('m_1', 'opex/agentes/adversario'), memory('m_2', 'opex/agentes/adversario', { status: 'archived' }), memory('m_3', 'vagas/x', { status: 'permanent' })])
    expect(compareDigests(before, after, map, [])).toMatchObject({ ok: true, checked: 3 })
  })

  it('memória faltando, texto alterado e status alterado falham', () => {
    const after = digest([memory('m_1', 'opex/agentes/adversario', { textHash: 'outro' }), memory('m_3', 'vagas/x')])
    const result = compareDigests(before, after, map, [])
    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toMatch(/Memória sumiu: m_2/)
    expect(result.problems.join('\n')).toMatch(/Texto alterado: m_1/)
    expect(result.problems.join('\n')).toMatch(/Status alterado: m_3/)
  })

  it('canal antigo que não ficou vazio falha; conflito pode ficar na origem', () => {
    const after = digest([memory('m_1', 'agentes/adversario'), memory('m_2', 'opex/agentes/adversario', { status: 'archived' }), memory('m_3', 'vagas/x', { status: 'permanent' })])
    expect(compareDigests(before, after, map, []).problems.join('\n')).toMatch(/Canal de origem não ficou vazio/)
    expect(compareDigests(before, after, map, [{ id: 'm_1' }]).ok).toBe(true)
  })
})

describe('auxiliares', () => {
  it('lê o resumo impresso pelo host', () => {
    const line = `OPEX_DIGEST:${JSON.stringify(digest([memory('m_1', 'opex')]))}`
    expect(parseDigestOutput(`/tmp/x.json 10 bytes\n${line}\n`)?.memories).toHaveLength(1)
    expect(parseDigestOutput('nada')).toBeNull()
  })

  it('troca slugs guardados em qualquer profundidade (layout dos universos)', () => {
    const map = [{ from: 'agentes/adversario', to: 'opex/agentes/adversario' }]
    expect(remapDeep({ colors: { 'agentes/adversario': '#fff' }, list: ['agentes/adversario', 'vagas/x'] }, map)).toEqual({ colors: { 'opex/agentes/adversario': '#fff' }, list: ['opex/agentes/adversario', 'vagas/x'] })
  })
})
