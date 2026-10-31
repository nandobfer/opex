import { randomBytes } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { BOOTSTRAP_APP_SLUG, ENGRAMIND_INTEGRATION_ID, OPEX_APP_NAME, OPEX_APP_SLUG, OPEX_TOKEN_LABEL } from "../constants"
import { connectionInputSchema, type ConnectionInput } from "../schemas/connection"
import type { BootstrapStepDto, ConnectionSaveResultDto, EngramindApp, IssuedToken, WhoAmI } from "../types"
import { engramindCall, type EngramindTarget } from "./client"
import { engramindCodeOf } from "./errors"
import { fetchWhoami, getConnection, isSufficientToken, resetWhoamiCache, webhookUrlOf } from "./connection"
import { AcaoAuditoria, auditEngramind, engramindLog } from "./shared"

/**
 * Conexão e bootstrap automático da integração Engramind:
 * 1. com o token do app `bootstrap`, cria (ou reaproveita) o app `opex`, emite um token admin
 *    `read+write+delete` "Opex", grava esse token e SÓ DEPOIS revoga o de bootstrap (o app fica);
 * 2. garante o segredo do webhook (gerado pelo Opex, cifrado) e registra `webhook_url`/`webhook_secret`
 *    no app do token. Repetir é seguro: o app é reaproveitado e o webhook só muda se precisar.
 * Falha depois da emissão: o token novo continua gravado e o de bootstrap não é revogado.
 */

async function integrationService() {
    return import("@/features/integrations/services/integration-service")
}

/** Grava campos da integração pelo serviço central (cifra os segredos e audita a integração). */
async function saveIntegrationFields(input: { publicValues?: Record<string, string>; secrets?: Record<string, { action: "set"; value: string }> }, actorId: string): Promise<void> {
    const { updateIntegration, IntegrationUpdateError } = await integrationService()
    try {
        await updateIntegration(ENGRAMIND_INTEGRATION_ID, input, actorId)
    } catch (error) {
        if (error instanceof IntegrationUpdateError) throw new DomainError(error.status, error.message, "INTEGRATION_UPDATE_FAILED")
        throw error
    }
}

const step = (steps: BootstrapStepDto[], id: BootstrapStepDto["id"], status: BootstrapStepDto["status"], message: string) => {
    steps.push({ id, status, message })
}
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function ensureOpexApp(target: EngramindTarget): Promise<EngramindApp> {
    try {
        return await engramindCall<EngramindApp>("GET", { path: `/v1/apps/${OPEX_APP_SLUG}` }, { target })
    } catch (error) {
        if (engramindCodeOf(error) !== "APP_NOT_FOUND") throw error
    }
    try {
        return await engramindCall<EngramindApp>("POST", { path: "/v1/apps", body: { slug: OPEX_APP_SLUG, name: OPEX_APP_NAME, description: "Gestor da rede (Opex)" } }, { target })
    } catch (error) {
        if (engramindCodeOf(error) !== "SLUG_ALREADY_EXISTS") throw error
        return engramindCall<EngramindApp>("GET", { path: `/v1/apps/${OPEX_APP_SLUG}` }, { target })
    }
}

/** Troca o token de bootstrap pelo token próprio do Opex. Devolve o novo alvo ou `null` se parou. */
async function replaceBootstrapToken(target: EngramindTarget, whoami: WhoAmI, actorId: string, steps: BootstrapStepDto[]): Promise<EngramindTarget | null> {
    try {
        const app = await ensureOpexApp(target)
        step(steps, "app", "ok", `App ${app.slug} pronto`)
        await auditEngramind(actorId, "bootstrap", AcaoAuditoria.EXECUTAR, { passo: "app", app: app.slug })
    } catch (error) {
        step(steps, "app", "failed", `Não foi possível criar o app ${OPEX_APP_SLUG}: ${messageOf(error)}`)
        return null
    }
    let issued: IssuedToken
    try {
        issued = await engramindCall<IssuedToken>("POST", { path: "/v1/tokens", body: { kind: "admin", app: OPEX_APP_SLUG, scopes: ["read", "write", "delete"], label: OPEX_TOKEN_LABEL } }, { target })
        if (!issued.secret) throw new Error("o Engramind não devolveu o segredo do token")
        step(steps, "token", "ok", `Token ${issued.token.prefix} emitido para o app ${OPEX_APP_SLUG}`)
        await auditEngramind(actorId, "bootstrap", AcaoAuditoria.EXECUTAR, { passo: "token", app: OPEX_APP_SLUG, tokenPrefix: issued.token.prefix })
    } catch (error) {
        step(steps, "token", "failed", `Não foi possível emitir o token do Opex: ${messageOf(error)}`)
        return null
    }
    try {
        await saveIntegrationFields({ secrets: { adminToken: { action: "set", value: issued.secret } } }, actorId)
        resetWhoamiCache()
        step(steps, "save", "ok", "Token próprio do Opex gravado (cifrado)")
    } catch (error) {
        engramindLog.error({ err: error, tokenPrefix: issued.token.prefix }, "[engramind] token emitido mas não gravado; bootstrap mantido")
        step(steps, "save", "failed", `O token ${issued.token.prefix} foi emitido mas não pôde ser gravado (${messageOf(error)}); o de bootstrap continua válido. Revogue ${issued.token.prefix} e repita.`)
        return null
    }
    const next: EngramindTarget = { baseUrl: target.baseUrl, token: issued.secret }
    try {
        await engramindCall("POST", { path: `/v1/tokens/${encodeURIComponent(whoami.token_id)}/revoke`, body: {} }, { target: next })
        step(steps, "revoke", "ok", `Token de bootstrap ${whoami.token_id} revogado (o app ${BOOTSTRAP_APP_SLUG} foi mantido)`)
        await auditEngramind(actorId, "bootstrap", AcaoAuditoria.EXECUTAR, { passo: "revoke", tokenId: whoami.token_id })
    } catch (error) {
        step(steps, "revoke", "failed", `O token do Opex está gravado, mas o de bootstrap não foi revogado: ${messageOf(error)}`)
    }
    return next
}

