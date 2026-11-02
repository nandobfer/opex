import { describe, expect, it } from 'vitest'
import {
  channelRowY,
  layoutOverview,
  OVERVIEW_AGENT_BOX,
  OVERVIEW_AGENT_GAP,
  OVERVIEW_CHANNEL_BOX,
  OVERVIEW_CHANNEL_COL,
  OVERVIEW_CHANNEL_GAP,
  OVERVIEW_FIT_MARGIN,
  OVERVIEW_MIN_COLUMNS,
  OVERVIEW_ROW_GAP,
  overviewInitialBounds,
  overviewLinkPath,
  overviewRoute,
  sampleOverviewPath,
} from '@/features/engramind/network/overview-layout'

/** OPE-113: visão inicial com linhas balanceadas e links que não atravessam outros nodes. */

const agents = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `app/a${String(index).padStart(2, '0')}`, app: 'app' }))
const channels = (count: number) => Array.from({ length: count }, (_, index) => ({ slug: `c${String(index).padStart(2, '0')}` }))
const span = (points: Iterable<{ x: number }>) => {
  const xs = [...points].map((point) => point.x)
  return Math.max(...xs) - Math.min(...xs)
}

interface Box { x: number; y: number; width: number; height: number; id: string }
const boxesOf = (layout: ReturnType<typeof layoutOverview>): Box[] => [
  ...[...layout.agents].map(([id, point]) => ({ id: `agent:${id}`, x: point.x, y: point.y, ...OVERVIEW_AGENT_BOX })),
  ...[...layout.channels].map(([id, point]) => ({ id: `channel:${id}`, x: point.x, y: point.y, ...OVERVIEW_CHANNEL_BOX })),
]
const inside = (point: { x: number; y: number }, box: Box) => Math.abs(point.x - box.x) < box.width / 2 && Math.abs(point.y - box.y) < box.height / 2

/** Todo link agente → canal: nenhum ponto do caminho cai dentro de outro node. */
function crossings(layout: ReturnType<typeof layoutOverview>): string[] {
  const boxes = boxesOf(layout)
  const problems: string[] = []
  const agentIds = [...layout.agents.keys()]
  agentIds.forEach((agent, index) => {
    const source = layout.agents.get(agent)!
    for (const [slug, target] of layout.channels) {
      const route = overviewRoute(layout, source, index, target, slug)
      const points = sampleOverviewPath(overviewLinkPath(source, target, route), 60)
      for (const box of boxes) {
        if (box.id === `agent:${agent}` || box.id === `channel:${slug}`) continue
        if (points.some((point) => inside(point, box))) problems.push(`${agent}→${slug} cruza ${box.id}`)
      }
    }
  })
  return problems
}

describe('layout da visão inicial', () => {
  it('agentes numa linha em cima e canais embaixo, centralizados; poucos canais se espalham até a largura dos agentes', () => {
    const layout = layoutOverview(agents(6), channels(3))
    expect([...layout.agents.values()].every((point) => point.y === 0)).toBe(true)
    expect([...layout.channels.values()].every((point) => point.y === OVERVIEW_ROW_GAP)).toBe(true)
    expect(layout.rowCount).toBe(1)
    expect(span(layout.agents.values())).toBe(5 * OVERVIEW_AGENT_GAP)
    expect(span(layout.channels.values())).toBeCloseTo(span(layout.agents.values()))
    expect([...layout.channels.values()].reduce((sum, point) => sum + point.x, 0)).toBeCloseTo(0)
  })

  it('canais que cabem numa linha mais larga que os agentes: os agentes se espalham até ela', () => {
    const layout = layoutOverview(agents(2), channels(3))
    expect(layout.rowCount).toBe(1)
    expect(span(layout.channels.values())).toBe(2 * OVERVIEW_CHANNEL_GAP)
    expect(span(layout.agents.values())).toBeCloseTo(2 * OVERVIEW_CHANNEL_GAP)
  })

  it('muito mais canais que agentes: várias linhas de colunas alinhadas, com a mesma largura dos agentes', () => {
    const layout = layoutOverview(agents(8), channels(20))
    expect(layout.rowCount).toBeGreaterThan(1)
    expect(layout.columns).toBe(Math.floor((7 * OVERVIEW_AGENT_GAP) / OVERVIEW_CHANNEL_COL) + 1)
    expect(span(layout.channels.values())).toBeCloseTo(span(layout.agents.values()))
    const columnXs = new Set([...layout.channels.values()].map((point) => point.x))
    expect(columnXs.size).toBe(layout.columns)
    expect(new Set([...layout.channels.values()].map((point) => point.y))).toEqual(new Set(Array.from({ length: layout.rowCount }, (_, row) => channelRowY(row))))
  })

  it('poucos agentes: a grade tem no mínimo 3 colunas (não vira uma coluna alta) e os agentes se espalham até ela', () => {
    const layout = layoutOverview(agents(1), channels(10))
    expect(layout.columns).toBe(OVERVIEW_MIN_COLUMNS)
    expect(layout.rowCount).toBe(4)
    const single = layoutOverview(agents(2), channels(10))
    expect(span(single.agents.values())).toBeCloseTo(span(single.channels.values()))
  })

  it('última linha incompleta centralizada em colunas inteiras (alinhada com as de cima)', () => {
    const layout = layoutOverview(agents(1), channels(7))
    const columns = new Set([...layout.channels.values()].filter((point) => point.y === channelRowY(0)).map((point) => point.x))
    const last = [...layout.channels.values()].filter((point) => point.y === channelRowY(layout.rowCount - 1))
    expect(last).toHaveLength(1)
    expect(columns.has(last[0]!.x)).toBe(true)
  })

  it.each([
    [3, 2],
    [6, 3],
    [2, 12],
    [8, 20],
    [1, 10],
    [4, 37],
    [12, 9],
  ])('nenhum link atravessa canal ou agente que não é o seu (%i agentes, %i canais)', (agentCount, channelCount) => {
    expect(crossings(layoutOverview(agents(agentCount), channels(channelCount)))).toEqual([])
  })

  it('links da primeira linha: curva direta; das linhas de baixo: pelo corredor entre as colunas', () => {
    const layout = layoutOverview(agents(2), channels(9))
    const agent = layout.agents.get('app/a00')!
    expect(overviewRoute(layout, agent, 0, layout.channels.get('c00')!, 'c00')).toBeNull()
    const route = overviewRoute(layout, agent, 0, layout.channels.get('c08')!, 'c08')!
    expect(route).not.toBeNull()
    expect(route.entryY).toBeLessThan(channelRowY(0) - OVERVIEW_CHANNEL_BOX.height / 2)
    expect(route.laneY).toBeGreaterThan(channelRowY(1) + OVERVIEW_CHANNEL_BOX.height / 2)
  })
})

describe('enquadramento inicial', () => {
  it('a largura comum com folga de cada lado e a altura até a última linha de canais; sem agentes, tudo', () => {
    const layout = layoutOverview(agents(3), channels(20))
    const bounds = overviewInitialBounds(layout)!
    const width = span(layout.channels.values()) + OVERVIEW_CHANNEL_BOX.width
    expect(bounds.width).toBeCloseTo(width * (1 + 2 * OVERVIEW_FIT_MARGIN))
    expect(bounds.y).toBeLessThan(-OVERVIEW_AGENT_BOX.height / 2 + 1)
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(channelRowY(layout.rowCount - 1) + OVERVIEW_CHANNEL_BOX.height / 2)
    expect(overviewInitialBounds(layoutOverview([], channels(3)))).toBeNull()
  })
})
