import type { z } from "zod"
import { COMMAND_CODE_ALPHA_URL, COMMAND_CODE_USER_AGENT } from "@/lib/ai/endpoints"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { CC_REQUEST_TIMEOUT_MS } from "../constants"
import { ccAlphaStatusMessage, ccFormatMessage } from "../logic"
import { ccCreditsSchema, ccSubscriptionSchema, ccSummarySchema, ccWhoamiSchema, failedFields, type CcCredits, type CcSubscription, type CcSummary, type CcWhoami } from "../schemas"

/**
 * Cliente da API da CLI do Command Code (`/alpha/*`, SOMENTE servidor, OPE-190): os mesmos endpoints que o `/usage`
 * da CLI oficial lê, com a chave do chaveiro `ai_command_code`. Não documentados: 404 ou formato novo viram
 * `unavailable` (a assinatura não é legível), nunca números inventados. O debug registra só método, URL,
 * cabeçalhos mascarados e status; o Zod descarta nome, e-mail e os campos de cobrança.
 */

const LABEL = "Command Code (uso)"

export class CommandCodeAlphaError extends Error {
    constructor(
        message: string,
        readonly status: number | null,
        /** O endpoint sumiu ou mudou de formato: a assinatura não é legível pela API da CLI. */
        readonly unavailable: boolean,
    ) {
        super(message)
        this.name = "CommandCodeAlphaError"
    }
}

async function alphaGet<T>(apiKey: string, path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(CC_REQUEST_TIMEOUT_MS)
    let res: Response
    try {
        res = await debugFetch(integrationDebug("ai_command_code"), LABEL, `${COMMAND_CODE_ALPHA_URL}${path}`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "User-Agent": COMMAND_CODE_USER_AGENT },
            cache: "no-store",
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        })
    } catch (error) {
        if (signal?.aborted) throw error
        throw new CommandCodeAlphaError(`Não foi possível conectar à API de uso do Command Code: ${error instanceof Error ? error.message : String(error)}`, null, false)
    }
    const endpoint = path.split("?")[0]!
    if (!res.ok) {
        await res.body?.cancel().catch(() => undefined)
        const { message, unavailable } = ccAlphaStatusMessage(res.status)
        throw new CommandCodeAlphaError(message, res.status, unavailable)
    }
    let body: unknown
    try {
        body = await res.json()
    } catch {
        throw new CommandCodeAlphaError(ccFormatMessage(endpoint, []), res.status, true)
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new CommandCodeAlphaError(ccFormatMessage(endpoint, failedFields(parsed.error)), res.status, true)
    return parsed.data
}

const withOrg = (path: string, orgId: string | null, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ ...(orgId ? { orgId } : {}), ...extra })
    const query = params.toString()
    return query ? `${path}?${query}` : path
}

export function fetchCcWhoami(apiKey: string, signal?: AbortSignal): Promise<CcWhoami> {
    return alphaGet(apiKey, "/whoami", ccWhoamiSchema, signal)
}

export function fetchCcCredits(apiKey: string, orgId: string | null, signal?: AbortSignal): Promise<CcCredits> {
    return alphaGet(apiKey, withOrg("/billing/credits", orgId), ccCreditsSchema, signal)
}

export function fetchCcSubscription(apiKey: string, orgId: string | null, signal?: AbortSignal): Promise<CcSubscription> {
    return alphaGet(apiKey, withOrg("/billing/subscriptions", orgId), ccSubscriptionSchema, signal)
}

/** Totais desde `sinceMs` até agora (`since` em ISO). */
export function fetchCcSummary(apiKey: string, orgId: string | null, sinceMs: number, signal?: AbortSignal): Promise<CcSummary> {
    return alphaGet(apiKey, withOrg("/usage/summary", orgId, { since: new Date(sinceMs).toISOString() }), ccSummarySchema, signal)
}
