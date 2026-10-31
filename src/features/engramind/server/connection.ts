import { DomainError } from "@/lib/api/route"
import { getIntegration } from "@/lib/integrations/config"
import { BOOTSTRAP_APP_SLUG, ENGRAMIND_INTEGRATION_ID, ENGRAMIND_WEBHOOK_PATH, OPEX_APP_SLUG } from "../constants"
import type { EngramindApp, EngramindConnectionDto, WhoAmI } from "../types"
import { engramindCall, engramindTarget, type EngramindTarget } from "./client"

/** Estado da conexão com o Engramind e o token do próprio Opex. */

const WHOAMI_TTL_MS = 30_000
let whoamiCache: { key: string; at: number; value: WhoAmI } | null = null

export function resetWhoamiCache(): void {
    whoamiCache = null
}

export async function fetchWhoami(target?: EngramindTarget): Promise<WhoAmI> {
    const resolved = target ?? (await engramindTarget())
    const key = `${resolved.baseUrl}|${resolved.token.slice(0, 16)}`
    if (whoamiCache && whoamiCache.key === key && Date.now() - whoamiCache.at < WHOAMI_TTL_MS) return whoamiCache.value
    const value = await engramindCall<WhoAmI>("GET", { path: "/v1/whoami" }, { target: resolved })
    whoamiCache = { key, at: Date.now(), value }
    return value
}

/** Admin com `read+write+delete`: o mínimo para o Opex administrar a rede. */
export const isSufficientToken = (whoami: Pick<WhoAmI, "kind" | "scopes">) => whoami.kind === "admin" && ["read", "write", "delete"].every((scope) => whoami.scopes.includes(scope))

/** Id (`tk_…`) do token que o Opex usa (para marcá-lo e protegê-lo na tela). */
export async function ownTokenId(): Promise<string | null> {
    try {
        return (await fetchWhoami()).token_id
    } catch {
        return null
    }
}

export const webhookUrlOf = (opexPublicUrl: string) => `${opexPublicUrl.replace(/\/+$/, "")}${ENGRAMIND_WEBHOOK_PATH}`

async function environmentName(id: string | undefined): Promise<string | null> {
    if (!id) return null
    try {
        const { resolveEnvironmentRef } = await import("@/features/environments/server/service")
        return (await resolveEnvironmentRef(id)).name
    } catch {
        return null
    }
}

export async function getConnection(): Promise<EngramindConnectionDto> {
    const resolved = await getIntegration(ENGRAMIND_INTEGRATION_ID)
    const values = resolved.values
    const tokenConfigured = resolved.secretSources.adminToken !== "none" && !resolved.secretErrors.includes("adminToken")
    const configured = Boolean(values.baseUrl && tokenConfigured)
    const webhookUrl = values.opexPublicUrl ? webhookUrlOf(values.opexPublicUrl) : null
    const base: EngramindConnectionDto = {
        baseUrl: values.baseUrl ?? null,
        opexPublicUrl: values.opexPublicUrl ?? null,
        environmentId: values.environmentId ?? null,
        environmentName: await environmentName(values.environmentId),
        tokenConfigured,
        webhookSecretConfigured: resolved.secretSources.webhookSecret !== "none",
        webhookUrl,
        configured,
        whoami: null,
        error: null,
        bootstrapPending: false,
        tokenSufficient: false,
        webhook: null,
    }
    if (!configured) return base
    try {
        const whoami = await fetchWhoami()
        const appSlug = whoami.app.slug === BOOTSTRAP_APP_SLUG ? OPEX_APP_SLUG : whoami.app.slug
        const app = await engramindCall<EngramindApp>("GET", { path: `/v1/apps/${encodeURIComponent(appSlug)}` }).catch(() => null)
        return {
            ...base,
            whoami,
            bootstrapPending: whoami.app.slug === BOOTSTRAP_APP_SLUG,
            tokenSufficient: isSufficientToken(whoami),
            webhook: app ? { url: app.webhook?.url ?? null, secretConfigured: app.webhook?.secret.configured === true, updatedAt: app.webhook?.secret.updated_at ?? null, matches: Boolean(webhookUrl && app.webhook?.url === webhookUrl) } : null,
        }
    } catch (error) {
        return { ...base, error: error instanceof DomainError ? error.message : "Não foi possível falar com o Engramind" }
    }
}

/** Exige a conexão pronta (token admin suficiente) antes das operações das abas. */
export async function requireUsableConnection(): Promise<WhoAmI> {
    const whoami = await fetchWhoami()
    if (!isSufficientToken(whoami)) throw new DomainError(409, "Reconfigure o token: o Opex precisa de um token admin com read+write+delete.", "ENGRAMIND_TOKEN_INSUFFICIENT")
    return whoami
}
