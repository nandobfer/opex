import { describe, expect, it } from 'vitest'
import { deliveredChannels, parseTaggedContext } from '@/features/engramind/context-tagged'
import {
  agentDisplayName,
  agentReach,
  clampCardRect,
  OVERVIEW_AGENT_BOX,
  OVERVIEW_AGENT_GAP,
  OVERVIEW_CHANNEL_BOX,
  OVERVIEW_CHANNEL_GAP,
  OVERVIEW_FIT_MARGIN,
  OVERVIEW_ROW_GAP,
  overviewInitialBounds,
  ageColor,
  ageRatios,
  channelColors,
  pickChannelColors,
  lastRealUseOf,
  lastUseOf,
  layoutOverview,
  layoutUniverse,
  matchesFilters,
  particleBrightness,
  particleSize,
  PARTICLE_MAX_PX,
  PARTICLE_MIN_PX,
  PINNED_MIN_BRIGHTNESS,
  repelOffset,
  stableHash,
  subscriptionLinks,
  subscriptionReaches,
  UNIVERSE_FIRST_RADIUS,
  UNIVERSE_RING_GAP,
  splitChannelSlug,
  universeRingCapacity,
  universeRingCounts,
  minZoomCenter,
  memoryCardSize,
  MOBILE_FIT_MIN_ZOOM,
  universeStats,
} from '@/features/engramind/network/network-math'
import { buildParticles } from '@/features/engramind/network/particles'
import { CENTRAL_CHANNEL_PREFIX, centralChannelLabels, channelNameParts, isCentralChannel } from '@/features/engramind/network/channel-labels'
import type { NetworkMemory } from '@/features/engramind/network/types'

/** OPE-109: cálculos puros da rede (cor, tamanho, brilho, links, layout e estatísticas) e o contexto tagged. */

const NOW = Date.parse('2026-11-01T12:00:00Z')
const day = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString()
const mem = (id: string, extra: Partial<NetworkMemory> = {}): NetworkMemory => ({
  id,
  channel: 'opex',
  title: id,
  text: `texto ${id}`,
  category: 'PROJECT_RULES',
  status: 'active',
  version: 1,
  createdAt: day(10),
  updatedAt: day(10),
  retrievals: 0,
  injections: 0,
  lastRetrievedAt: null,
  verifiedAt: null,
  stale: false,
  author: 'opex/opex',
  ...extra,
})

describe('contexto tagged', () => {
  const block = ['<memories version="cv_9">', '<channel slug="opex">', '<PROJECT_RULES>', '#m_a: Use pnpm; nada de &lt;channel> forjado.', '#m_b: Outra.', '</PROJECT_RULES>', '</channel>', '<channel slug="agentes/opex/dono">', '<NAMING>', '#m_c: Nomes.', '</NAMING>', '</channel>', '<titles>', '#m_d: Só o título', '</titles>', '<overflow count="3">use search_memories para o restante</overflow>', '</memories>'].join('\n')

  it('lê os ids da faixa 1 com o canal e os títulos à parte', () => {
    const ids = parseTaggedContext(block)
    expect(ids.full).toEqual([{ id: 'm_a', channel: 'opex' }, { id: 'm_b', channel: 'opex' }, { id: 'm_c', channel: 'agentes/opex/dono' }])
    expect(ids.titles).toEqual(['m_d'])
    expect(deliveredChannels(ids)).toEqual(['opex', 'agentes/opex/dono'])
  })

  it('bloco vazio, nulo ou em markdown não traz ids', () => {
    expect(parseTaggedContext('<memories version="cv_1">\n</memories>')).toEqual({ full: [], titles: [] })
    expect(parseTaggedContext(null)).toEqual({ full: [], titles: [] })
    expect(parseTaggedContext('## opex\n\n### PROJECT_RULES\n- Use pnpm.').full).toEqual([])
  })
})

