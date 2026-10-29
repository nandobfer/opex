import type { DeployEvent } from "../types"

/** Log ao vivo dos deploys em andamento neste processo (o banco guarda o log inteiro no fim). */
interface DeployChannel {
    log: string
    done: boolean
    listeners: Set<(event: DeployEvent) => void>
}

const KEY = Symbol.for("opex.environments.deploy-hub")
const store = globalThis as unknown as Record<symbol, Map<string, DeployChannel> | undefined>
const channels = () => (store[KEY] ??= new Map())

/** Abre o canal (`log` = o que já saiu, na retomada depois de o app reiniciar). */
export function openDeployChannel(id: string, log = ""): void {
    channels().set(id, { log, done: false, listeners: new Set() })
}

/** Deploy conduzido por este processo (canal aberto e ainda não encerrado). */
export function hasLiveDeploy(id: string): boolean {
    const channel = channels().get(id)
    return Boolean(channel && !channel.done)
}

export function emitDeploy(id: string, event: DeployEvent): void {
    const channel = channels().get(id)
    if (!channel) return
    if (event.type === "log") channel.log += event.text
    if (event.type === "status" && event.status !== "running") channel.done = true
    for (const listener of channel.listeners) listener(event)
    if (channel.done) setTimeout(() => channels().delete(id), 60_000).unref?.()
}

/** Assina o log: devolve o que já saiu e a função para cancelar; `null` = deploy fora da memória. */
export function subscribeDeploy(id: string, listener: (event: DeployEvent) => void): { log: string; done: boolean; unsubscribe: () => void } | null {
    const channel = channels().get(id)
    if (!channel) return null
    channel.listeners.add(listener)
    return { log: channel.log, done: channel.done, unsubscribe: () => channel.listeners.delete(listener) }
}

export function deployLogSoFar(id: string): string | null {
    return channels().get(id)?.log ?? null
}