/** Registra o webhook do app do token (segredo gerado e cifrado no Opex). */
async function ensureWebhook(target: EngramindTarget, appSlug: string, opexPublicUrl: string, forceSecret: boolean, actorId: string, steps: BootstrapStepDto[]): Promise<void> {
    try {
        const config = await getIntegrationConfig(ENGRAMIND_INTEGRATION_ID)
        let secret = config.webhookSecret
        let generated = false
        if (!secret || forceSecret) {
            secret = randomBytes(48).toString("base64")
            await saveIntegrationFields({ secrets: { webhookSecret: { action: "set", value: secret } } }, actorId)
            generated = true
        }
        const url = webhookUrlOf(opexPublicUrl)
        const app = await engramindCall<EngramindApp>("GET", { path: `/v1/apps/${encodeURIComponent(appSlug)}` }, { target })
        if (!generated && app.webhook?.url === url && app.webhook.secret.configured) {
            step(steps, "webhook", "skipped", `Webhook já registrado em ${url}`)
            return
        }
        await engramindCall("PATCH", { path: `/v1/apps/${encodeURIComponent(appSlug)}`, body: { webhook_url: url, webhook_secret: secret } }, { target, sensitiveBody: true })
        step(steps, "webhook", "ok", `Webhook registrado em ${url}`)
        await auditEngramind(actorId, "bootstrap", AcaoAuditoria.EXECUTAR, { passo: "webhook", app: appSlug, url, segredoGerado: generated })
    } catch (error) {
        step(steps, "webhook", "failed", `Não foi possível registrar o webhook: ${messageOf(error)}`)
    }
}

/** Bootstrap (quando o token é do app `bootstrap`) + webhook. Seguro para repetir. */
export async function runBootstrap(actorId: string, options: { forceWebhook?: boolean } = {}): Promise<BootstrapStepDto[]> {
    const steps: BootstrapStepDto[] = []
    const config = await getIntegrationConfig(ENGRAMIND_INTEGRATION_ID)
    if (!config.baseUrl || !config.adminToken) {
        step(steps, "whoami", "failed", "Informe a URL base e o token")
        return steps
    }
    let target: EngramindTarget = { baseUrl: config.baseUrl.replace(/\/+$/, ""), token: config.adminToken }
    resetWhoamiCache()
    let whoami: WhoAmI
    try {
        whoami = await fetchWhoami(target)
    } catch (error) {
        step(steps, "whoami", "failed", messageOf(error))
        return steps
    }
    if (!isSufficientToken(whoami)) {
        step(steps, "whoami", "failed", `Reconfigure o token: o Opex precisa de um token admin com read+write+delete (recebido ${whoami.kind} ${whoami.scopes.join("+")}).`)
        return steps
    }
    step(steps, "whoami", "ok", `Token ${whoami.token_id} do app ${whoami.app.slug} (${whoami.kind}, ${whoami.scopes.join("+")})`)
    let appSlug = whoami.app.slug
    if (whoami.app.slug === BOOTSTRAP_APP_SLUG) {
        const next = await replaceBootstrapToken(target, whoami, actorId, steps)
        if (!next) return steps
        target = next
        appSlug = OPEX_APP_SLUG
    }
    if (config.opexPublicUrl) await ensureWebhook(target, appSlug, config.opexPublicUrl, options.forceWebhook === true, actorId, steps)
    engramindLog.info({ steps: steps.map((item) => `${item.id}:${item.status}`) }, "[engramind] bootstrap executado")
    return steps
}

/** Aba Conexão: grava URL base, URL pública, Ambiente e (se informado) o token, e roda o bootstrap. */
export async function saveConnection(raw: ConnectionInput, actorId: string): Promise<ConnectionSaveResultDto> {
    const parsed = connectionInputSchema.safeParse(raw)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new DomainError(400, issue?.message ?? "Dados inválidos", "VALIDATION_ERROR", parsed.error.issues)
    }
    const input = parsed.data
    const before = await getIntegrationConfig(ENGRAMIND_INTEGRATION_ID)
    await saveIntegrationFields(
        {
            publicValues: { baseUrl: input.baseUrl, opexPublicUrl: input.opexPublicUrl, environmentId: input.environmentId ?? "" },
            ...(input.adminToken ? { secrets: { adminToken: { action: "set" as const, value: input.adminToken } } } : {}),
        },
        actorId,
    )
    resetWhoamiCache()
    const changed = Boolean(input.adminToken) || before.baseUrl !== input.baseUrl || before.opexPublicUrl !== input.opexPublicUrl || !before.webhookSecret
    const steps = changed ? await runBootstrap(actorId) : []
    return { connection: await getConnection(), steps }
}
