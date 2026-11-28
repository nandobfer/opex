import type { OpencodeClient } from "@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client"

/**
 * Trabalho em segundo plano de uma sessão do OpenCode (OPE-216). Desde a v2.3 todo subagente roda em
 * segundo plano e acorda a sessão principal num turno novo quando termina; desde a v2.3.1 um comando de
 * terminal que estoura o tempo também. O turno do Opex só termina quando a sessão está quieta: sem jobs
 * rodando e sem mensagens pendentes de entrega (inbox).
 */

export interface BackgroundWork {
    subagents: number
    shells: number
    /** Outros jobs (imagem, vídeo, code mode). */
    other: number
    /** Mensagens na caixa de entrada, ainda não entregues à sessão. */
    inbox: number
    /** `false` = nenhuma leitura respondeu (o chamador trata como sessão quieta). */
    ok: boolean
}

export const NO_BACKGROUND_WORK: BackgroundWork = { subagents: 0, shells: 0, other: 0, inbox: 0, ok: true }

export const hasBackgroundWork = (work: BackgroundWork) => work.subagents + work.shells + work.other + work.inbox > 0

/** Contagem exibida (a caixa de entrada não aparece: é o resultado já a caminho). */
export const sameBackgroundCounts = (a: Pick<BackgroundWork, "subagents" | "shells" | "other">, b: Pick<BackgroundWork, "subagents" | "shells" | "other">) =>
    a.subagents === b.subagents && a.shells === b.shells && a.other === b.other

interface RawJob {
    id?: unknown
    kind?: unknown
    status?: unknown
}

type JobApi = { list: (input: { sessionID: string; status: "running" }) => Promise<readonly RawJob[]>; cancel: (input: { id: string }) => Promise<unknown> }

/** API de jobs do OpenCode 2.4 (`experimental.job`); ausente num host/cliente antigo. */
function jobApi(client: OpencodeClient): JobApi | null {
    const experimental = (client as unknown as { experimental?: { job?: Partial<JobApi> } }).experimental
    const job = experimental?.job
    return job && typeof job.list === "function" && typeof job.cancel === "function" ? (job as JobApi) : null
}

async function runningJobs(client: OpencodeClient, sessionId: string): Promise<RawJob[] | null> {
    const api = jobApi(client)
    if (!api) return null
    const jobs = await api.list({ sessionID: sessionId, status: "running" })
    return Array.isArray(jobs) ? jobs.filter((job) => job.status === undefined || job.status === "running") : []
}

/** Subsessões (subagentes) da sessão que estão em execução agora — o caminho dos hosts sem a API de jobs. */
async function activeChildren(client: OpencodeClient, sessionId: string): Promise<string[]> {
    const [children, active] = await Promise.all([client.session.list({ parentID: sessionId, limit: 100 }), client.session.active()])
    const running = (active ?? {}) as Record<string, unknown>
    return (children?.data ?? []).map((child) => child.id).filter((id) => Boolean(running[id]))
}

/** Lê o que ainda está em andamento na sessão. Nunca lança. */
export async function sessionBackgroundWork(client: OpencodeClient, sessionId: string): Promise<BackgroundWork> {
    const work: BackgroundWork = { subagents: 0, shells: 0, other: 0, inbox: 0, ok: false }
    let jobsRead = false
    try {
        const jobs = await runningJobs(client, sessionId)
        if (jobs) {
            jobsRead = true
            work.ok = true
            for (const job of jobs) {
                if (job.kind === "subagent") work.subagents++
                else if (job.kind === "shell") work.shells++
                else work.other++
            }
        }
    } catch {
        // API de jobs indisponível: tenta pelos subagentes.
    }
    if (!jobsRead) {
        try {
            work.subagents = (await activeChildren(client, sessionId)).length
            work.ok = true
        } catch {
            // sem leitura dos subagentes
        }
    }
    try {
        const inbox = await client.session.inbox.list({ sessionID: sessionId })
        work.inbox = Array.isArray(inbox) ? inbox.length : 0
        work.ok = true
    } catch {
        // sem leitura da caixa de entrada
    }
    return work
}

/** Parar: cancela os jobs da sessão (ou interrompe os subagentes, sem a API de jobs). Nunca lança. */
export async function cancelBackgroundWork(client: OpencodeClient, sessionId: string): Promise<number> {
    try {
        const api = jobApi(client)
        if (api) {
            const jobs = await api.list({ sessionID: sessionId, status: "running" })
            const ids = (Array.isArray(jobs) ? jobs : []).map((job) => job.id).filter((id): id is string => typeof id === "string")
            await Promise.all(ids.map((id) => api.cancel({ id }).catch(() => undefined)))
            return ids.length
        }
        const children = await activeChildren(client, sessionId)
        await Promise.all(children.map((id) => client.session.interrupt({ sessionID: id }).catch(() => undefined)))
        return children.length
    } catch {
        return 0
    }
}
