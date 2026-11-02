import type { Point, Rect } from "./network-math"

/**
 * Layout da visão inicial da rede do Engramind (OPE-113, puro): agentes numa linha em cima e canais
 * embaixo, as duas com a mesma largura. Com muito mais canais que agentes, os canais quebram em linhas
 * de uma grade alinhada, com corredores entre as colunas e faixas livres entre as linhas: os links dos
 * canais de baixo descem pelos corredores (`overviewLinkPath`) e nunca passam por cima de outro node.
 */

/** Distância vertical entre a linha de agentes (em cima) e a primeira linha de canais. */
export const OVERVIEW_ROW_GAP = 320
/** Passo horizontal mínimo entre agentes (pílula de até ~180 px). */
export const OVERVIEW_AGENT_GAP = 210
/** Passo horizontal entre canais numa linha só (card de até 288 px, `max-w-72`). */
export const OVERVIEW_CHANNEL_GAP = 310
/** Folga livre entre as colunas da grade de canais (o corredor por onde descem os links). */
export const OVERVIEW_CORRIDOR = 64
/** Caixa aproximada dos nodes, para o enquadramento inicial e as rotas. */
export const OVERVIEW_AGENT_BOX = { width: 180, height: 48 }
export const OVERVIEW_CHANNEL_BOX = { width: 288, height: 64 }
/** Passo horizontal entre as colunas da grade (várias linhas de canais). */
export const OVERVIEW_CHANNEL_COL = OVERVIEW_CHANNEL_BOX.width + OVERVIEW_CORRIDOR
/** Faixa livre entre duas linhas de canais (por onde o link chega ao canal). */
export const OVERVIEW_LANE = 96
/** Passo vertical entre as linhas de canais. */
export const OVERVIEW_CHANNEL_ROW_STEP = OVERVIEW_CHANNEL_BOX.height + OVERVIEW_LANE
/** Mínimo de colunas da grade (com poucos agentes, os canais não viram uma coluna estreita e alta). */
export const OVERVIEW_MIN_COLUMNS = 3
/** Folga do enquadramento inicial em cada lado (fração da largura). */
export const OVERVIEW_FIT_MARGIN = 0.15
/** Espalha os links que dividem um corredor (px entre vizinhos). */
const CORRIDOR_SPREAD = 6

/** Por onde o link de um canal de baixo desce: o x do corredor e o topo da faixa acima do canal. */
export interface OverviewRoute {
    corridorX: number
    /** y em que o link entra no corredor (acima da primeira linha de canais). */
    entryY: number
    /** y em que o link sai do corredor para a faixa logo acima da linha do canal. */
    laneY: number
}

export interface OverviewLayout {
    agents: Map<string, Point>
    channels: Map<string, Point>
    /** Linha (0 = a de cima) de cada canal. */
    rows: Map<string, number>
    rowCount: number
    columns: number
    columnGap: number
    /** Largura comum das duas fileiras (de centro a centro dos extremos). */
    width: number
}

const centered = (count: number, index: number, gap: number) => (index - (count - 1) / 2) * gap

/** y do centro da linha `row` de canais. */
export const channelRowY = (row: number) => OVERVIEW_ROW_GAP + row * OVERVIEW_CHANNEL_ROW_STEP

/**
 * Agentes agrupados por app numa linha em cima e canais em ordem de slug embaixo, com a mesma
 * largura. Uma linha de canais quando cabe na largura dos agentes (espalhados até ela); senão, uma
 * grade com tantas colunas quanto cabem na largura dos agentes (no mínimo `OVERVIEW_MIN_COLUMNS`), e
 * os agentes se espalham até a largura da grade. A última linha fica centralizada em colunas inteiras.
 */
