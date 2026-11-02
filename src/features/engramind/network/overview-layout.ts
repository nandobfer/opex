import type { Point, Rect } from "./network-math"

/**
 * Layout da visão inicial da rede do Engramind (OPE-113, puro). Duas distribuições, escolhidas na
 * legenda do diagrama:
 * - `by-agent` ("Canais junto dos agentes", padrão): o canal de um agente só orbita esse agente; o
 *   canal compartilhado fica entre os agentes que o usam (no centroide deles);
 * - `agents-center` ("Agentes no centro"): agentes num círculo no meio e canais em anéis em volta, cada
 *   canal no ângulo médio dos agentes que o usam.
 * Os cards (os mesmos de sempre) crescem com as memórias (`overviewScale`) e nunca se sobrepõem: um
 * afastamento determinístico separa o que encostar, e o círculo cresce enquanto sobrar sobreposição.
 * Os links são curvas suaves de centro a centro: minimizam cruzamentos, sem garantia absoluta.
 */

export type OverviewLayoutMode = "by-agent" | "agents-center"
export const OVERVIEW_LAYOUT_MODES = ["by-agent", "agents-center"] as const satisfies readonly OverviewLayoutMode[]
export const DEFAULT_OVERVIEW_LAYOUT: OverviewLayoutMode = "by-agent"
export const OVERVIEW_LAYOUT_LABEL: Record<OverviewLayoutMode, string> = { "by-agent": "Órbita", "agents-center": "Radial" }

/** Caixa dos cards em escala 1 (pílula do agente até 180 px; card do canal até 288 px, `max-w-72`). */
export const OVERVIEW_AGENT_BOX = { width: 180, height: 48 }
export const OVERVIEW_CHANNEL_BOX = { width: 288, height: 64 }
/** Faixa de escala dos cards pela quantidade de memórias (log). */
export const OVERVIEW_SCALE_MIN = 0.85
export const OVERVIEW_SCALE_MAX = 1.6
/** Folga mínima entre dois cards. */
export const OVERVIEW_PADDING = 16
/** Folga do enquadramento inicial em cada lado (fração do tamanho). */
export const OVERVIEW_FIT_MARGIN = 0.1
/** Curvatura dos links (fração do comprimento, para o lado). */
export const OVERVIEW_LINK_BEND = 0.12

const RELAX_STEPS = 160
/** Passadas finais só de afastamento (até ninguém encostar). */
const SEPARATE_STEPS = 600
/**
 * Caso residual: se ainda sobrar sobreposição, o círculo de agentes cresce pouco e poucas vezes. O
 * conflito comum (canais compartilhados no mesmo centroide) não depende do círculo: quem resolve é o
 * afastamento dos cards móveis, nunca o crescimento sem teto (a rede explodia a ~27.000 px).
 */
const MAX_ATTEMPTS = 3
const GROWTH = 1.1
/** Radial um pouco mais compacta (OPE-113, rodada 3). */
const RADIAL_RING_GAP = 0.8
const RADIAL_SLOT = 1.7
const RADIAL_INNER = 0.85

export interface OverviewLayoutInput {
    agents: readonly { id: string; app: string }[]
    channels: readonly { slug: string }[]
    /** Assinaturas visíveis (agente → canal). */
    links: readonly { agent: string; channel: string }[]
    /** Memórias por agente (alcance) e por canal: o tamanho dos cards. */
    agentCounts?: ReadonlyMap<string, number>
    channelCounts?: ReadonlyMap<string, number>
    mode?: OverviewLayoutMode
}

export interface OverviewLayout {
    agents: Map<string, Point>
    channels: Map<string, Point>
    /** Escala de cada card (`agent:<id>` / `channel:<slug>`). */
    scales: Map<string, number>
    /** Caixa de cada card já escalada. */
    boxes: Map<string, { width: number; height: number }>
    mode: OverviewLayoutMode
}

const round = (value: number) => Math.round(value * 10) / 10 || 0

