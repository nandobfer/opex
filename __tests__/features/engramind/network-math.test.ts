import { describe, expect, it } from 'vitest'
import { deliveredChannels, parseTaggedContext } from '@/features/engramind/context-tagged'
import {
  agentDisplayName,
  agentReach,
  agentWritesOf,
  AGENT_WRITE_WINDOW_MS,
  isAuthoredByCenter,
  relevantSearchIds,
  clampCardRect,
  channelColors,
  PRIMARY_CHANNEL_COLOR,
  universeChannelColors,
  pickChannelColors,
  lastRealUseOf,
  lastUseOf,
  layoutUniverse,
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

/** OPE-109/OPE-114: cálculos puros da rede (cor pelo canal, tamanho, brilho, links, layout pela idade e estatísticas) e o contexto tagged. */

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

describe('cor pelo canal (OPE-114)', () => {
  it('buildParticles: a partícula usa a cor do canal; sem mapa, o roxo primário; inativa sem cor', () => {
    const colors = new Map([['opex', 'var(--chart-3)'], ['outro', 'var(--chart-5)']])
    const memories = [mem('a', { channel: 'opex', lastRetrievedAt: day(0) }), mem('b', { channel: 'outro' }), mem('c', { channel: 'opex', status: 'archived' })]
    const visuals = buildParticles(memories, { channelColors: colors, staleAfterDays: 30, now: NOW })
    expect(visuals.get('a')!.baseColor).toBe('var(--chart-3)')
    expect(visuals.get('a')!.color).toContain('var(--chart-3)')
    expect(visuals.get('b')!.baseColor).toBe('var(--chart-5)')
    expect(visuals.get('c')!.color).toBe('var(--color-muted-foreground)')
    expect(buildParticles([mem('d')], { staleAfterDays: 30, now: NOW }).get('d')!.baseColor).toBe(PRIMARY_CHANNEL_COLOR)
  })

  it('buildParticles: o tamanho segue só a relevância, não a idade', () => {
    const visuals = buildParticles([mem('nova', { createdAt: day(0), injections: 3 }), mem('velha', { createdAt: day(300), injections: 3 })], { staleAfterDays: 30, now: NOW })
    expect(visuals.get('nova')!.size).toBe(visuals.get('velha')!.size)
  })

  it('universo: o canal com mais memórias (inativas contam) fica com o roxo primário e os demais com a cor estável', () => {
    const base = channelColors(['a', 'b', 'c'])
    const memories = [mem('1', { channel: 'b' }), mem('2', { channel: 'b', status: 'archived' }), mem('3', { channel: 'a' })]
    const colors = universeChannelColors(base, memories)
    expect(colors.get('b')).toBe(PRIMARY_CHANNEL_COLOR)
    expect(colors.get('a')).toBe(base.get('a'))
    // Canal assinado sem memórias aparece com a cor estável.
    expect(colors.get('c')).toBe(base.get('c'))
    expect([...colors.values()].filter((color) => color === PRIMARY_CHANNEL_COLOR)).toHaveLength(1)
  })

  it('universo: empate vai para o menor slug (a primeira linha da legenda)', () => {
    const colors = universeChannelColors(channelColors(['zeta', 'alfa']), [mem('1', { channel: 'zeta' }), mem('2', { channel: 'alfa' })])
    expect(colors.get('alfa')).toBe(PRIMARY_CHANNEL_COLOR)
    expect(colors.get('zeta')).not.toBe(PRIMARY_CHANNEL_COLOR)
  })

  it('universo: o roxo é por universo; quem não é o maior mantém a mesma cor em qualquer universo', () => {
    const base = channelColors(['x', 'y', 'z'])
    const first = universeChannelColors(base, [mem('1', { channel: 'x' }), mem('2', { channel: 'x' }), mem('3', { channel: 'z' })])
    const second = universeChannelColors(base, [mem('4', { channel: 'y' }), mem('5', { channel: 'y' }), mem('6', { channel: 'x' }), mem('7', { channel: 'z' })])
    expect(first.get('x')).toBe(PRIMARY_CHANNEL_COLOR)
    expect(second.get('x')).toBe(base.get('x'))
    expect(second.get('y')).toBe(PRIMARY_CHANNEL_COLOR)
    expect(first.get('z')).toBe(second.get('z'))
  })

  it('universo de um canal só: roxo primário (também sem mapa); sem memórias, ninguém fica roxo', () => {
    expect(universeChannelColors(undefined, [mem('1', { channel: 'opex' })]).get('opex')).toBe(PRIMARY_CHANNEL_COLOR)
    const empty = universeChannelColors(channelColors(['a']), [])
    expect(empty.get('a')).toBe(channelColors(['a']).get('a'))
    expect([...empty.values()]).not.toContain(PRIMARY_CHANNEL_COLOR)
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
    const base = `var(--chart-${(stableHash('opex') % 5) + 2})`
    expect(one.get('opex')).toBe(base)
    expect(many.get('opex')).toContain(base)
    expect(new Set(many.values()).size).toBe(8)
  })

  it('o roxo primário (--chart-1) fica fora da paleta estável dos canais', () => {
    const colors = channelColors(Array.from({ length: 40 }, (_, index) => `canal-${index}`))
    for (const color of colors.values()) {
      expect(color).not.toContain('--chart-1)')
      expect(color).not.toContain('--color-primary')
    }
  })

  it('regressão: o mesmo canal tem a mesma cor em universos diferentes, mesmo quando colide na base', () => {
    const base = (slug: string) => stableHash(slug) % 5
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
  it('card da memória: centralizado sobre a partícula e sempre inteiro dentro do quadro', () => {
    const canvas = { width: 800, height: 600 }
    const card = { width: 288, height: 300 }
    expect(clampCardRect({ x: 400, y: 300 }, card, canvas)).toEqual({ x: 256, y: 150 })
    expect(clampCardRect({ x: 0, y: 0 }, card, canvas)).toEqual({ x: 8, y: 8 })
    expect(clampCardRect({ x: 800, y: 600 }, card, canvas)).toEqual({ x: 800 - 288 - 8, y: 600 - 300 - 8 })
    expect(clampCardRect({ x: 790, y: 5 }, card, canvas)).toEqual({ x: 504, y: 8 })
    expect(clampCardRect({ x: 50, y: 50 }, card, { width: 200, height: 200 })).toEqual({ x: 8, y: 8 })
  })

  it('universo: as mais novas na órbita interna (o uso não muda a distância) e nenhuma partícula sobreposta', () => {
    // m0 é a mais nova e a menos usada; m59, a mais antiga e a mais usada.
    const memories = Array.from({ length: 60 }, (_, index) => mem(`m${index}`, { createdAt: day(index), injections: index }))
    const positions = layoutUniverse(memories)
    const radius = (id: string) => Math.hypot(positions.get(id)!.x, positions.get(id)!.y)
    expect(Math.round(radius('m0'))).toBe(UNIVERSE_FIRST_RADIUS)
    // Anéis equilibrados: 60 memórias em 3 anéis (≈ 15/20/25), as mais novas por dentro.
    expect(universeRingCounts(60)).toHaveLength(3)
    expect(radius('m59')).toBeGreaterThan(radius('m0'))
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

  it('universo com 50 memórias: as mais novas no anel de dentro e o último anel cheio', () => {
    const memories = Array.from({ length: 50 }, (_, index) => mem(`m${index}`, { createdAt: day(index) }))
    const positions = layoutUniverse(memories)
    const ring = (id: string) => Math.round((Math.hypot(positions.get(id)!.x, positions.get(id)!.y) - UNIVERSE_FIRST_RADIUS) / UNIVERSE_RING_GAP)
    // Idade em dias: maior = mais antiga.
    const byRing = [0, 1, 2].map((index) => memories.filter((memory) => ring(memory.id) === index).map((memory) => Number(memory.id.slice(1))))
    expect(byRing.map((items) => items.length)).toEqual([12, 17, 21])
    expect(Math.max(...byRing[0]!)).toBeLessThan(Math.min(...byRing[1]!))
    expect(Math.max(...byRing[1]!)).toBeLessThan(Math.min(...byRing[2]!))
  })

  it('universo: memória com data de criação inválida vai para o anel externo', () => {
    const memories = [...Array.from({ length: 30 }, (_, index) => mem(`m${index}`, { createdAt: day(index) })), mem('sem-data', { createdAt: 'invalida' })]
    const positions = layoutUniverse(memories)
    const radius = (id: string) => Math.hypot(positions.get(id)!.x, positions.get(id)!.y)
    expect(radius('sem-data')).toBeGreaterThan(radius('m0'))
    expect(Math.round(radius('sem-data'))).toBe(Math.round(Math.max(...memories.map((memory) => radius(memory.id)))))
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
  it('OPE-113: link destacado só quando o agente do centro escreveu a memória', () => {
    expect(isAuthoredByCenter({ authorAgent: 'opex/opex' }, { kind: 'agent', id: 'opex/opex' })).toBe(true)
    expect(isAuthoredByCenter({ authorAgent: 'outro/bot' }, { kind: 'agent', id: 'opex/opex' })).toBe(false)
    expect(isAuthoredByCenter({ authorAgent: null }, { kind: 'agent', id: 'opex/opex' })).toBe(false)
    expect(isAuthoredByCenter({ authorAgent: 'opex/opex' }, { kind: 'channel', id: 'opex/opex' })).toBe(false)
  })

  it('OPE-113: criação por agente só conta para memória nova com agente autor criada há pouco', () => {
    const at = Date.parse('2026-11-02T12:00:00Z')
    const list = [
      { id: 'a', authorAgent: 'opex/opex', channel: 'opex', createdAt: '2026-11-02T11:59:30Z' },
      { id: 'b', authorAgent: null, channel: 'opex', createdAt: '2026-11-02T11:59:30Z' },
      { id: 'c', authorAgent: 'opex/opex', channel: 'opex', createdAt: new Date(at - AGENT_WRITE_WINDOW_MS - 1000).toISOString() },
    ]
    expect(agentWritesOf(['a', 'b', 'c', 'x'], list, at)).toEqual([{ id: 'a', agent: 'opex/opex', channel: 'opex' }])
    expect(agentWritesOf([], list, at)).toEqual([])
  })

  it('OPE-113: busca híbrida destaca o que os dois ramos acharam e o top 3 de um ramo sozinho (sentido forte); o resto do vetorial não; modo texto destaca tudo', () => {
    const hits = [
      { score: 0.0325, memory: { id: 'both' } },
      { score: 1 / 61, memory: { id: 'vector-1st' } },
      { score: 1 / 63, memory: { id: 'vector-3rd' } },
      { score: 1 / 64, memory: { id: 'vector-4th' } },
      { score: 0.0102, memory: { id: 'vector-last' } },
      { score: 2 / 110, memory: { id: 'both-last' } },
    ]
    expect(relevantSearchIds(hits, 'hybrid')).toEqual(['both', 'vector-1st', 'vector-3rd', 'both-last'])
    expect(relevantSearchIds(hits, 'text')).toHaveLength(6)
    // Pesos da configuração: com o vetor valendo 2, o corte do top 3 de um ramo é 2/63.
    expect(relevantSearchIds([{ score: 2 / 61, memory: { id: 'vector-1st' } }, { score: 2 / 70, memory: { id: 'vector-10th' } }], 'hybrid', { vectorWeight: 2, textWeight: 1, k: 60 })).toEqual(['vector-1st'])
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
