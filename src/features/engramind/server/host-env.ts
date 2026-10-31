import { DomainError } from "@/lib/api/route"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { createHostRunner, type HostRunner } from "@/features/local-docker/server/shell"
import { newJobId } from "@/features/local-docker/server/detached"
import { ENGRAMIND_INTEGRATION_ID, ENV_PROJECT_KEYS } from "../constants"
import { applyEnvChanges, envEntriesOf, envValuesOf } from "../env-file"
import { envUpdateSchema } from "../schemas/env"
import type { EnvFileDto } from "../types"
import { engramindReady } from "./client"
import { applyCommand, ENV_CHANGED_EXIT, parseReadOutput, readEnvCommand, writeEnvCommand } from "./host-env-commands"
import { applyState, currentApply, emitApply, startApplyRun } from "./apply-hub"
import { ENGRAMIND_STATE_ID, EngramindState, engramindDb, type IEngramindState } from "./models"
import { AcaoAuditoria, auditEngramind, engramindLog, publishEngramind } from "./shared"

/**
 * Variáveis de ambiente do Engramind: lidas, gravadas e aplicadas NO HOST pelo OpenCode (executor
 * do módulo Ambientes), na pasta do Ambiente vinculado. O servidor do Opex só coordena e nunca vê os
 * valores sensíveis (mascarados no host).
 */

const READ_TIMEOUT_MS = 30_000
const APPLY_TIMEOUT_MS = 10 * 60_000
const HEALTH_WAIT_MS = 60_000

let runnerOverride: HostRunner | null = null
/** Testes: troca o executor do host. */
export function setEngramindHostRunner(runner: HostRunner | null): void {
    runnerOverride = runner
}
/** Margem além do tempo limite do executor: se ele nunca responder, a execução falha e a trava é liberada. */
const APPLY_DEADLINE_GRACE_MS = 30_000
let applyDeadlineOverride: number | null = null
/** Testes: prazo curto para o executor do "Aplicar e reiniciar". */
export function setEngramindApplyDeadline(ms: number | null): void {
    applyDeadlineOverride = ms
}

/** Rejeita quando a promessa não termina no prazo (o executor do host travou). */
function withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
    })
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

/** Efeito final (auditoria/evento) que não pode derrubar a execução em segundo plano. */
async function safely(label: string, task: () => Promise<unknown>): Promise<void> {
    try {
        await task()
    } catch (error) {
        engramindLog.error({ err: error }, `[engramind] ${label} falhou depois do aplicar`)
    }
}

const hostRunner = (): HostRunner => runnerOverride ?? createHostRunner(integrationDebug(ENGRAMIND_INTEGRATION_ID))

export interface EngramindInstall {
    environmentId: string
    name: string
    dir: string
    composeFiles: string[]
    projectName: string
    adopted: boolean
}

export async function resolveInstall(): Promise<EngramindInstall> {
    const config = await getIntegrationConfig(ENGRAMIND_INTEGRATION_ID)
    if (!config.environmentId) throw new DomainError(409, "Vincule o Ambiente do Engramind na aba Conexão (adote o projeto em Ambientes, se ainda não aparece).", "ENGRAMIND_NO_ENVIRONMENT")
    const { resolveEnvironmentRef, composePlanOf } = await import("@/features/environments/server/service")
    const { loadEnvironmentsSettings } = await import("@/features/environments/server/settings")
    const env = await resolveEnvironmentRef(config.environmentId)
    const plan = composePlanOf(env, await loadEnvironmentsSettings())
    if (plan.filesOn !== "server") throw new DomainError(422, "O Ambiente do Engramind precisa estar no servidor (o do PC não é suportado).", "ENGRAMIND_ENVIRONMENT_UNSUPPORTED")
    return { environmentId: String(env._id), name: env.name, dir: plan.dir, composeFiles: plan.composeFiles, projectName: plan.projectName, adopted: env.source.kind === "adopted" }
}