/** Escala do card pela quantidade de memórias, em log entre `OVERVIEW_SCALE_MIN` e `OVERVIEW_SCALE_MAX`. */
export function overviewScale(count: number, max: number): number {
    if (max <= 0 || count <= 0) return OVERVIEW_SCALE_MIN
    const ratio = Math.min(1, Math.log1p(count) / Math.log1p(max))
    return Math.round((OVERVIEW_SCALE_MIN + (OVERVIEW_SCALE_MAX - OVERVIEW_SCALE_MIN) * ratio) * 1000) / 1000
}

interface Body {
    key: string
    x: number
    y: number
    width: number
    height: number
    /** Agentes e canais exclusivos ficam parados; compartilhados e soltos se afastam. */
    fixed: boolean
    /** Ponto a que o card volta aos poucos (centroide ou lugar no anel). */
    anchor: Point | null
}

/** Penetração entre duas caixas (com a folga); `null` sem sobreposição. */
function overlap(a: Body, b: Body): { x: number; y: number } | null {
    const ox = (a.width + b.width) / 2 + OVERVIEW_PADDING - Math.abs(a.x - b.x)
    const oy = (a.height + b.height) / 2 + OVERVIEW_PADDING - Math.abs(a.y - b.y)
    // Meio pixel de tolerância: encostar por erro de arredondamento não conta (senão o afastamento empurra 1e-13 para sempre).
    return ox > 0.5 && oy > 0.5 ? { x: ox, y: oy } : null
}

/** Uma passada de afastamento: separa cada par sobreposto pela menor penetração. Devolve se mexeu. */
function separate(bodies: Body[]): boolean {
    let moved = false
    for (let i = 0; i < bodies.length; i += 1)
        for (let j = i + 1; j < bodies.length; j += 1) {
            const a = bodies[i]!
            const b = bodies[j]!
            if (a.fixed && b.fixed) continue
            const hit = overlap(a, b)
            if (!hit) continue
            moved = true
            const share = a.fixed || b.fixed ? 1 : 0.5
            // Sem direção (mesmo ponto): sai para um lado pelo índice, para ser determinístico.
            const dx = a.x - b.x || (j % 2 ? 1 : -1)
            const dy = a.y - b.y || (i % 2 ? 1 : -1)
            const push = hit.x < hit.y ? { x: Math.sign(dx) * hit.x, y: 0 } : { x: 0, y: Math.sign(dy) * hit.y }
            if (!a.fixed) {
                a.x += push.x * share
                a.y += push.y * share
            }
            if (!b.fixed) {
                b.x -= push.x * share
                b.y -= push.y * share
            }
        }
    return moved
}

/**
 * Afasta os cards móveis que se sobrepõem, com uma volta suave ao ponto de origem (centroide ou lugar no
 * anel); no fim, só afastamento até ninguém mais encostar.
 */
function relax(bodies: Body[]): void {
    for (let step = 0; step < RELAX_STEPS; step += 1) {
        for (const body of bodies)
            if (!body.fixed && body.anchor) {
                body.x += (body.anchor.x - body.x) * 0.04
                body.y += (body.anchor.y - body.y) * 0.04
            }
        separate(bodies)
    }
    for (let step = 0; step < SEPARATE_STEPS && separate(bodies); step += 1) {
        // só afastamento
    }
}

const hasOverlap = (bodies: readonly Body[]) => bodies.some((a, i) => bodies.some((b, j) => j > i && overlap(a, b) !== null))

/**
 * Pontos num círculo com espaço proporcional a cada item (`sizes` = "raio" de cada um, já com folga):
 * o raio é o menor em que cada par vizinho fica a pelo menos a soma dos dois.
 */