describe('cor pela idade', () => {
  it('a mais nova é verde (0), a mais antiga roxa (1), as demais no gradiente', () => {
    const ratios = ageRatios([mem('nova', { createdAt: day(0) }), mem('meio', { createdAt: day(5) }), mem('velha', { createdAt: day(10) })])
    expect([ratios.get('nova'), ratios.get('meio'), ratios.get('velha')]).toEqual([0, 0.5, 1])
    expect(ageColor(0)).toBe('color-mix(in oklch, var(--color-primary) 0%, var(--color-success))')
    expect(ageColor(1)).toBe('color-mix(in oklch, var(--color-primary) 100%, var(--color-success))')
  })

  it('uma só memória ou datas iguais ficam verdes', () => {
    expect(ageRatios([mem('a')]).get('a')).toBe(0)
    const same = ageRatios([mem('a'), mem('b')])
    expect([same.get('a'), same.get('b')]).toEqual([0, 0])
  })
})

describe('tamanho pelo uso', () => {
  it('logarítmico relativo ao universo: a mais usada no máximo, a nunca usada no mínimo', () => {
    expect(particleSize(100, 100)).toBe(PARTICLE_MAX_PX)
    expect(particleSize(0, 100)).toBe(PARTICLE_MIN_PX)
    const mid = particleSize(10, 100)
    expect(mid).toBeGreaterThan(PARTICLE_MIN_PX + (PARTICLE_MAX_PX - PARTICLE_MIN_PX) * 0.1)
    expect(mid).toBeLessThan(PARTICLE_MAX_PX)
  })

  it('tudo com zero: todas no mínimo', () => {
    expect(particleSize(0, 0)).toBe(PARTICLE_MIN_PX)
  })
})

describe('brilho pelo prazo do consolidador', () => {
  it('cheio no último uso e linear até cinza no prazo', () => {
    expect(particleBrightness({ status: 'active', stale: false, lastUse: day(0) }, 30, NOW)).toBe(1)
    expect(particleBrightness({ status: 'active', stale: false, lastUse: day(15) }, 30, NOW)).toBe(0.5)
    expect(particleBrightness({ status: 'active', stale: false, lastUse: day(45) }, 30, NOW)).toBe(0)
  })

  it('candidata a esquecimento fica cinza mesmo usada há pouco; fixada nunca some; inativa sem brilho', () => {
    expect(particleBrightness({ status: 'active', stale: true, lastUse: day(1) }, 30, NOW)).toBe(0)
    expect(particleBrightness({ status: 'permanent', stale: false, lastUse: day(300) }, 30, NOW)).toBe(PINNED_MIN_BRIGHTNESS)
    expect(particleBrightness({ status: 'archived', stale: false, lastUse: day(0) }, 30, NOW)).toBe(0)
  })

  it('último uso: o maior entre busca, verificação, consumo registrado pelo Opex e criação (nunca usada conta da criação)', () => {
    const memory = mem('a', { createdAt: day(20), lastRetrievedAt: day(10) })
    expect(lastUseOf(memory)).toBe(day(10))
    expect(lastUseOf(memory, { a: { lastUsedAt: day(1), liveCount: 3 } })).toBe(day(1))
    expect(lastUseOf(mem('b', { createdAt: day(20) }))).toBe(day(20))
    expect(lastRealUseOf(mem('b'))).toBeNull()
  })

  it('regressão: a verificação do consolidador não conta como uso (nunca consultada esmaece pela criação)', () => {
    const memory = mem('a', { createdAt: day(29), verifiedAt: day(1) })
    expect(lastUseOf(memory)).toBe(day(29))
    expect(lastRealUseOf(memory)).toBeNull()
    expect(buildParticles([memory], { staleAfterDays: 30, now: NOW }).get('a')!.brightness).toBeLessThan(0.1)
  })

  it('buildParticles: candidata a esquecimento fica cinza, mas o consumo ao vivo (aumento local) a devolve ao brilho cheio', () => {
    const memories = [mem('a', { stale: true })]
    expect(buildParticles(memories, { staleAfterDays: 30, now: NOW }).get('a')!.brightness).toBe(0)
    const live = buildParticles(memories, { staleAfterDays: 30, now: NOW, usage: { a: { lastUsedAt: new Date(NOW).toISOString(), liveCount: 1 } }, bumps: { a: 1 } })
    expect(live.get('a')!.brightness).toBe(1)
  })

  it('buildParticles: o consumo do Opex devolve o brilho e o aumento local cresce a partícula', () => {
    const memories = [mem('a', { createdAt: day(29), injections: 4 }), mem('b', { createdAt: day(0) })]
    const before = buildParticles(memories, { staleAfterDays: 30, now: NOW })
    expect(before.get('a')!.brightness).toBeLessThan(0.1)
    const after = buildParticles(memories, { staleAfterDays: 30, now: NOW, usage: { a: { lastUsedAt: day(0), liveCount: 1 } }, bumps: { a: 1 } })
    expect(after.get('a')!.brightness).toBe(1)
    expect(after.get('a')!.size).toBeGreaterThan(before.get('a')!.size)
    expect(after.get('b')!.size).toBe(PARTICLE_MIN_PX)
  })
})

