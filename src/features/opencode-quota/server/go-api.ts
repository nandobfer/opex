import { OPENCODE_CONSOLE_API_URL, OPENCODE_GO_USER_AGENT } from "@/lib/ai/endpoints"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { GO_REQUEST_TIMEOUT_MS } from "../go-constants"
import { GO_CONSOLE_FORMAT_MESSAGE, goConsoleStatusMessage, type GoModelCost } from "../go-logic"
import { goCostByDaySchema, goModelsPageSchema, goStatusSchema, type GoStatus } from "../go-schemas"

/**
 * Cliente da API do Console do OpenCode Go (SOMENTE servidor, OPE-167), com a chave `oc_sk_` do chaveiro.
 * Toda chamada leva o `User-Agent` do Opex (sem ele o Cloudflare responde 403 "Error 1010") e prazo próprio.
 * O debug registra só método, URL, cabeçalhos mascarados e status: o corpo (com dados de pagamento no
 * `go/status`) não é logado, e o Zod descarta o que não é usado.
 */

const LABEL = "OpenCode Go (Console)"
const MAX_MODEL_PAGES = 10

export class GoConsoleError extends Error {
    constructor(
        message: string,
        readonly status: number | null,
    ) {
        super(message)
        this.name = "GoConsoleError"
    }
}

async function consoleGet(apiKey: string, path: string, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(GO_REQUEST_TIMEOUT_MS)
    let res: Response
    try {
        res = await debugFetch(integrationDebug("ai_opencode_go"), LABEL, `${OPENCODE_CONSOLE_API_URL}${path}`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "User-Agent": OPENCODE_GO_USER_AGENT },
            cache: "no-store",
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        })
    } catch (error) {
        if (signal?.aborted) throw error
        throw new GoConsoleError(`Não foi possível conectar ao Console do OpenCode Go: ${error instanceof Error ? error.message : String(error)}`, null)
    }
    if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new GoConsoleError(goConsoleStatusMessage(res.status, body), res.status)
    }
    try {
        return await res.json()
    } catch {
        throw new GoConsoleError(GO_CONSOLE_FORMAT_MESSAGE, res.status)
    }
}

/** `GET /go/status`: ciclo e medidores (5h, semana, mês), sem os campos de pagamento. */
export async function fetchGoStatus(apiKey: string, signal?: AbortSignal): Promise<GoStatus> {
    const parsed = goStatusSchema.safeParse(await consoleGet(apiKey, "/go/status", signal))
    if (!parsed.success) throw new GoConsoleError(GO_CONSOLE_FORMAT_MESSAGE, 200)
    return parsed.data
}

/** `GET /usage/models` de um dia UTC: custo real por modelo (a API pagina de 10 em 10 e ignora `pageSize`). */
export async function fetchGoModelsCost(apiKey: string, date: string, signal?: AbortSignal): Promise<GoModelCost[]> {
    const items: GoModelCost[] = []
    for (let page = 1; page <= MAX_MODEL_PAGES; page++) {
        const parsed = goModelsPageSchema.safeParse(await consoleGet(apiKey, `/usage/models?from=${date}&to=${date}&page=${page}`, signal))
        if (!parsed.success) throw new GoConsoleError(GO_CONSOLE_FORMAT_MESSAGE, 200)
        items.push(...parsed.data.items.map((item) => ({ model: item.model, costMicroCents: item.totalCostMicroCents })))
        if (!parsed.data.pageInfo || page >= parsed.data.pageInfo.pageCount) break
    }
    return items
}

/** `GET /usage/cost-by-day`: custo real por dia UTC (micro-cents). */
export async function fetchGoCostByDay(apiKey: string, from: string, to: string, signal?: AbortSignal): Promise<Map<string, number>> {
    const parsed = goCostByDaySchema.safeParse(await consoleGet(apiKey, `/usage/cost-by-day?from=${from}&to=${to}`, signal))
    if (!parsed.success) throw new GoConsoleError(GO_CONSOLE_FORMAT_MESSAGE, 200)
    return new Map(parsed.data.map((day) => [day.date, day.totalCostMicroCents]))
}