function circle(sizes: readonly number[], minRadius = 0, startAngle = -Math.PI / 2): { radius: number; angles: number[] } {
    const count = sizes.length
    if (count === 0) return { radius: 0, angles: [] }
    if (count === 1) return { radius: 0, angles: [startAngle] }
    const gaps = sizes.map((size, index) => size + sizes[(index + 1) % count]!)
    const total = gaps.reduce((sum, value) => sum + value, 0)
    const steps = gaps.map((gap) => (gap / total) * 2 * Math.PI)
    let radius = Math.max(minRadius, total / (2 * Math.PI))
    for (let guard = 0; guard < 60; guard += 1) {
        const ok = steps.every((step, index) => 2 * radius * Math.sin(Math.min(step, Math.PI) / 2) >= gaps[index]! - 0.5)
        if (ok) break
        radius *= 1.08
    }
    const angles: number[] = []
    let angle = startAngle
    for (const step of steps) {
        angles.push(angle)
        angle += step
    }
    return { radius, angles }
}

/** "Raio" de um card para os círculos: metade da diagonal, com metade da folga. */
const reach = (box: { width: number; height: number }) => Math.hypot(box.width, box.height) / 2 + OVERVIEW_PADDING / 2

/** Média circular dos ângulos (`null` quando se anulam ou não há nenhum). */
function meanAngle(angles: readonly number[]): number | null {
    if (!angles.length) return null
    const x = angles.reduce((sum, angle) => sum + Math.cos(angle), 0)
    const y = angles.reduce((sum, angle) => sum + Math.sin(angle), 0)
    return Math.hypot(x, y) < 1e-6 ? null : Math.atan2(y, x)
}

/** Canais em anéis em volta de `inner`, na ordem dada; mais anéis quando não cabem num só. */
function rings(boxes: readonly { width: number; height: number }[], inner: number, preferred: readonly (number | null)[]): Point[] {
    if (!boxes.length) return []
    const widest = Math.max(...boxes.map((box) => box.width))
    const ringGap = RADIAL_RING_GAP * widest + OVERVIEW_PADDING
    const slot = (index: number) => reach(boxes[index]!) * RADIAL_SLOT
    const points: Point[] = new Array(boxes.length)
    let start = 0
    let radius = inner + reach({ width: widest, height: Math.max(...boxes.map((box) => box.height)) })
    while (start < boxes.length) {
        let used = 0
        let end = start
        while (end < boxes.length && (end === start || used + slot(end) <= 2 * Math.PI * radius)) {
            used += slot(end)
            end += 1
        }
        const count = end - start
        const step = (2 * Math.PI) / count
        // Gira o anel para os ângulos preferidos (média do quanto cada um quer se deslocar).
        const shifts = Array.from({ length: count }, (_, index) => preferred[start + index]).flatMap((angle, index) => (angle === null || angle === undefined ? [] : [angle - (index * step - Math.PI / 2)]))
        const offset = meanAngle(shifts) ?? 0
        for (let index = 0; index < count; index += 1) {
            const angle = -Math.PI / 2 + index * step + offset
            points[start + index] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
        }
        start = end
        radius += ringGap
    }
    return points
}

