import { describe, expect, it } from 'vitest'
import {
  layoutOverview,
  OVERVIEW_FIT_MARGIN,
  OVERVIEW_PADDING,
  OVERVIEW_SCALE_MAX,
  OVERVIEW_SCALE_MIN,
  overviewInitialBounds,
  overviewLinkMidpoint,
  overviewLinkPath,
  overviewScale,
  type OverviewLayout,
  type OverviewLayoutInput,
  type OverviewLayoutMode,
} from '@/features/engramind/network/overview-layout'

/** OPE-113: visão inicial em duas distribuições (canais junto dos agentes / agentes no centro), cards pelo tamanho. */

const agent = (id: string, app = 'app') => ({ id: `${app}/${id}`, app })
const channel = (slug: string) => ({ slug })
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

function overlaps(layout: OverviewLayout): string[] {
  const items = [...[...layout.agents].map(([id, point]) => ({ key: `agent:${id}`, point })), ...[...layout.channels].map(([slug, point]) => ({ key: `channel:${slug}`, point }))]
  const found: string[] = []
  items.forEach((a, i) =>
    items.slice(i + 1).forEach((b) => {
      const ba = layout.boxes.get(a.key)!
      const bb = layout.boxes.get(b.key)!
      // Sem encostar: a folga pode ser menor que a do layout, mas os cards não se tocam.
      if (Math.abs(a.point.x - b.point.x) < (ba.width + bb.width) / 2 && Math.abs(a.point.y - b.point.y) < (ba.height + bb.height) / 2) found.push(`${a.key} × ${b.key}`)
    }),
  )
  return found
}

/** Rede com canais exclusivos, compartilhados entre dois, de todos e soltos. */
function scenario(agentCount: number, exclusivePerAgent: number, shared: number, loose = 0): OverviewLayoutInput {
  const agents = Array.from({ length: agentCount }, (_, index) => agent(`a${index}`, index % 2 ? 'outro' : 'app'))
  const channels: { slug: string }[] = []
  const links: { agent: string; channel: string }[] = []
  agents.forEach((item, index) => {
    for (let k = 0; k < exclusivePerAgent; k += 1) {
      channels.push(channel(`ex-${index}-${k}`))
      links.push({ agent: item.id, channel: `ex-${index}-${k}` })
    }
  })
  for (let k = 0; k < shared; k += 1) {
    const slug = `sh-${k}`
    channels.push(channel(slug))
    const first = k % agents.length
    links.push({ agent: agents[first]!.id, channel: slug }, { agent: agents[(first + 1) % agents.length]!.id, channel: slug })
  }
  if (agents.length > 2) {
    channels.push(channel('todos'))
    for (const item of agents) links.push({ agent: item.id, channel: 'todos' })
  }
  for (let k = 0; k < loose; k += 1) channels.push(channel(`solto-${k}`))
  const channelCounts = new Map(channels.map((item, index) => [item.slug, (index * 7) % 40]))
  return { agents, channels, links, channelCounts, agentCounts: new Map(agents.map((item, index) => [item.id, index * 10])) }
}

const MODES: OverviewLayoutMode[] = ['by-agent', 'agents-center']
const CASES: [number, number, number, number][] = [
  [1, 3, 0, 0],
  [2, 2, 1, 1],
  [3, 4, 3, 2],
  [5, 2, 6, 0],
  [8, 3, 10, 3],
  [2, 0, 12, 0],
  [4, 10, 2, 5],
]

describe('tamanho dos cards', () => {
  it('escala log entre o mínimo e o máximo; tudo zero fica no mínimo', () => {
    expect(overviewScale(0, 0)).toBe(OVERVIEW_SCALE_MIN)
    expect(overviewScale(0, 50)).toBe(OVERVIEW_SCALE_MIN)
    expect(overviewScale(50, 50)).toBe(OVERVIEW_SCALE_MAX)
    expect(overviewScale(5, 50)).toBeGreaterThan(OVERVIEW_SCALE_MIN)
    expect(overviewScale(5, 50)).toBeLessThan(overviewScale(20, 50))
  })

  it('o maior alcance e o canal com mais memórias têm a maior escala', () => {
    const layout = layoutOverview(scenario(3, 2, 1))
    const agentScales = [...layout.agents.keys()].map((id) => layout.scales.get(`agent:${id}`)!)
    expect(layout.scales.get('agent:app/a2')).toBe(Math.max(...agentScales))
    expect(layout.boxes.get('agent:app/a2')!.width).toBeCloseTo(180 * OVERVIEW_SCALE_MAX)
  })
})

