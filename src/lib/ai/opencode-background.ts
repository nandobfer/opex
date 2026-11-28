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

type RequestOptions = { signal?: AbortSignal }
type JobApi = {
    list: (input: { sessionID: string; status: "running"; descendants?: boolean }, options?: RequestOptions) => Promise<readonly RawJob[]>
    cancel: (input: { id: string }, options?: RequestOptions) => Promise<unknown>
}

/** Prazo de cada leitura/cancelamento: um host que não responde não prende a espera nem o Parar. */
export const BACKGROUND_REQUEST_TIMEOUT_MS = 10_000
/** Profundidade máxima da árvore de subsessões lida sem a API de jobs (subagente que dispara subagentes). */
const MAX_TREE_DEPTH = 4

/**
 * Chamada ao OpenCode com prazo: o sinal vai nas opções da requisição e, se o cliente o ignorar, a corrida
 * contra o relógio rejeita do mesmo jeito.
 */
function timed<T>(call: (options: RequestOptions) => Promise<T>, ms = BACKGROUND_REQUEST_TIMEOUT_MS): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("O OpenCode não respondeu a tempo")), ms)
        timer.unref?.()
    })
    return Promise.race([call({ signal: AbortSignal.timeout(ms) }), deadline]).finally(() => clearTimeout(timer))
}

/** API de jobs do OpenCode 2.4 (`experimental.job`); ausente num host/cliente antigo. */
function jobApi(client: OpencodeClient): JobApi | null {
    const experimental = (client as unknown as { experimental?: { job?: Partial<JobApi> } }).experimental
    const job = experimental?.job
    return job && typeof job.list === "function" && typeof job.cancel === "function" ? (job as JobApi) : null
}

async function runningJobs(client: OpencodeClient, sessionId: string): Promise<RawJob[] | null> {
    const api = jobApi(client)
    if (!api) return null
    // `descendants`: o subagente que dispara os próprios subagentes fica ocioso, mas o neto ainda vai acordá-lo.
    const jobs = await timed((options) => api.list({ sessionID: sessionId, status: "running", descendants: true }, options))
    const byId = new Map<unknown, RawJob>()
    for (const job of Array.isArray(jobs) ? jobs : []) {
        if (job.status !== undefined && job.status !== "running") continue
        byId.set(job.id ?? Symbol(), job)
    }
    return [...byId.values()]
}

/** A sessão está em execução agora (`session.active`)? Falha ou sem resposta = não. */
export async function sessionIsActive(client: OpencodeClient, sessionId: string): Promise<boolean> {
    try {
        if (typeof client.session.active !== "function") return false
        const active = await timed((options) => client.session.active(options))
        return Boolean(active && (active as Record<string, unknown>)[sessionId])
    } catch {
        return false
    }
}

/**
 * Subsessões (subagentes) da sessão, em toda a árvore (filhos, netos…), que estão em execução agora — o caminho
 * dos hosts sem a API de jobs. Desce também pelos filhos ociosos: um neto ainda rodando vai acordar o filho.
 */
async function activeChildren(client: OpencodeClient, sessionId: string): Promise<string[]> {
    const active = (await timed((options) => client.session.active(options))) as Record<string, unknown> | null
    const running = active ?? {}
    const found: string[] = []
    const visited = new Set<string>([sessionId])
    let level = [sessionId]
    for (let depth = 0; depth < MAX_TREE_DEPTH && level.length; depth++) {
        const lists = await Promise.all(level.map((parentID) => timed((options) => client.session.list({ parentID, limit: 100 }, options))))
        const next: string[] = []
        for (const children of lists) {
            for (const child of children?.data ?? []) {
                if (visited.has(child.id)) continue
                visited.add(child.id)
                if (running[child.id]) found.push(child.id)
                next.push(child.id)
            }
        }
        level = next
    }
    return found
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
        const inbox = await timed((options) => client.session.inbox.list({ sessionID: sessionId }, options))
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
            const jobs = await runningJobs(client, sessionId)
            const ids = (jobs ?? []).map((job) => job.id).filter((id): id is string => typeof id === "string")
            await Promise.all(ids.map((id) => timed((options) => api.cancel({ id }, options)).catch(() => undefined)))
            return ids.length
        }
        const children = await activeChildren(client, sessionId)
        await Promise.all(children.map((id) => timed((options) => client.session.interrupt({ sessionID: id }, options)).catch(() => undefined)))
        return children.length
    } catch {
        return 0
    }
}
