import { AcaoAuditoria, createAuditContext, dbConnect, recordAudit } from "@/lib/db"
import { Integration } from "@/lib/db/models/Integration"
import { encryptSecret, SecretBoxKeyError } from "@/lib/crypto/secretBox"
import { DomainError } from "@/lib/api/route"
import { GO_SIPAL_SESSION_FIELDS as F, getIntegrationDef, integrationDebugChannel } from "@/lib/integrations/catalog"
import { getIntegration } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { invalidateStoredIntegrations, loadStoredIntegration } from "@/lib/integrations/store"
import { logger } from "@/lib/logger"
import { publishToChannels } from "@/lib/pusher/channels"
import { INTEGRATION_AUDIT_ENTITY } from "@/features/integrations/services/integration-service"
import { GoSipalError, goSipalRequest } from "../client"
import { goSipalTokenExpiresAt } from "../jwt"
import { goSipalEmailSchema } from "./schemas"
import {
    GO_SIPAL_CODE_TTL_MS,
    GO_SIPAL_RESEND_COOLDOWN_MS,
    GO_SIPAL_SESSION_EVENT,
    type GoSipalPendingLoginDto,
    type GoSipalSessionDto,
    type GoSipalSessionStatus,
    type GoSipalSessionUserDto,
} from "./types"

/**
 * Sessão do Go! Sipal (Integrações › Go! Sipal) — SOMENTE servidor.
 *
 * Login da plataforma por código de e-mail: `POST /api/auth/send-code {email}` (6 dígitos, 15 min;
 * pedir outro invalida o anterior) → `POST /api/auth/verify-code {email, code}` → `{ token, user }`
 * (JWT de 28 dias, sem refresh nem logout do lado da plataforma). O JWT fica cifrado no segredo
 * `token` da integração; os dados do usuário e o login pendente, nos campos de card.
 */

const DAY_MS = 86_400_000
const ID = "go_sipal" as const

interface PlatformUser {
    id?: string
    name?: string
    email?: string
    userType?: string
    isDeveloper?: boolean
    isDevLeader?: boolean
}

function toUserDto(values: Record<string, unknown>): GoSipalSessionUserDto {
    const text = (key: string) => (typeof values[key] === "string" && values[key] ? (values[key] as string) : null)
    return {
        name: text(F.name),
        email: text(F.email),
        userType: text(F.userType),
        isDeveloper: values[F.isDeveloper] === true,
        isDevLeader: values[F.isDevLeader] === true,
    }
}

function pendingOf(values: Record<string, unknown>, now: number): GoSipalPendingLoginDto | null {
    const email = values[F.pendingEmail]
    const requestedAt = values[F.pendingRequestedAt]
    if (typeof email !== "string" || !email || typeof requestedAt !== "string") return null
    const at = new Date(requestedAt).getTime()
    if (!Number.isFinite(at)) return null
    return {
        email,
        requestedAt: new Date(at).toISOString(),
        codeExpiresAt: new Date(at + GO_SIPAL_CODE_TTL_MS).toISOString(),
        resendAvailableAt: new Date(at + GO_SIPAL_RESEND_COOLDOWN_MS).toISOString(),
        expired: now >= at + GO_SIPAL_CODE_TTL_MS,
    }
}

/** Situação da sessão a partir do token salvo e da expiração lida dele. */
export function sessionStatusOf(
    token: string | undefined,
    warningDays: number,
    now: number,
): { status: GoSipalSessionStatus; expiresAt: Date | null; daysLeft: number | null } {
    if (!token) return { status: "disconnected", expiresAt: null, daysLeft: null }
    const expiresAt = goSipalTokenExpiresAt(token)
    if (!expiresAt) return { status: "connected", expiresAt: null, daysLeft: null }
    const remaining = expiresAt.getTime() - now
    if (remaining <= 0) return { status: "expired", expiresAt, daysLeft: 0 }
    const daysLeft = Math.ceil(remaining / DAY_MS)
    return { status: daysLeft <= warningDays ? "expiring" : "connected", expiresAt, daysLeft }
}

