import { isBeatStale } from "../heartbeat-rules"

/**
 * Provisionamentos vivos neste processo (OPE-130), num módulo leve para o tick e o serviço consultarem
 * sem carregar o subagente. O estado "running"/"pending" no banco sem entrada aqui é obsoleto
 * (o servidor reiniciou no meio do provisionamento) quando também não há batimento recente de outra
 * instância (`isProvisioningLive`).
 */

const globalRegistry = globalThis as unknown as { __routineProvisioning?: Map<string, Promise<void>> }
export const inFlight: Map<string, Promise<void>> = (globalRegistry.__routineProvisioning ??= new Map())

/** Mensagem do provisionamento que ficou "em andamento" sem processo vivo (reinício do servidor). */
export const PROVISIONING_INTERRUPTED_MESSAGE = 'O provisionamento foi interrompido (o servidor reiniciou no meio dele). Use "Tentar de novo".'

/** Há um provisionamento vivo deste agente neste processo? */
export function isProvisioningInFlight(agentId: string): boolean {
    return inFlight.has(agentId)
}

/**
 * Há um provisionamento vivo deste agente em QUALQUER instância (OPE-147)? Neste processo pela
 * memória; noutra (prévia ou Opex original, mesmo banco) pelo batimento gravado no agente, contando
 * do mais recente entre o batimento e o início do provisionamento.
 */
export function isProvisioningLive(agent: { _id: unknown; provisioning?: { status?: string; at?: Date | string | null } | null; provisioningBeatAt?: Date | string | null; updatedAt?: Date | string | null }, now = new Date()): boolean {
    if (inFlight.has(String(agent._id))) return true
    const status = agent.provisioning?.status
    if (status !== "running" && status !== "pending") return false
    // Vale o mais recente entre o batimento e o início: um batimento antigo (de um provisionamento já
    // terminado) não derruba um "Reprovisionar" recém-iniciado antes do primeiro batimento dele.
    const times = [agent.provisioningBeatAt, agent.provisioning?.at].filter((value): value is Date | string => Boolean(value)).map((value) => new Date(value).getTime())
    const latest = times.length ? new Date(Math.max(...times)) : agent.updatedAt
    return !isBeatStale(latest, now)
}

/**
 * Ações do dono sobre os canais extras (OPE-143), uma de cada vez por agente. Cada ação lê o estado, aciona o
 * Engramind (rede) e só então grava as listas inteiras: sem a fila, duas ações quase simultâneas leem o mesmo
 * estado e a segunda grava por cima da primeira. O provisionamento também espera a fila esvaziar antes de ler o
 * agente (`whenChannelActionsDone`), para o `save()` dele não apagar o bloqueio recém-gravado.
 */
const globalLocks = globalThis as unknown as { __routineChannelLocks?: Map<string, Promise<void>> }
const channelLocks: Map<string, Promise<void>> = (globalLocks.__routineChannelLocks ??= new Map())

export function withChannelLock<T>(agentId: string, task: () => Promise<T>): Promise<T> {
    const previous = channelLocks.get(agentId) ?? Promise.resolve()
    const run = previous.then(task)
    const tail = run.then(
        () => undefined,
        () => undefined,
    )
    channelLocks.set(agentId, tail)
    void tail.then(() => {
        if (channelLocks.get(agentId) === tail) channelLocks.delete(agentId)
    })
    return run
}

/** Resolve quando as ações de canal já enfileiradas deste agente terminarem. */
export function whenChannelActionsDone(agentId: string): Promise<void> {
    return channelLocks.get(agentId) ?? Promise.resolve()
}