/** Distribui agentes e canais (ver o topo do arquivo). Mesmo resultado para a mesma entrada. */
export function layoutOverview(input: OverviewLayoutInput): OverviewLayout {
    const mode = input.mode ?? DEFAULT_OVERVIEW_LAYOUT
    const agents = [...input.agents].sort((a, b) => a.app.localeCompare(b.app) || a.id.localeCompare(b.id))
    const channels = [...input.channels].sort((a, b) => a.slug.localeCompare(b.slug))
    const agentIds = new Set(agents.map((agent) => agent.id))
    const channelIds = new Set(channels.map((channel) => channel.slug))
    const usersOf = new Map<string, string[]>()
    for (const link of input.links) {
        if (!agentIds.has(link.agent) || !channelIds.has(link.channel)) continue
        const list = usersOf.get(link.channel) ?? []
        if (!list.includes(link.agent)) list.push(link.agent)
        usersOf.set(link.channel, list)
    }
    const maxAgent = Math.max(0, ...agents.map((agent) => input.agentCounts?.get(agent.id) ?? 0))
    const maxChannel = Math.max(0, ...channels.map((channel) => input.channelCounts?.get(channel.slug) ?? 0))
    const scales = new Map<string, number>()
    const boxes = new Map<string, { width: number; height: number }>()
    const boxOf = (key: string, base: { width: number; height: number }, scale: number) => {
        scales.set(key, scale)
        const box = { width: round(base.width * scale), height: round(base.height * scale) }
        boxes.set(key, box)
        return box
    }
    for (const agent of agents) boxOf(`agent:${agent.id}`, OVERVIEW_AGENT_BOX, overviewScale(input.agentCounts?.get(agent.id) ?? 0, maxAgent))
    for (const channel of channels) boxOf(`channel:${channel.slug}`, OVERVIEW_CHANNEL_BOX, overviewScale(input.channelCounts?.get(channel.slug) ?? 0, maxChannel))

    const place = mode === "agents-center" ? placeAgentsCenter : placeByAgent
    let spread = 1
    let bodies: Body[] = []
    for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt += 1) {
        bodies = place({ agents, channels, usersOf, boxes, spread })
        relax(bodies)
        if (!hasOverlap(bodies)) break
        spread *= GROWTH
    }
    const agentPoints = new Map<string, Point>()
    const channelPoints = new Map<string, Point>()
    for (const body of bodies) {
        const point = { x: round(body.x), y: round(body.y) }
        if (body.key.startsWith("agent:")) agentPoints.set(body.key.slice("agent:".length), point)
        else channelPoints.set(body.key.slice("channel:".length), point)
    }
    return { agents: agentPoints, channels: channelPoints, scales, boxes, mode }
}

interface PlaceInput {
    agents: readonly { id: string; app: string }[]
    channels: readonly { slug: string }[]
    usersOf: ReadonlyMap<string, readonly string[]>
    boxes: ReadonlyMap<string, { width: number; height: number }>
    /** Fator do raio dos círculos (cresce a cada tentativa com sobreposição). */
    spread: number
}

const body = (key: string, point: Point, box: { width: number; height: number }, fixed: boolean, anchor: Point | null = null): Body => ({ key, x: point.x, y: point.y, width: box.width, height: box.height, fixed, anchor })

/** "Agentes no centro": agentes num círculo e canais em anéis em volta, no ângulo médio dos seus agentes. */
function placeAgentsCenter({ agents, channels, usersOf, boxes, spread }: PlaceInput): Body[] {
    const agentBoxes = agents.map((agent) => boxes.get(`agent:${agent.id}`)!)
    const { radius, angles } = circle(agentBoxes.map(reach))
    const agentRadius = radius * spread
    const angleOf = new Map(agents.map((agent, index) => [agent.id, angles[index]!]))
    const bodies: Body[] = agents.map((agent, index) => body(`agent:${agent.id}`, { x: agentRadius * Math.cos(angles[index]!), y: agentRadius * Math.sin(angles[index]!) }, agentBoxes[index]!, true))
    const preferredOf = (slug: string) => (agents.length > 1 ? meanAngle((usersOf.get(slug) ?? []).map((agent) => angleOf.get(agent)!)) : null)
    // Ordem no anel: pelo ângulo preferido; os sem agente (ou sem direção) no fim, pelo slug.
    const ordered = [...channels].sort((a, b) => {
        const pa = preferredOf(a.slug)
        const pb = preferredOf(b.slug)
        if (pa === null || pb === null) return pa === null && pb === null ? a.slug.localeCompare(b.slug) : pa === null ? 1 : -1
        const norm = (angle: number) => (angle + Math.PI / 2 + 4 * Math.PI) % (2 * Math.PI)
        return norm(pa) - norm(pb) || a.slug.localeCompare(b.slug)
    })
    const inner = (agentRadius + Math.max(0, ...agentBoxes.map(reach))) * RADIAL_INNER
    const channelBoxes = ordered.map((channel) => boxes.get(`channel:${channel.slug}`)!)
    const points = rings(channelBoxes, inner * (agents.length ? 1 : 0), ordered.map((channel) => preferredOf(channel.slug)))
    ordered.forEach((channel, index) => bodies.push(body(`channel:${channel.slug}`, points[index]!, channelBoxes[index]!, false, points[index]!)))
    return bodies
}

