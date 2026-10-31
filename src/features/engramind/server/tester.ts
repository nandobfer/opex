import { getIntegrationConfig } from "@/lib/integrations/config"
import { fail, warnResult, type IntegrationTester } from "@/features/integrations/testers/types"
import { BOOTSTRAP_APP_SLUG, ENGRAMIND_INTEGRATION_ID } from "../constants"
import type { EngramindApp, EngramindJob, EngramindStatus, WhoAmI } from "../types"
import { engramindCall, engramindReady, type EngramindTarget } from "./client"
import { engramindCodeOf } from "./errors"
import { isSufficientToken, webhookUrlOf } from "./connection"

/**
 * Teste de conexão do Engramind: `/health/ready` + `whoami`. Vermelho: fora do ar, token inválido ou
 * sem admin `read+write+delete`. Amarelo: token ainda de bootstrap, webhook não registrado, entregas
 * de webhook `failed`, backup em falha ou reindexação com falha.
 */
export const testEngramind: IntegrationTester = async ({ emit, signal }) => {
    const config = await getIntegrationConfig(ENGRAMIND_INTEGRATION_ID)
    if (!config.baseUrl) fail("Sem URL base: configure a aba Conexão")
    if (!config.adminToken) fail("Sem token: cadastre o token admin na aba Conexão")
    const target: EngramindTarget = { baseUrl: config.baseUrl.replace(/\/+$/, ""), token: config.adminToken }

    emit("step", `GET ${target.baseUrl}/health/ready`)
    const health = await engramindReady(target.baseUrl, AbortSignal.any([signal, AbortSignal.timeout(10_000)]))
    if (!health.ready) fail(`Engramind fora do ar ou sem receber tráfego (${health.detail})`)
    emit("success", "Engramind pronto")

    emit("step", "GET /v1/whoami")
    let whoami: WhoAmI
    try {
        whoami = await engramindCall<WhoAmI>("GET", { path: "/v1/whoami" }, { target, signal })
    } catch (error) {
        if (engramindCodeOf(error) === "AUTH_INVALID") fail("Token inválido, expirado ou revogado: reconfigure o token")
        fail(error instanceof Error ? error.message : String(error))
    }
    if (!isSufficientToken(whoami)) fail(`O token não é admin com read+write+delete (${whoami.kind}, ${whoami.scopes.join("+")}): reconfigure o token`)
    emit("success", `Token ${whoami.token_id} do app ${whoami.app.slug} (${whoami.scopes.join("+")})`)

    const warnings: string[] = []
    if (whoami.app.slug === BOOTSTRAP_APP_SLUG) warnings.push("o token ainda é o de bootstrap (salve a conexão para trocar pelo do Opex)")
    const app = await engramindCall<EngramindApp>("GET", { path: `/v1/apps/${encodeURIComponent(whoami.app.slug)}` }, { target, signal }).catch(() => null)
    const expected = config.opexPublicUrl ? webhookUrlOf(config.opexPublicUrl) : null
    if (!app?.webhook?.url || !app.webhook.secret.configured || (expected && app.webhook.url !== expected)) warnings.push("webhook do Opex não registrado")
    const failed = await engramindCall<{ jobs: EngramindJob[] }>("GET", { path: "/v1/jobs", query: { kind: "webhook", state: "failed", limit: 1 } }, { target, signal }).catch(() => null)
    if (failed?.jobs.length) warnings.push("há entregas de webhook falhas (o Engramind não alcança a URL pública do Opex?)")
    const status = await engramindCall<EngramindStatus>("GET", { path: "/v1/status" }, { target, signal }).catch(() => null)
    if (status?.backup.status === "fail") warnings.push(`backup em falha${status.backup.detail ? ` (${status.backup.detail})` : ""}`)
    if (status?.embedding.state === "failed") warnings.push("reindexação dos embeddings com falha")
    if (status) emit("info", `Engramind ${status.version}`)

    for (const warning of warnings) emit("warn", warning)
    if (warnings.length) return warnResult(`Conectado com restrição: ${warnings.join("; ")}`)
    return `Conectado ao Engramind ${status?.version ?? ""} como ${whoami.app.slug}`.trim()
}