export function layoutOverview(agents: readonly { id: string; app: string }[], channels: readonly { slug: string }[]): OverviewLayout {
    const sortedAgents = [...agents].sort((a, b) => a.app.localeCompare(b.app) || a.id.localeCompare(b.id))
    const sortedChannels = [...channels].sort((a, b) => a.slug.localeCompare(b.slug))
    const agentCount = sortedAgents.length
    const channelCount = sortedChannels.length
    const agentSpan = Math.max(0, agentCount - 1) * OVERVIEW_AGENT_GAP
    const singleSpan = Math.max(0, channelCount - 1) * OVERVIEW_CHANNEL_GAP

    let columns = Math.max(1, channelCount)
    let columnGap = OVERVIEW_CHANNEL_GAP
    if (singleSpan > agentSpan) {
        const fit = Math.floor(agentSpan / OVERVIEW_CHANNEL_COL) + 1
        const wanted = Math.min(channelCount, Math.max(fit, OVERVIEW_MIN_COLUMNS))
        if (wanted < channelCount) {
            columns = wanted
            columnGap = OVERVIEW_CHANNEL_COL
        }
    }
    const rowCount = channelCount ? Math.ceil(channelCount / columns) : 0
    const gridSpan = (columns - 1) * columnGap
    const width = Math.max(agentSpan, gridSpan)
    // Mesma largura: a fileira mais curta se espalha até a outra.
    if (columns > 1 && gridSpan < width) columnGap = width / (columns - 1)
    const agentGap = agentCount > 1 ? Math.max(OVERVIEW_AGENT_GAP, width / (agentCount - 1)) : 0

    const channelPoints = new Map<string, Point>()
    const rows = new Map<string, number>()
    sortedChannels.forEach((channel, index) => {
        const row = Math.floor(index / columns)
        const inRow = Math.min(columns, channelCount - row * columns)
        const column = (index % columns) + Math.floor((columns - inRow) / 2)
        channelPoints.set(channel.slug, { x: round(centered(columns, column, columnGap)), y: channelRowY(row) })
        rows.set(channel.slug, row)
    })
    return {
        agents: new Map(sortedAgents.map((agent, index) => [agent.id, { x: round(centered(agentCount, index, agentGap)), y: 0 }])),
        channels: channelPoints,
        rows,
        rowCount,
        columns,
        columnGap,
        width,
    }
}

/**
 * Rota do link de um canal de baixo (linha ≥ 1): o corredor ao lado da coluna do canal mais perto do
 * agente, com um pequeno deslocamento pelo índice do agente (links que dividem o corredor não se
 * sobrepõem por inteiro). Primeira linha: `null` (a curva direta não cruza nada).
 */
export function overviewRoute(layout: Pick<OverviewLayout, "columnGap" | "rows">, agent: Point, agentIndex: number, channel: Point, slug: string): OverviewRoute | null {
    const row = layout.rows.get(slug) ?? 0
    if (row === 0) return null
    const half = layout.columnGap / 2
    const left = channel.x - half
    const right = channel.x + half
    const base = Math.abs(agent.x - left) <= Math.abs(agent.x - right) ? left : right
    const room = Math.max(0, half - OVERVIEW_CHANNEL_BOX.width / 2 - 8)
    const offset = Math.max(-room, Math.min(room, ((agentIndex % 5) - 2) * CORRIDOR_SPREAD))
    const firstTop = channelRowY(0) - OVERVIEW_CHANNEL_BOX.height / 2
    const previousBottom = channelRowY(row - 1) + OVERVIEW_CHANNEL_BOX.height / 2
    return { corridorX: round(base + offset), entryY: firstTop - 16, laneY: previousBottom + 12 }
}

/** Curva vertical (sai para baixo, chega por cima): os pontos de controle ficam na altura do meio. */
const verticalCurve = (from: Point, to: Point) => {
    const mid = (from.y + to.y) / 2
    return `C ${from.x},${mid} ${to.x},${mid} ${to.x},${to.y}`
}