/** Menor distância entre os centros de duas caixas, na direção `angle`, para não se tocarem (com a folga). */
export function clearDistance(a: { width: number; height: number }, b: { width: number; height: number }, angle: number): number {
    const cos = Math.abs(Math.cos(angle))
    const sin = Math.abs(Math.sin(angle))
    const byX = cos > 1e-9 ? ((a.width + b.width) / 2 + OVERVIEW_PADDING) / cos : Infinity
    const byY = sin > 1e-9 ? ((a.height + b.height) / 2 + OVERVIEW_PADDING) / sin : Infinity
    return Math.min(byX, byY)
}

/**
 * "Órbita" (`by-agent`): cada agente com os canais só dele numa órbita **justa pela caixa** (a menor
 * distância que separa os cards naquela direção: perto em cima e embaixo, mais longe dos lados), virada
 * para fora; os agentes num círculo do tamanho real dos grupos; o canal compartilhado no centroide dos
 * seus agentes (o meio fica livre para eles); os sem agente num anel de fora. Canais são móveis com
 * âncora: o afastamento resolve quem encostar, sem aumentar o círculo.
 */
function placeByAgent({ agents, channels, usersOf, boxes, spread }: PlaceInput): Body[] {
    const exclusive = new Map<string, string[]>(agents.map((agent) => [agent.id, []]))
    const shared: string[] = []
    const loose: string[] = []
    for (const channel of channels) {
        const users = usersOf.get(channel.slug) ?? []
        if (users.length === 1) exclusive.get(users[0]!)!.push(channel.slug)
        else if (users.length > 1) shared.push(channel.slug)
        else loose.push(channel.slug)
    }
    const agentBox = (id: string) => boxes.get(`agent:${id}`)!
    const channelBox = (slug: string) => boxes.get(`channel:${slug}`)!
    const single = agents.length === 1
    // Grupo de cada agente em coordenadas locais, com os canais começando virados para fora (ângulo 0).
    const groups = agents.map((agent) => {
        const mine = exclusive.get(agent.id)!
        const own = agentBox(agent.id)
        // Leque para fora (meia volta) quando há outros agentes; volta inteira com um agente só.
        const span = single ? 2 * Math.PI : Math.min(Math.PI, (mine.length * Math.PI) / 3)
        const offsets = mine.map((slug, index) => {
            const angle = mine.length === 1 ? 0 : single ? (index * span) / mine.length : -span / 2 + (index * span) / (mine.length - 1)
            const box = channelBox(slug)
            const distance = clearDistance(own, box, angle) + (index % 2 ? box.height + OVERVIEW_PADDING : 0) * (mine.length > 3 ? 1 : 0)
            return { slug, angle, distance, box }
        })
        // Pegada pela caixa real (canto mais distante do card), sem a meia diagonal de folga extra.
        const footprint = Math.max(reach(own), ...offsets.map((item) => Math.hypot(item.distance + item.box.height / 2, item.box.width / 2)))
        return { offsets, footprint }
    })
    // Miolo livre para os compartilhados (nascem no centroide, entre os agentes): um disco com a área
    // deles; o círculo de agentes nunca fica menor que ele (senão os agentes os prendem no meio).
    const sharedArea = shared.reduce((sum, slug) => sum + (channelBox(slug).width + OVERVIEW_PADDING) * (channelBox(slug).height + OVERVIEW_PADDING), 0)
    const core = shared.length ? 1.2 * Math.sqrt(sharedArea / Math.PI) + Math.max(...agents.map((agent) => reach(agentBox(agent.id)))) : 0
    const { radius, angles } = circle(groups.map((group) => group.footprint), agents.length > 1 ? core : 0)
    const agentRadius = radius * spread
    const bodies: Body[] = []
    const agentPoint = new Map<string, Point>()
    agents.forEach((agent, index) => {
        const outward = single ? -Math.PI / 2 : angles[index]!
        const point = { x: agentRadius * Math.cos(angles[index]!), y: agentRadius * Math.sin(angles[index]!) }
        agentPoint.set(agent.id, point)
        bodies.push(body(`agent:${agent.id}`, point, agentBox(agent.id), true))
        for (const item of groups[index]!.offsets) {
            const angle = outward + item.angle
            const at = { x: point.x + item.distance * Math.cos(angle), y: point.y + item.distance * Math.sin(angle) }
            bodies.push(body(`channel:${item.slug}`, at, item.box, false, at))
        }
    })
    for (const slug of shared) {
        const users = usersOf.get(slug)!
        const centroid = { x: users.reduce((sum, agent) => sum + agentPoint.get(agent)!.x, 0) / users.length, y: users.reduce((sum, agent) => sum + agentPoint.get(agent)!.y, 0) / users.length }
        bodies.push(body(`channel:${slug}`, centroid, channelBox(slug), false, centroid))
    }
    if (loose.length) {
        const extent = Math.max(0, ...bodies.map((item) => Math.hypot(item.x, item.y) + reach(item)))
        const points = rings(loose.map(channelBox), extent, loose.map(() => null))
        loose.forEach((slug, index) => bodies.push(body(`channel:${slug}`, points[index]!, channelBox(slug), false, points[index]!)))
    }
    return bodies
}