async function readMasked(install: EngramindInstall): Promise<{ hash: string; content: string }> {
    const result = await hostRunner()(readEnvCommand(install.dir), READ_TIMEOUT_MS, { redactedAs: `ler .env do Engramind em ${install.dir} (valores sensíveis mascarados no host)`, quiet: true, retryOnLost: true })
    const parsed = parseReadOutput(result.output)
    if (parsed === "missing") throw new DomainError(404, `Não há .env na pasta do Engramind (${install.dir}).`, "ENGRAMIND_ENV_MISSING")
    if (!parsed || result.exitCode !== 0) throw new DomainError(502, "Não foi possível ler o .env do Engramind no host pelo OpenCode. Tente novamente.", "ENGRAMIND_ENV_READ_FAILED")
    return parsed
}

async function loadState(): Promise<IEngramindState | null> {
    await engramindDb()
    return EngramindState.findById(ENGRAMIND_STATE_ID).lean<IEngramindState>()
}

export async function readEngramindEnv(): Promise<EnvFileDto> {
    const install = await resolveInstall()
    const { hash, content } = await readMasked(install)
    const state = await loadState()
    return {
        hash,
        entries: envEntriesOf(content),
        environment: { id: install.environmentId, name: install.name, dir: install.dir.replace(/^'|'$/g, "") },
        pendingApply: state?.pendingApply ? { keys: state.pendingApply.keys, at: new Date(state.pendingApply.at).toISOString() } : null,
        apply: applyState(),
    }
}

export async function updateEngramindEnv(raw: unknown, actorId: string): Promise<EnvFileDto> {
    const parsed = envUpdateSchema.safeParse(raw)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new DomainError(400, issue?.message ?? "Dados inválidos", "VALIDATION_ERROR", parsed.error.issues)
    }
    const input = parsed.data
    const install = await resolveInstall()
    const current = await readMasked(install)
    if (current.hash !== input.hash) throw new DomainError(409, "O arquivo mudou no servidor desde a leitura; recarregue.", "ENGRAMIND_ENV_CHANGED")
    const changes: Record<string, string> = { ...input.changes }
    if (input.litestreamSecret) changes.LITESTREAM_SECRET_ACCESS_KEY = input.litestreamSecret
    const previousValues = envValuesOf(current.content)
    const next = applyEnvChanges(current.content, changes)
    const result = await hostRunner()(writeEnvCommand(install.dir, input.hash, next), READ_TIMEOUT_MS, { redactedAs: `gravar .env do Engramind (${Object.keys(changes).join(", ")}; valores ocultos)`, quiet: true })
    if (result.exitCode === ENV_CHANGED_EXIT) throw new DomainError(409, "O arquivo mudou no servidor desde a leitura; recarregue.", "ENGRAMIND_ENV_CHANGED")
    if (result.exitCode !== 0) throw new DomainError(502, "Não foi possível gravar o .env do Engramind no host. Nada foi aplicado.", "ENGRAMIND_ENV_WRITE_FAILED")

    const keys = Object.keys(changes)
    await engramindDb()
    const state = await loadState()
    const previous: Record<string, string> = { ...(state?.pendingApply?.previous ?? {}) }
    for (const key of ENV_PROJECT_KEYS) if (key in changes && !(key in previous) && previousValues[key] !== undefined) previous[key] = previousValues[key]!
    const pendingKeys = [...new Set([...(state?.pendingApply?.keys ?? []), ...keys])]
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { pendingApply: { keys: pendingKeys, at: new Date(), previous } } }, { upsert: true })
    await auditEngramind(actorId, "env", AcaoAuditoria.ATUALIZAR, { chaves: keys })
    engramindLog.info({ keys }, "[engramind] .env gravado no host")
    await publishEngramind({ type: "env.updated", keys })
    return readEngramindEnv()
}