/**
 * Caminho SVG do link agente → canal. Sem rota: a curva vertical do centro do agente ao centro do
 * canal. Com rota: curva até a entrada do corredor, reta corredor abaixo e curva dentro da faixa até o
 * topo do canal (e o trecho final, escondido pelo próprio card, até o centro).
 */
export function overviewLinkPath(source: Point, target: Point, route: OverviewRoute | null): string {
    if (!route) return `M ${source.x},${source.y} ${verticalCurve(source, target)}`
    const entry = { x: route.corridorX, y: route.entryY }
    const lane = { x: route.corridorX, y: route.laneY }
    const top = { x: target.x, y: target.y - OVERVIEW_CHANNEL_BOX.height / 2 }
    return `M ${source.x},${source.y} ${verticalCurve(source, entry)} L ${lane.x},${lane.y} ${verticalCurve(lane, top)} L ${target.x},${target.y}`
}

/**
 * Pontos de um caminho de `overviewLinkPath` (amostrados), para testes e para o rótulo do link: as
 * curvas são Bézier cúbicas e as retas, segmentos.
 */
export function sampleOverviewPath(path: string, steps = 24): Point[] {
    const tokens = path.trim().split(/\s+/)
    const points: Point[] = []
    let current: Point = { x: 0, y: 0 }
    const read = (token: string): Point => {
        const [x, y] = token.split(",").map(Number)
        return { x: x ?? 0, y: y ?? 0 }
    }
    for (let index = 0; index < tokens.length; index += 1) {
        const command = tokens[index]
        if (command === "M") {
            current = read(tokens[(index += 1)]!)
            points.push(current)
        } else if (command === "L") {
            const to = read(tokens[(index += 1)]!)
            for (let step = 1; step <= steps; step += 1) points.push(lerp(current, to, step / steps))
            current = to
        } else if (command === "C") {
            const c1 = read(tokens[(index += 1)]!)
            const c2 = read(tokens[(index += 1)]!)
            const to = read(tokens[(index += 1)]!)
            for (let step = 1; step <= steps; step += 1) points.push(cubic(current, c1, c2, to, step / steps))
            current = to
        }
    }
    return points
}

/** Ponto do meio de um caminho (rótulo do modo da assinatura). */
export function overviewPathMidpoint(path: string): Point {
    const points = sampleOverviewPath(path, 12)
    return points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 }
}

/**
 * Enquadramento inicial: a largura comum das fileiras com `OVERVIEW_FIT_MARGIN` de folga de cada lado
 * e a altura dos agentes até a última linha de canais. Sem agentes: `null` (enquadra tudo).
 */
export function overviewInitialBounds(layout: Pick<OverviewLayout, "agents" | "channels" | "rowCount">): Rect | null {
    const agents = [...layout.agents.values()]
    if (!agents.length) return null
    const xs = [...agents.map((point) => point.x)]
    const channelXs = [...layout.channels.values()].map((point) => point.x)
    const halfAgent = OVERVIEW_AGENT_BOX.width / 2
    const halfChannel = OVERVIEW_CHANNEL_BOX.width / 2
    const left = Math.min(Math.min(...xs) - halfAgent, ...channelXs.map((x) => x - halfChannel))
    const right = Math.max(Math.max(...xs) + halfAgent, ...channelXs.map((x) => x + halfChannel))
    const margin = (right - left) * OVERVIEW_FIT_MARGIN
    const lastRow = Math.max(0, layout.rowCount - 1)
    const top = -OVERVIEW_AGENT_BOX.height / 2 - margin / 4
    const bottom = channelRowY(lastRow) + OVERVIEW_CHANNEL_BOX.height / 2 + margin / 4
    return { x: left - margin, y: top, width: right - left + margin * 2, height: bottom - top }
}

function lerp(a: Point, b: Point, t: number): Point {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
    const u = 1 - t
    return {
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    }
}

function round(value: number): number {
    return Math.round(value * 10) / 10
}
