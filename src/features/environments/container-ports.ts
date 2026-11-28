import type { Machine } from "./schemas"

/**
 * Portas de cada container (OPE-211): o que ele escuta e onde está publicado. Junta o `{{.Ports}}` do
 * `docker ps` (só com o container no ar) com o `ExposedPorts` e o `PortBindings` do `docker inspect`
 * (valem também parado). Puro.
 */

export type PortProtocol = "tcp" | "udp" | "sctp"

export interface ContainerPort {
    container: number
    protocol: PortProtocol
    /** Porta publicada na máquina (`null` = só dentro da rede do compose). */
    published: number | null
    /** IP da publicação (`null` = todos os endereços). */
    hostIp: string | null
}

/**
 * Como a tela mostra a porta publicada: `link` (abre http://<host>:<porta>), `pc` (publicada só no PC, sem
 * repasse ao servidor), `local` (só na própria máquina), `udp` (não abre no navegador) ou `internal` (sem
 * publicação).
 */
export type PortReach = "link" | "pc" | "local" | "udp" | "internal"

export interface ContainerPortDto extends ContainerPort {
    reach: PortReach
}

const RANGE_MAX = 64
const ANY_IP = new Set(["", "0.0.0.0", "::", "[::]"])
const LOCAL_IP = new Set(["127.0.0.1", "::1", "[::1]", "localhost"])

const protocolOf = (value: string | undefined): PortProtocol => (value === "udp" || value === "sctp" ? value : "tcp")
const portNumber = (value: string | undefined): number | null => {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null
}
const hostIpOf = (value: string | undefined | null): string | null => {
    const ip = (value ?? "").trim()
    return ANY_IP.has(ip) ? null : ip
}

/** "8000-8001" → [8000, 8001] (até `RANGE_MAX` portas). */
function expand(spec: string): number[] {
    const [from, to] = spec.split("-")
    const start = portNumber(from)
    if (start === null) return []
    const end = to === undefined ? start : portNumber(to)
    if (end === null || end < start) return [start]
    return Array.from({ length: Math.min(end - start + 1, RANGE_MAX) }, (_, index) => start + index)
}

/** `{{.Ports}}`: "0.0.0.0:4100->3000/tcp, :::4100->3000/tcp, 5432/tcp". */
function fromPs(text: string): ContainerPort[] {
    const ports: ContainerPort[] = []
    for (const raw of text.split(",")) {
        const item = raw.trim()
        if (!item) continue
        const [left, right] = item.includes("->") ? item.split("->") : [null, item]
        const [targetSpec = "", protocolText] = (right ?? "").split("/")
        const protocol = protocolOf(protocolText)
        const targets = expand(targetSpec)
        if (!left) {
            for (const container of targets) ports.push({ container, protocol, published: null, hostIp: null })
            continue
        }
        const colon = left.lastIndexOf(":")
        const ip = colon >= 0 ? left.slice(0, colon) : ""
        const published = expand(colon >= 0 ? left.slice(colon + 1) : left)
        targets.forEach((container, index) => ports.push({ container, protocol, published: published[index] ?? published[0] ?? null, hostIp: hostIpOf(ip) }))
    }
    return ports
}

const parseJson = (text: string | undefined): unknown => {
    if (!text || !text.trim() || text.trim() === "null") return null
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

const keyParts = (key: string) => {
    const [port, protocol] = key.split("/")
    return { container: portNumber(port), protocol: protocolOf(protocol) }
}

/** `{{json .Config.ExposedPorts}}` (`{"3000/tcp":{}}`) e `{{json .HostConfig.PortBindings}}`. */
function fromInspect(exposedText: string | undefined, bindingsText: string | undefined): ContainerPort[] {
    const ports: ContainerPort[] = []
    const exposed = parseJson(exposedText)
    if (exposed && typeof exposed === "object") {
        for (const key of Object.keys(exposed)) {
            const { container, protocol } = keyParts(key)
            if (container !== null) ports.push({ container, protocol, published: null, hostIp: null })
        }
    }
    const bindings = parseJson(bindingsText)
    if (bindings && typeof bindings === "object") {
        for (const [key, list] of Object.entries(bindings as Record<string, unknown>)) {
            const { container, protocol } = keyParts(key)
            if (container === null) continue
            if (!Array.isArray(list) || !list.length) {
                ports.push({ container, protocol, published: null, hostIp: null })
                continue
            }
            for (const binding of list as { HostIp?: string; HostPort?: string }[]) {
                ports.push({ container, protocol, published: portNumber(binding?.HostPort), hostIp: hostIpOf(binding?.HostIp) })
            }
        }
    }
    return ports
}

/**
 * Portas do container sem repetição: a mesma porta em `0.0.0.0` e `::` vira uma só, e a exposta sem
 * publicação some quando a mesma porta aparece publicada. Ordenadas pela porta do container.
 */
export function parseContainerPorts(psPorts: string, exposed?: string, bindings?: string): ContainerPort[] {
    const all = [...fromPs(psPorts), ...fromInspect(exposed, bindings)]
    const unique = new Map<string, ContainerPort>()
    for (const port of all) {
        const key = `${port.container}/${port.protocol}/${port.published ?? ""}/${port.hostIp ?? ""}`
        if (!unique.has(key)) unique.set(key, port)
    }
    const list = [...unique.values()]
    const publishedKeys = new Set(list.filter((port) => port.published !== null).map((port) => `${port.container}/${port.protocol}`))
    return list
        .filter((port) => port.published !== null || !publishedKeys.has(`${port.container}/${port.protocol}`))
        .sort((a, b) => a.container - b.container || a.protocol.localeCompare(b.protocol) || (a.published ?? 0) - (b.published ?? 0))
}

/** Como a porta abre a partir do navegador (ver `PortReach`). */
export function portReach(port: ContainerPort, input: { runOn: Machine; forwarded: readonly number[] }): PortReach {
    if (port.published === null) return "internal"
    if (port.protocol !== "tcp") return "udp"
    if (port.hostIp && LOCAL_IP.has(port.hostIp)) return "local"
    if (input.runOn === "pc" && !input.forwarded.includes(port.published)) return "pc"
    return "link"
}

export function withReach(ports: ContainerPort[], input: { runOn: Machine; forwarded: readonly number[] }): ContainerPortDto[] {
    return ports.map((port) => ({ ...port, reach: portReach(port, input) }))
}

/** Host dos links: o configurado ou, vazio, o endereço com que a tela foi aberta. */
export function portLinkHost(configured: string | null | undefined, pageHost: string): string {
    return configured?.trim() || pageHost
}

/** URL da porta publicada (`null` quando ela não abre no navegador). */
export function portLink(port: ContainerPortDto, host: string): string | null {
    if (port.reach !== "link" || port.published === null || !host) return null
    const name = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
    return `http://${name}:${port.published}`
}

/** Texto da porta: "3000/tcp → :4100" ou "3000/tcp". */
export function portText(port: ContainerPort): string {
    return `${port.container}/${port.protocol}${port.published !== null ? ` → :${port.published}` : ""}`
}

/** Dica de cada alcance (o `title` do chip). */
export const PORT_REACH_HINTS: Record<PortReach, string> = {
    link: "Abre no navegador",
    pc: "Publicada só no PC (sem repasse ao servidor)",
    local: "Só na própria máquina (127.0.0.1)",
    udp: "Porta UDP: não abre no navegador",
    internal: "Só dentro da rede do compose",
}