/** Inicia o "Aplicar e reiniciar" (em segundo plano); o log ao vivo sai por `openApplyStream`. */
export async function applyEngramindEnv(actorId: string): Promise<{ id: string }> {
    if (currentApply()?.status === "running") throw new DomainError(409, "Já há uma reinicialização do Engramind em andamento.", "ENGRAMIND_APPLY_BUSY")
    const install = await resolveInstall()
    const { content } = await readMasked(install)
    const values = envValuesOf(content)
    const state = await loadState()
    const previous = state?.pendingApply?.previous ?? {}
    const projectChanged = ENV_PROJECT_KEYS.some((key) => previous[key] !== undefined && previous[key] !== values[key])
    const currentContainer = previous.CONTAINER_NAME ?? values.CONTAINER_NAME ?? "engramind-api"
    const command = applyCommand({ dir: install.dir, composeFiles: install.composeFiles, previousProject: projectChanged ? install.projectName : null, currentContainer })
    const id = newJobId("engramind-apply")
    const run = startApplyRun(id)
    const keys = state?.pendingApply?.keys ?? []
    void (async () => {
        try {
            const deadlineMs = applyDeadlineOverride ?? APPLY_TIMEOUT_MS + APPLY_DEADLINE_GRACE_MS
            const result = await withDeadline(
                hostRunner()(command, APPLY_TIMEOUT_MS, { detached: true, jobId: id, redactedAs: "aplicar .env e recriar o serviço api do Engramind", onOutput: (text) => emitApply(run, { type: "log", text }) }),
                deadlineMs,
                `o executor do host não respondeu em ${Math.round(deadlineMs / 1000)} s`,
            )
            if (result.exitCode !== 0) throw new Error(`docker compose terminou com código ${result.exitCode ?? "?"}`)
            emitApply(run, { type: "log", text: "\r\nConferindo /health/ready…\r\n" })
            const config = await getIntegrationConfig(ENGRAMIND_INTEGRATION_ID)
            const deadline = Date.now() + HEALTH_WAIT_MS
            let health = { ready: false, detail: "sem URL base" }
            while (config.baseUrl && Date.now() < deadline) {
                health = await engramindReady(config.baseUrl)
                if (health.ready) break
                await new Promise((resolve) => setTimeout(resolve, 3_000))
            }
            if (!health.ready) throw new Error(`o serviço subiu, mas /health/ready não respondeu pronto (${health.detail}); confira a URL base`)
            await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { pendingApply: null } })
            if (projectChanged && install.adopted && values.APP_PORT) await renameAdoptedProject(install.environmentId, `engramind-${values.APP_PORT}`)
            emitApply(run, { type: "log", text: "Engramind pronto.\r\n" })
            emitApply(run, { type: "status", status: "success", error: null })
            await safely("auditoria", () => auditEngramind(actorId, "env-apply", AcaoAuditoria.EXECUTAR, { chaves: keys, projetoRecriado: projectChanged }))
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            engramindLog.warn({ err: message }, "[engramind] aplicar .env falhou")
            emitApply(run, { type: "log", text: `\r\nFalhou: ${message}\r\n` })
            emitApply(run, { type: "status", status: "failed", error: message })
            await safely("auditoria", () => auditEngramind(actorId, "env-apply", AcaoAuditoria.EXECUTAR, { chaves: keys, erro: message }))
        }
        await safely("evento env.applied", () => publishEngramind({ type: "env.applied" }))
    })().catch((error: unknown) => {
        engramindLog.error({ err: error }, "[engramind] aplicar .env terminou com erro inesperado")
        if (currentApply()?.id === id && currentApply()?.status === "running") emitApply(run, { type: "status", status: "failed", error: error instanceof Error ? error.message : String(error) })
    })
    return { id }
}

/** O nome do projeto do compose segue `engramind-${APP_PORT}`: o Ambiente adotado acompanha a troca de porta. */
async function renameAdoptedProject(environmentId: string, projectName: string): Promise<void> {
    try {
        const { Environment, environmentsDb } = await import("@/features/environments/server/models")
        const { publishEnvironment } = await import("@/features/environments/server/settings")
        await environmentsDb()
        await Environment.updateOne({ _id: environmentId, "source.kind": "adopted" }, { $set: { "source.projectName": projectName } })
        await publishEnvironment(environmentId, "updated")
    } catch (error) {
        engramindLog.warn({ err: error, projectName }, "[engramind] não foi possível atualizar o projeto do Ambiente")
    }
}