describe('cor estável dos canais', () => {
  it('a base vem do slug (mesma cor em qualquer conjunto) e repetições ganham variação de tom', () => {
    const one = channelColors(['opex'])
    const many = channelColors(['opex', 'a', 'b', 'c', 'd', 'e', 'f', 'g'])
    const base = `var(--chart-${(stableHash('opex') % 6) + 1})`
    expect(one.get('opex')).toBe(base)
    expect(many.get('opex')).toContain(base)
    expect(new Set(many.values()).size).toBe(8)
  })

  it('regressão: o mesmo canal tem a mesma cor em universos diferentes, mesmo quando colide na base', () => {
    const base = (slug: string) => stableHash(slug) % 6
    const all = ['opex', ...Array.from({ length: 40 }, (_, index) => `canal-${index}`)]
    const rival = all.find((slug) => slug !== 'opex' && base(slug) === base('opex') && slug < 'opex')!
    expect(rival).toBeTruthy()
    const colors = channelColors(all)
    const alone = pickChannelColors(colors, ['opex'])
    const together = pickChannelColors(colors, ['opex', rival])
    expect(alone.get('opex')).toBe(together.get('opex'))
    expect(together.get('opex')).not.toBe(together.get(rival))
    expect(pickChannelColors(colors, ['novo-canal']).get('novo-canal')).toMatch(/var\(--chart-/)
  })
})

describe('links das assinaturas', () => {
  const channels = [
    { slug: 'opex', name: 'Opex', archived: false },
    { slug: 'agentes/opex/global', name: 'G', archived: false },
    { slug: 'agentes/opex/velho', name: 'V', archived: true },
    { slug: 'agentes/maddox/dono', name: 'M', archived: false },
  ]
  const subs = [
    { id: 's1', agent: 'opex/opex', target: 'agentes/opex/*', isPrefix: true, mode: 'inject' as const, reaches: ['agentes/opex/global'] },
    { id: 's2', agent: 'opex/opex', target: 'opex', isPrefix: false, mode: 'search' as const, reaches: ['opex'] },
    { id: 's3', agent: 'app/x', target: 'nada/*', isPrefix: true, mode: 'manage' as const, reaches: [] },
  ]

  it('um link por canal casado (prefixo incluído); prefixo sem canal não gera link', () => {
    const links = subscriptionLinks(subs, channels, false)
    expect(links.map((link) => `${link.agent}>${link.channel}:${link.mode}`)).toEqual(['opex/opex>agentes/opex/global:inject', 'opex/opex>opex:search'])
  })

  it('Mostrar arquivados casa o prefixo localmente com os canais arquivados', () => {
    expect(subscriptionLinks(subs, channels, true).map((link) => link.channel)).toContain('agentes/opex/velho')
    expect(subscriptionReaches('agentes/opex/*', true, 'agentes/opex/velho')).toBe(true)
    expect(subscriptionReaches('agentes/opex/*', true, 'agentes/maddox/dono')).toBe(false)
    expect(subscriptionReaches('opex', false, 'opex/x')).toBe(false)
  })

  it('alcance por agente soma as memórias dos canais ligados', () => {
    const reach = agentReach(subscriptionLinks(subs, channels, false), new Map([['opex', 3], ['agentes/opex/global', 2]]))
    expect(reach.get('opex/opex')).toBe(5)
  })
})

describe('layout', () => {
  it('visão inicial horizontal: agentes numa linha em cima e canais numa linha embaixo, centralizadas', () => {
    const layout = layoutOverview([{ id: 'opex/opex', app: 'opex' }, { id: 'x/a', app: 'x' }, { id: 'x/b', app: 'x' }], [{ slug: 'opex' }, { slug: 'b' }])
    const agents = [...layout.agents.values()]
    const channels = [...layout.channels.values()]
    expect(agents.every((point) => point.y === 0)).toBe(true)
    expect(channels.every((point) => point.y === OVERVIEW_ROW_GAP)).toBe(true)
    expect(agents.reduce((sum, point) => sum + point.x, 0)).toBe(0)
    expect(channels.reduce((sum, point) => sum + point.x, 0)).toBe(0)
    expect(layout.agents.get('x/b')!.x - layout.agents.get('x/a')!.x).toBe(OVERVIEW_AGENT_GAP)
    expect(Math.abs(layout.channels.get('opex')!.x - layout.channels.get('b')!.x)).toBe(OVERVIEW_CHANNEL_GAP)
  })

  it('enquadramento inicial: a linha de agentes com folga e a altura até a linha de canais; sem agentes, tudo', () => {
    const agents = [{ x: -210, y: 0 }, { x: 0, y: 0 }, { x: 210, y: 0 }]
    const bounds = overviewInitialBounds(agents)!
    const rowWidth = 420 + OVERVIEW_AGENT_BOX.width
    expect(bounds.width).toBeCloseTo(rowWidth * (1 + 2 * OVERVIEW_FIT_MARGIN))
    expect(bounds.x).toBeCloseTo(-rowWidth / 2 - rowWidth * OVERVIEW_FIT_MARGIN)
    expect(bounds.y).toBeLessThan(-OVERVIEW_AGENT_BOX.height / 2 + 1)
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(OVERVIEW_ROW_GAP + OVERVIEW_CHANNEL_BOX.height / 2)
    expect(overviewInitialBounds([])).toBeNull()
  })

  it('card da memória: centralizado sobre a partícula e sempre inteiro dentro do quadro', () => {
    const canvas = { width: 800, height: 600 }
    const card = { width: 288, height: 300 }
    expect(clampCardRect({ x: 400, y: 300 }, card, canvas)).toEqual({ x: 256, y: 150 })
    expect(clampCardRect({ x: 0, y: 0 }, card, canvas)).toEqual({ x: 8, y: 8 })
    expect(clampCardRect({ x: 800, y: 600 }, card, canvas)).toEqual({ x: 800 - 288 - 8, y: 600 - 300 - 8 })
    expect(clampCardRect({ x: 790, y: 5 }, card, canvas)).toEqual({ x: 504, y: 8 })
    expect(clampCardRect({ x: 50, y: 50 }, card, { width: 200, height: 200 })).toEqual({ x: 8, y: 8 })
  })

  it('universo: as mais usadas na órbita interna e nenhuma partícula sobreposta', () => {
    const memories = Array.from({ length: 60 }, (_, index) => mem(`m${index}`, { injections: index }))
    const positions = layoutUniverse(memories)
    const radius = (id: string) => Math.hypot(positions.get(id)!.x, positions.get(id)!.y)
    expect(Math.round(radius('m59'))).toBe(UNIVERSE_FIRST_RADIUS)
    // Anéis equilibrados: 60 memórias em 3 anéis (≈ 15/20/25), as mais usadas por dentro.
    expect(universeRingCounts(60)).toHaveLength(3)
    expect(radius('m0')).toBeGreaterThan(radius('m59'))
    const keys = new Set([...positions.values()].map((point) => `${Math.round(point.x)}:${Math.round(point.y)}`))
    expect(keys.size).toBe(60)
  })

  it('anéis equilibrados: mesmo número de anéis, distribuição proporcional às vagas, sem anel quase vazio', () => {
    // Até 20 memórias: um anel só, como antes.
    expect(universeRingCounts(15)).toEqual([15])
    expect(universeRingCounts(20)).toEqual([20])
    for (const total of [50, 100, 1000]) {
      const counts = universeRingCounts(total)
      const capacities = counts.map((_, ring) => universeRingCapacity(ring))
      const room = capacities.reduce((sum, capacity) => sum + capacity, 0)
      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(total)
      // O mínimo de anéis que comporta todas (como antes).
      expect(room - capacities.at(-1)!).toBeLessThan(total)
      counts.forEach((count, ring) => {
        expect(count).toBeLessThanOrEqual(capacities[ring]!)
        expect(count).toBeGreaterThanOrEqual(Math.floor(((total * capacities[ring]!) / room) * 0.5))
      })
    }
    // 50 memórias: ~12/17/21 em vez de 20/28/2.
    expect(universeRingCounts(50)).toEqual([12, 17, 21])
  })

  it('universo com 50 memórias: as mais usadas no anel de dentro e o último anel cheio', () => {
    const memories = Array.from({ length: 50 }, (_, index) => mem(`m${index}`, { injections: index }))
    const positions = layoutUniverse(memories)
    const ring = (id: string) => Math.round((Math.hypot(positions.get(id)!.x, positions.get(id)!.y) - UNIVERSE_FIRST_RADIUS) / UNIVERSE_RING_GAP)
    const byRing = [0, 1, 2].map((index) => memories.filter((memory) => ring(memory.id) === index).map((memory) => memory.injections))
    expect(byRing.map((items) => items.length)).toEqual([12, 17, 21])
    expect(Math.min(...byRing[0]!)).toBeGreaterThan(Math.max(...byRing[1]!))
    expect(Math.min(...byRing[1]!)).toBeGreaterThan(Math.max(...byRing[2]!))
  })

  it('nome do canal: prefixo até a última barra e a ponta final como título', () => {
    expect(splitChannelSlug('agentes/desenvolvedor/central/abc123')).toEqual({ prefix: 'agentes/desenvolvedor/central/', leaf: 'abc123' })
    expect(splitChannelSlug('opex')).toEqual({ prefix: '', leaf: 'opex' })
    expect(splitChannelSlug('agentes/adversario/')).toEqual({ prefix: 'agentes/', leaf: 'adversario' })
  })

  it('celular: enquadra com zoom mínimo legível só quando o retângulo não cabe; centraliza nele', () => {
    const bounds = { x: -500, y: -50, width: 1000, height: 400 }
    expect(minZoomCenter(bounds, { width: 360, height: 600 }, MOBILE_FIT_MIN_ZOOM)).toEqual({ x: 0, y: 150, zoom: 0.5 })
    expect(minZoomCenter(bounds, { width: 1200, height: 800 }, MOBILE_FIT_MIN_ZOOM)).toBeNull()
    expect(minZoomCenter(bounds, { width: 0, height: 0 }, MOBILE_FIT_MIN_ZOOM)).toBeNull()
  })

  it('card da memória limitado ao quadro (8 px de margem), sem mudar quando cabe', () => {
    expect(memoryCardSize({ width: 288, height: 300 }, { width: 800, height: 600 })).toEqual({ width: 288, height: 300 })
    expect(memoryCardSize({ width: 288, height: 700 }, { width: 800, height: 448 })).toEqual({ width: 288, height: 432 })
    expect(memoryCardSize({ width: 288, height: 300 }, { width: 280, height: 600 })).toEqual({ width: 264, height: 300 })
    expect(memoryCardSize({ width: 288, height: 300 }, { width: 0, height: 0 })).toEqual({ width: 288, height: 300 })
  })

  it('hover afasta as vizinhas para longe da focada', () => {
    const offset = repelOffset({ x: 10, y: 0 }, { x: 0, y: 0 })
    expect(offset.x).toBeGreaterThan(0)
    expect(repelOffset({ x: 1000, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })
})

describe('filtros e estatísticas', () => {
  it('filtros destacam: canal, status, categoria, autor, desde e a busca', () => {
    const memory = mem('a', { updatedAt: '2026-10-20T10:00:00Z' })
    expect(matchesFilters(memory, {}, null)).toBe(true)
    expect(matchesFilters(memory, { status: 'archived' }, null)).toBe(false)
    expect(matchesFilters(memory, { author: 'OPEX/' }, null)).toBe(true)
    expect(matchesFilters(memory, { since: '2026-10-21' }, null)).toBe(false)
    expect(matchesFilters(memory, {}, new Set(['b']))).toBe(false)
  })

  it('estatísticas do universo: ativas, inativas, fixadas, usos, última consulta e esquecidas', () => {
    const memories = [mem('a', { retrievals: 2, injections: 3, lastRetrievedAt: day(2) }), mem('b', { status: 'permanent' }), mem('c', { status: 'archived', channel: 'x' })]
    const stats = universeStats(memories, new Map([['a', 0.9], ['b', 0], ['c', 0]]))
    expect(stats).toMatchObject({ active: 2, inactive: 1, pinned: 1, uses: 5, lastUse: day(2), forgotten: 1 })
    expect(stats.byChannel).toEqual([{ slug: 'opex', count: 2 }, { slug: 'x', count: 1 }])
  })

  it('nome do agente sem o prefixo "Agente"', () => {
    expect(agentDisplayName('Agente Opex')).toBe('Opex')
    expect(agentDisplayName('agente   Maddox')).toBe('Maddox')
    expect(agentDisplayName('Revisor')).toBe('Revisor')
  })
})

describe('rótulos dos canais por central', () => {
  it('a sigla do repositório vira o título e o nome vai na dica; central desconhecida mantém a ponta do slug', () => {
    const labels = centralChannelLabels([
      { id: 'c1', sigla: 'OPE', projectName: 'Opex', repo: 'nandobfer/opex' },
      { id: 'c2', sigla: '', projectName: 'Sem sigla', repo: null },
    ])
    expect(channelNameParts(`${CENTRAL_CHANNEL_PREFIX}c1`, labels)).toEqual({ prefix: CENTRAL_CHANNEL_PREFIX, title: 'OPE', hint: 'Opex · nandobfer/opex' })
    expect(channelNameParts(`${CENTRAL_CHANNEL_PREFIX}c2`, labels).title).toBe('Sem sigla')
    expect(channelNameParts(`${CENTRAL_CHANNEL_PREFIX}c9`, labels)).toEqual({ prefix: CENTRAL_CHANNEL_PREFIX, title: 'c9', hint: null })
    expect(channelNameParts('agentes/opex/global', labels)).toEqual({ prefix: 'agentes/opex/', title: 'global', hint: null })
    expect(isCentralChannel(`${CENTRAL_CHANNEL_PREFIX}c1`)).toBe(true)
    expect(isCentralChannel('agentes/desenvolvedor/global')).toBe(false)
  })
})