describe.each(MODES)('distribuição %s', (mode) => {
  it.each(CASES)('nenhum card se sobrepõe (%i agentes, %i exclusivos cada, %i compartilhados, %i soltos)', (agents, exclusive, shared, loose) => {
    expect(overlaps(layoutOverview({ ...scenario(agents, exclusive, shared, loose), mode }))).toEqual([])
  })

  it('mesmo resultado para a mesma entrada', () => {
    const input = { ...scenario(4, 2, 3, 1), mode }
    const a = layoutOverview(input)
    const b = layoutOverview({ ...input, agents: [...input.agents].reverse(), channels: [...input.channels].reverse() })
    expect([...b.agents]).toEqual([...a.agents])
    expect([...b.channels].sort()).toEqual([...a.channels].sort())
  })

  it('o enquadramento inicial cobre todos os cards com folga', () => {
    const layout = layoutOverview({ ...scenario(3, 2, 2, 1), mode })
    const bounds = overviewInitialBounds(layout)!
    for (const [slug, point] of layout.channels) {
      const box = layout.boxes.get(`channel:${slug}`)!
      expect(point.x - box.width / 2).toBeGreaterThanOrEqual(bounds.x)
      expect(point.x + box.width / 2).toBeLessThanOrEqual(bounds.x + bounds.width)
      expect(point.y - box.height / 2).toBeGreaterThanOrEqual(bounds.y)
      expect(point.y + box.height / 2).toBeLessThanOrEqual(bounds.y + bounds.height)
    }
    expect(overviewInitialBounds(layoutOverview({ agents: [], channels: [], links: [], mode }))).toBeNull()
  })

  it('um agente só fica no centro', () => {
    const layout = layoutOverview({ ...scenario(1, 3, 0), mode })
    expect(layout.agents.get('app/a0')).toEqual({ x: 0, y: 0 })
  })
})

describe('canais junto dos agentes (padrão)', () => {
  it('é a distribuição padrão', () => {
    expect(layoutOverview(scenario(2, 1, 0)).mode).toBe('by-agent')
  })

  it('canal exclusivo fica mais perto do seu agente que de qualquer outro', () => {
    const layout = layoutOverview(scenario(4, 3, 2))
    for (const [slug, point] of layout.channels) {
      if (!slug.startsWith('ex-')) continue
      const owner = `${Number(slug.split('-')[1]) % 2 ? 'outro' : 'app'}/a${slug.split('-')[1]}`
      const mine = dist(point, layout.agents.get(owner)!)
      for (const [id, other] of layout.agents) if (id !== owner) expect(mine).toBeLessThan(dist(point, other))
    }
  })

  it('canal de dois agentes fica entre eles; o de todos perto do meio; o solto fora dos agentes', () => {
    const layout = layoutOverview(scenario(4, 2, 1, 1))
    const a = layout.agents.get('app/a0')!
    const b = layout.agents.get('outro/a1')!
    const shared = layout.channels.get('sh-0')!
    expect(dist(shared, a)).toBeLessThan(dist(a, b))
    expect(dist(shared, b)).toBeLessThan(dist(a, b))
    const farthestAgent = Math.max(...[...layout.agents.values()].map((point) => Math.hypot(point.x, point.y)))
    expect(Math.hypot(layout.channels.get('todos')!.x, layout.channels.get('todos')!.y)).toBeLessThan(farthestAgent)
    expect(Math.hypot(layout.channels.get('solto-0')!.x, layout.channels.get('solto-0')!.y)).toBeGreaterThan(farthestAgent)
  })
})

describe('agentes no centro', () => {
  it('todos os agentes ficam dentro do anel dos canais', () => {
    const layout = layoutOverview({ ...scenario(5, 2, 3, 2), mode: 'agents-center' })
    const farthestAgent = Math.max(...[...layout.agents.values()].map((point) => Math.hypot(point.x, point.y)))
    for (const point of layout.channels.values()) expect(Math.hypot(point.x, point.y)).toBeGreaterThan(farthestAgent)
  })

  it('canal de um agente fica do lado dele (mais perto dele que do agente oposto)', () => {
    const layout = layoutOverview({ ...scenario(4, 1, 0), mode: 'agents-center' })
    const own = layout.channels.get('ex-0-0')!
    expect(dist(own, layout.agents.get('app/a0')!)).toBeLessThan(dist(own, layout.agents.get('app/a2')!))
  })
})

describe('links', () => {
  it('curva suave de centro a centro, com o meio deslocado para o lado', () => {
    const path = overviewLinkPath({ x: 0, y: 0 }, { x: 100, y: 0 })
    expect(path).toMatch(/^M0,0 Q50,\d+(\.\d)? 100,0$/)
    const mid = overviewLinkMidpoint({ x: 0, y: 0 }, { x: 100, y: 0 })
    expect(mid.x).toBe(50)
    expect(mid.y).toBeGreaterThan(0)
  })

  it('o enquadramento usa a folga declarada', () => {
    expect(OVERVIEW_FIT_MARGIN).toBe(0.1)
    expect(OVERVIEW_PADDING).toBeGreaterThan(0)
  })
})