export async function getGoSipalSession(now = Date.now()): Promise<GoSipalSessionDto> {
    const resolved = await getIntegration(ID)
    const values = resolved.values as unknown as Record<string, unknown>
    const { token, email, baseUrl, expiryWarningDays } = resolved.values
    const { status, expiresAt, daysLeft } = sessionStatusOf(token, expiryWarningDays, now)
    const connected = status !== "disconnected"
    const connectedAt = values[F.connectedAt]
    return {
        status,
        email: email ?? null,
        baseUrl,
        warningDays: expiryWarningDays,
        user: connected ? toUserDto(values) : null,
        connectedAt: connected && typeof connectedAt === "string" ? connectedAt : null,
        expiresAt: expiresAt?.toISOString() ?? null,
        daysLeft,
        pending: pendingOf(values, now),
    }
}

/** Grava os campos de card/segredo do documento da integração (cria o documento se faltar). */
async function writeSession(actorId: string, $set: Record<string, unknown>, unsetKeys: string[] = []): Promise<void> {
    await dbConnect()
    if (!(await loadStoredIntegration(ID))) {
        const doc = new Integration({
            integrationId: ID,
            environment: getIntegrationDef(ID).defaultEnvironment,
            debugMode: false,
            publicValues: {},
            secretValues: {},
        })
        doc.set("_auditContext", createAuditContext(actorId))
        await doc.save()
    }
    const $unset = Object.fromEntries(unsetKeys.map((key) => [`publicValues.${key}`, ""]))
    await Integration.updateOne(
        { integrationId: ID },
        { ...(Object.keys($set).length ? { $set } : {}), ...(unsetKeys.length ? { $unset } : {}), _auditContext: { userId: actorId } },
    )
    invalidateStoredIntegrations()
}

async function notifySessionChanged(): Promise<void> {
    await publishToChannels([integrationDebugChannel(ID)], GO_SIPAL_SESSION_EVENT, {})
}

function toDomainError(error: unknown): never {
    if (error instanceof GoSipalError) {
        const status = error.code === "UNAVAILABLE" ? 502 : error.code === "NOT_CONFIGURED" ? 409 : error.status === 403 ? 403 : 400
        throw new DomainError(status, error.message, `GO_SIPAL_${error.code}`)
    }
    throw error
}

const SESSION_KEYS = [F.name, F.email, F.userType, F.isDeveloper, F.isDevLeader, F.connectedAt]
const PENDING_KEYS = [F.pendingEmail, F.pendingRequestedAt]

/** Pede o código de acesso para o e-mail configurado. Não mexe na sessão atual (renovar). */
export async function sendGoSipalCode(actorId: string, now = Date.now()): Promise<GoSipalSessionDto> {
    const { values } = await getIntegration(ID)
    const parsedEmail = goSipalEmailSchema.safeParse(values.email ?? "")
    if (!parsedEmail.success) throw new DomainError(409, "Configure o e-mail da integração Go! Sipal e salve antes de pedir o código", "GO_SIPAL_EMAIL_MISSING")
    const email = parsedEmail.data

    const pending = pendingOf(values as unknown as Record<string, unknown>, now)
    if (pending && now < new Date(pending.resendAvailableAt).getTime()) {
        const seconds = Math.ceil((new Date(pending.resendAvailableAt).getTime() - now) / 1000)
        throw new DomainError(429, `Aguarde ${seconds} s para pedir outro código`, "GO_SIPAL_RESEND_COOLDOWN")
    }

    try {
        await goSipalRequest("/api/auth/send-code", { method: "POST", auth: false, body: { email }, label: "enviar código" })
    } catch (error) {
        toDomainError(error)
    }

    await writeSession(actorId, {
        [`publicValues.${F.pendingEmail}`]: email,
        [`publicValues.${F.pendingRequestedAt}`]: new Date(now).toISOString(),
    })
    integrationDebug(ID).info(`Código de acesso enviado para ${email}`)
    await recordAudit({
        userId: actorId,
        entidade: INTEGRATION_AUDIT_ENTITY,
        entidadeId: ID,
        acao: AcaoAuditoria.EXECUTAR,
        depois: { acao: "enviar código de acesso", email },
    })
    await notifySessionChanged()
    return getGoSipalSession(now)
}