/** Ponto de controle da curva do link (para o lado, proporcional ao comprimento). */
function control(source: Point, target: Point, bend: number): Point {
    const dx = target.x - source.x
    const dy = target.y - source.y
    return { x: (source.x + target.x) / 2 - dy * bend, y: (source.y + target.y) / 2 + dx * bend }
}

/** Link agente → canal: curva quadrática suave de centro a centro. */
export function overviewLinkPath(source: Point, target: Point, bend = OVERVIEW_LINK_BEND): string {
    const c = control(source, target, bend)
    return `M${round(source.x)},${round(source.y)} Q${round(c.x)},${round(c.y)} ${round(target.x)},${round(target.y)}`
}

/** Meio da curva do link (rótulo do modo). */
export function overviewLinkMidpoint(source: Point, target: Point, bend = OVERVIEW_LINK_BEND): Point {
    const c = control(source, target, bend)
    return { x: (source.x + 2 * c.x + target.x) / 4, y: (source.y + 2 * c.y + target.y) / 4 }
}

/** Enquadramento inicial: a caixa de todos os cards escalados, com `OVERVIEW_FIT_MARGIN` de folga. */
export function overviewInitialBounds(layout: Pick<OverviewLayout, "agents" | "channels" | "boxes">): Rect | null {
    const items = [...[...layout.agents].map(([id, point]) => ({ point, box: layout.boxes.get(`agent:${id}`) })), ...[...layout.channels].map(([slug, point]) => ({ point, box: layout.boxes.get(`channel:${slug}`) }))]
    if (!items.length) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const { point, box } of items) {
        const width = box?.width ?? 0
        const height = box?.height ?? 0
        minX = Math.min(minX, point.x - width / 2)
        maxX = Math.max(maxX, point.x + width / 2)
        minY = Math.min(minY, point.y - height / 2)
        maxY = Math.max(maxY, point.y + height / 2)
    }
    const width = maxX - minX
    const height = maxY - minY
    const mx = width * OVERVIEW_FIT_MARGIN
    const my = height * OVERVIEW_FIT_MARGIN
    return { x: minX - mx, y: minY - my, width: width + 2 * mx, height: height + 2 * my }
}

/** Centroide dos agentes (celular: centraliza nele com o zoom mínimo legível). */
export function overviewAgentsCenter(layout: Pick<OverviewLayout, "agents">): Point | null {
    const points = [...layout.agents.values()]
    if (!points.length) return null
    return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }
}