/** Confirma o código: grava o JWT (cifrado) e os dados do usuário; encerra o login pendente. */
export async function verifyGoSipalCode(code: string, actorId: string, now = Date.now()): Promise<GoSipalSessionDto> {
    const { values } = await getIntegration(ID)
    const pending = pendingOf(values as unknown as Record<string, unknown>, now)
    if (!pending) throw new DomainError(409, "Nenhum código pendente: peça um código primeiro", "GO_SIPAL_NO_PENDING_CODE")
    if (pending.expired) throw new DomainError(400, "Código expirado. Peça um novo código.", "GO_SIPAL_CODE_EXPIRED")

    let result: { token?: unknown; user?: PlatformUser }
    try {
        result = await goSipalRequest("/api/auth/verify-code", { method: "POST", auth: false, body: { email: pending.email, code }, label: "confirmar código" })
    } catch (error) {
        toDomainError(error)
    }
    if (typeof result?.token !== "string" || !result.token) {
        throw new DomainError(502, "O Go! Sipal não devolveu o token da sessão", "GO_SIPAL_UNAVAILABLE")
    }

    let box: ReturnType<typeof encryptSecret>
    try {
        box = encryptSecret(result.token)
    } catch (error) {
        if (error instanceof SecretBoxKeyError) {
            throw new DomainError(409, "Não é possível guardar a sessão: configure INTEGRATIONS_ENCRYPTION_KEY no servidor", "ENCRYPTION_KEY_MISSING")
        }
        throw error
    }

    const user = result.user ?? {}
    const userEmail = user.email ?? pending.email
    await writeSession(
        actorId,
        {
            "secretValues.token": box,
            [`publicValues.${F.name}`]: user.name ?? "",
            [`publicValues.${F.email}`]: userEmail,
            [`publicValues.${F.userType}`]: user.userType ?? "",
            [`publicValues.${F.isDeveloper}`]: user.isDeveloper === true,
            [`publicValues.${F.isDevLeader}`]: user.isDevLeader === true,
            [`publicValues.${F.connectedAt}`]: new Date(now).toISOString(),
        },
        PENDING_KEYS,
    )

    const expiresAt = goSipalTokenExpiresAt(result.token)
    integrationDebug(ID).success(`Sessão iniciada para ${userEmail}${expiresAt ? ` (expira em ${expiresAt.toISOString()})` : ""}`)
    await recordAudit({
        userId: actorId,
        entidade: INTEGRATION_AUDIT_ENTITY,
        entidadeId: ID,
        acao: AcaoAuditoria.LOGIN,
        depois: { email: userEmail, desenvolvedor: user.isDeveloper === true, expiraEm: expiresAt?.toISOString() ?? null, token: "(alterado)" },
    })
    await notifySessionChanged()
    void refreshStatus()
    return getGoSipalSession(now)
}

/** Desiste do código pendente (a sessão atual, se houver, continua). */
export async function cancelGoSipalCode(actorId: string): Promise<GoSipalSessionDto> {
    await writeSession(actorId, {}, PENDING_KEYS)
    await notifySessionChanged()
    return getGoSipalSession()
}

/** Desconecta: apaga o JWT (a plataforma não tem logout; o token só deixa de ser usado aqui). */
export async function disconnectGoSipal(actorId: string): Promise<GoSipalSessionDto> {
    const before = await getGoSipalSession()
    await writeSession(actorId, { "secretValues.token": null }, [...SESSION_KEYS, ...PENDING_KEYS])
    integrationDebug(ID).info("Sessão desconectada")
    await recordAudit({
        userId: actorId,
        entidade: INTEGRATION_AUDIT_ENTITY,
        entidadeId: ID,
        acao: AcaoAuditoria.LOGOUT,
        antes: { email: before.user?.email ?? null, token: before.status === "disconnected" ? "(vazio)" : "(configurado)" },
        depois: { token: "(removido)" },
    })
    await notifySessionChanged()
    void refreshStatus()
    return getGoSipalSession()
}

/** Usuário da sessão atual na plataforma (`GET /api/auth/me`). */
export async function fetchGoSipalMe(signal?: AbortSignal): Promise<PlatformUser> {
    const body = await goSipalRequest<{ user?: PlatformUser }>("/api/auth/me", { signal, label: "verificar sessão" })
    return body?.user ?? {}
}

/** Atualiza a bolinha de status depois de conectar/desconectar (em segundo plano). */
async function refreshStatus(): Promise<void> {
    try {
        const { runIntegrationTest } = await import("@/features/integrations/services/integration-test-runner")
        await runIntegrationTest(ID, { source: "manual" })
    } catch (error) {
        logger.warn({ err: error }, "[go-sipal] Falha ao atualizar o status após mudar a sessão")
    }
}
