import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { isPreviewInstance } from "@/lib/instance"
import { isBuildActive, runExclusiveBuild } from "@/features/agentic/server/build-queue"
import { lastLine, type HostRunner } from "@/features/local-docker/server/shell"
import {
    appliedLimits,
    builderContainer,
    builderDeleteCommand,
    builderEnsureCommand,
    builderRecreateCommand,
    builderStartCommand,
    builderStatusCommand,
    builderStopCommand,
    builderUpdateCommand,
    builderUseCommand,
    cpuModeOf,
    limitsDiffer,
    NETWORK_HOST_FLAG,
    needsRecreate,
    parseBuilderStatus,
    unknownFlags,
    type ParsedBuilderStatus,
} from "../builder-commands"
import { ENVIRONMENTS_AUDIT_ENTITY } from "../constants"
import { environmentsBuilderSchema, type BuilderAction, type BuilderActionInput, type EnvironmentsBuilder } from "../schemas"
import type { BuilderLastActionDto, BuilderResultDto, BuilderStatus, EnvironmentsBuilderDto } from "../types"
import { EnvironmentsState, environmentsDb, type IEnvironmentsState } from "./models"
import { envLog, publishEnvironment, runEnvHost } from "./settings"

/**
 * Builder do buildx do **servidor** (linha "Builder do servidor" em Ambientes): estado, configuração e
 * ações. Limites mudam por recriação com `--keep-state` na vez da fila global do build; com um build em
 * andamento, `docker update` na hora e a recriação fica pendente até o build terminar (agendador e
 * motor da fila). Ver `aicontext/modules/environments.md`, "Builder do servidor".
 */

const ENTITY_ID = "builder"
const STATUS_TIMEOUT = 30_000
const RECREATE_TIMEOUT = 10 * 60_000
const ACTION_TIMEOUT = 5 * 60_000

const ACTION_LABELS: Record<BuilderAction, string> = { create: "criar", start: "levantar", stop: "derrubar", recreate: "recriar", delete: "apagar" }

type BuilderState = Pick<IEnvironmentsState, "builder" | "builderPending" | "builderLastAction">

async function loadState(): Promise<{ config: EnvironmentsBuilder | null; state: BuilderState | null }> {
    await environmentsDb()
    const state = await EnvironmentsState.findOne({ key: "default" }).select({ builder: 1, builderPending: 1, builderLastAction: 1 }).lean<BuilderState>()
    const parsed = state?.builder ? environmentsBuilderSchema.safeParse(state.builder) : null
    return { config: parsed?.success ? parsed.data : null, state }
}

const setState = (set: Record<string, unknown>) => EnvironmentsState.updateOne({ key: "default" }, { $set: { ...set, updatedAt: new Date() } }, { upsert: true })

async function lastAction(action: BuilderLastActionDto["action"], ok: boolean, message: string): Promise<void> {
    await setState({ builderLastAction: { action, ok, message, at: new Date() } })
}

async function readHost(name: string | null, run: HostRunner): Promise<{ parsed: ParsedBuilderStatus | null; error: string | null }> {
    try {
        const result = await run(builderStatusCommand(name), STATUS_TIMEOUT, { retryOnLost: true, quiet: true })
        if (result.exitCode !== 0) return { parsed: null, error: `O Docker do servidor não respondeu${lastLine(result.output) ? `: ${lastLine(result.output)}` : ""}` }
        return { parsed: parseBuilderStatus(result.output), error: null }
    } catch (error) {
        return { parsed: null, error: error instanceof Error ? error.message : String(error) }
    }
}

function statusOf(parsed: ParsedBuilderStatus | null): BuilderStatus {
    if (!parsed) return "unknown"
    if (!parsed.exists) return "missing"
    if (parsed.driver !== "docker-container") return "unmanageable"
    return parsed.container?.state === "running" ? "running" : "stopped"
}

/** Valores de "Gerenciar": o que o host tem hoje (nome, limites, flags) ou um builder novo do Opex. */
export function suggestedConfig(parsed: ParsedBuilderStatus | null): EnvironmentsBuilder {
    if (!parsed?.name || !parsed.exists || parsed.driver !== "docker-container") return { name: "opex-builder", memoryGb: null, cpus: null, swapGb: null, useAsDefault: true, allowNetworkHost: false }
    const applied = parsed.container ? appliedLimits(parsed.container) : { memoryGb: null, swapGb: null, cpus: null }
    return { name: parsed.name, ...applied, useAsDefault: parsed.current === parsed.name, allowNetworkHost: parsed.flags.includes(NETWORK_HOST_FLAG) }
}

function toDto(config: EnvironmentsBuilder | null, state: BuilderState | null, parsed: ParsedBuilderStatus | null, error: string | null, buildRunning: boolean): EnvironmentsBuilderDto {
    const name = config?.name ?? parsed?.name ?? null
    const applied = parsed?.exists && parsed.container ? appliedLimits(parsed.container) : null
    const last = state?.builderLastAction
    return {
        config,
        name,
        managed: Boolean(config),
        status: statusOf(parsed),
        driver: parsed?.driver ?? null,
        container: name && parsed?.exists && parsed.driver === "docker-container" ? builderContainer(name) : null,
        isHostDefault: Boolean(name && parsed?.current === name),
        applied,
        limitsDiffer: Boolean(config && applied && limitsDiffer(config, applied)),
        flags: parsed?.flags ?? [],
        unknownFlags: unknownFlags(parsed?.flags ?? []),
        usage: statusOf(parsed) === "running" ? (parsed?.usage ?? null) : null,
        host: parsed?.host ?? null,
        suggested: config ?? suggestedConfig(parsed),
        pending: state?.builderPending ? { requestedAt: new Date(state.builderPending.requestedAt).toISOString(), reason: state.builderPending.reason } : null,
        lastAction: last ? { action: last.action as BuilderLastActionDto["action"], ok: last.ok, message: last.message, at: new Date(last.at).toISOString() } : null,
        buildRunning,
        error,
        checkedAt: new Date().toISOString(),
    }
}

const buildRunningNow = () => isBuildActive().catch(() => false)

/** Estado da linha: configuração, o que o host tem (existe, rodando, limites, uso) e pendências. */
export async function getBuilderStatus(run: HostRunner = runEnvHost): Promise<EnvironmentsBuilderDto> {
    const { config, state } = await loadState()
    const [{ parsed, error }, buildRunning] = await Promise.all([readHost(config?.name ?? null, run), buildRunningNow()])
    return toDto(config, state, parsed, error, buildRunning)
}

/** Roda um comando do builder; a falha vira erro com a última linha da saída (e fica na linha). */
async function exec(action: BuilderLastActionDto["action"], command: string, timeoutMs: number, run: HostRunner, label: string): Promise<void> {
    const result = await run(command, timeoutMs, { detached: true })
    if (result.exitCode === 0) return
    const message = `Não foi possível ${label}${lastLine(result.output) ? `: ${lastLine(result.output)}` : ""}`
    await lastAction(action, false, message)
    envLog.warn({ action, exitCode: result.exitCode }, "[environments] Falha no builder do servidor")
    await publishEnvironment(null, "builder")
    throw new DomainError(502, message, "BUILDER_FAILED")
}

/** Recria na vez da fila global do build (nenhum build começa no meio) e tira a pendência. */
async function recreateNow(config: EnvironmentsBuilder, run: HostRunner, action: BuilderLastActionDto["action"]): Promise<void> {
    await runExclusiveBuild(() => exec(action, builderRecreateCommand(config), RECREATE_TIMEOUT, run, `recriar o builder ${config.name}`))
    await setState({ builderPending: null })
}

async function markPending(reason: string): Promise<void> {
    await setState({ builderPending: { requestedAt: new Date(), reason } })
}

async function audit(userId: string, acao: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria], depois: Record<string, unknown>, antes?: Record<string, unknown>): Promise<void> {
    await recordAudit({ userId, entidade: ENVIRONMENTS_AUDIT_ENTITY, entidadeId: ENTITY_ID, acao, ...(antes ? { antes } : {}), depois })
}

/**
 * Salva a configuração e aplica: builder inexistente só salva (a linha oferece Criar); nada mudou, nada
 * roda; com build em andamento, `docker update` agora e a recriação pendente; senão recria com `--keep-state`.
 */
export async function saveBuilderConfig(input: EnvironmentsBuilder, actorId: string, run: HostRunner = runEnvHost): Promise<BuilderResultDto> {
    const config = environmentsBuilderSchema.parse(input)
    const { config: before } = await loadState()
    const { parsed, error } = await readHost(config.name, run)
    if (!parsed) throw new DomainError(502, error ?? "O Docker do servidor não respondeu", "BUILDER_DOCKER_FAILED")
    if (parsed.host && config.cpus !== null && config.cpus > parsed.host.cpus) throw new DomainError(422, `O servidor tem ${parsed.host.cpus} CPUs: use até ${parsed.host.cpus}`, "BUILDER_INVALID_LIMITS")
    if (parsed.exists && parsed.driver !== "docker-container") throw new DomainError(409, `O builder "${config.name}" usa o driver ${parsed.driver ?? "desconhecido"} (sem container nem limites): escolha outro nome`, "BUILDER_UNMANAGEABLE")

    await setState({ builder: config })
    await audit(actorId, before ? AcaoAuditoria.ATUALIZAR : AcaoAuditoria.CRIAR, { acao: "configurar", ...config }, before ?? undefined)
    envLog.info({ builder: config }, "[environments] Builder do servidor configurado")

    let message: string
    if (!parsed.exists) message = `Configuração salva. O builder ${config.name} não existe: use Criar.`
    else if (!needsRecreate(config, parsed)) {
        if (config.useAsDefault && parsed.current !== config.name) await exec("configure", builderUseCommand(config), ACTION_TIMEOUT, run, `marcar ${config.name} como builder do host`)
        message = "Configuração salva (os limites já estavam aplicados)."
    } else if (await buildRunningNow()) {
        const update = builderUpdateCommand(config, cpuModeOf(parsed.container))
        if (update) await exec("configure", update, ACTION_TIMEOUT, run, `aplicar os limites em ${config.name}`)
        await markPending("Limites alterados durante um build")
        message = update
            ? "Há um build em andamento: os limites foram aplicados na hora (docker update) e a recriação com --keep-state roda quando o build terminar."
            : "Há um build em andamento: a recriação com --keep-state roda quando o build terminar."
    } else {
        await recreateNow(config, run, "configure")
        message = `Builder ${config.name} recriado com os novos limites (cache mantido).`
    }
    await lastAction("configure", true, message)
    await publishEnvironment(null, "builder")
    return { builder: await getBuilderStatus(run), message }
}

/**
 * Ação no builder configurado. Derrubar/Apagar com um build em andamento exigem `force` (o build falha);
 * Apagar exige `confirm` (perde o cache); Recriar com build em andamento fica pendente.
 */
export async function runBuilderAction(input: BuilderActionInput, actorId: string, run: HostRunner = runEnvHost): Promise<BuilderResultDto> {
    const { config } = await loadState()
    if (!config) throw new DomainError(409, "Configure o builder do servidor (Gerenciar) antes", "BUILDER_NOT_CONFIGURED")
    const { action } = input
    if (action === "delete" && !input.confirm) throw new DomainError(409, "Apagar remove o builder e todo o cache de build: confirme para continuar", "BUILDER_CONFIRM_REQUIRED")
    const building = await buildRunningNow()
    if ((action === "stop" || action === "delete") && building && !input.force)
        throw new DomainError(409, `Há um build em andamento: ${ACTION_LABELS[action]} o builder agora faz o build em curso falhar. Confirme para continuar.`, "BUILDER_BUILD_RUNNING")
    const { parsed } = await readHost(config.name, run)
    if (parsed && !parsed.exists && (action === "start" || action === "stop" || action === "recreate")) throw new DomainError(409, `O builder ${config.name} não existe: use Criar`, "BUILDER_MISSING")

    let message: string
    if (action === "recreate" && building) {
        await markPending("Recriar pedido durante um build")
        message = "Há um build em andamento: a recriação com --keep-state roda quando ele terminar."
    } else if (action === "recreate") {
        await recreateNow(config, run, "recreate")
        message = `Builder ${config.name} recriado (cache mantido).`
    } else {
        const command = action === "create" ? builderEnsureCommand(config) : action === "start" ? builderStartCommand(config) : action === "stop" ? builderStopCommand(config) : builderDeleteCommand(config)
        await exec(action, command, ACTION_TIMEOUT, run, `${ACTION_LABELS[action]} o builder ${config.name}`)
        if (action === "delete") await setState({ builderPending: null })
        message =
            action === "create"
                ? parsed?.exists
                    ? `O builder ${config.name} já existia: no ar.`
                    : `Builder ${config.name} criado com os limites salvos.`
                : action === "start"
                  ? `Builder ${config.name} no ar.`
                  : action === "stop"
                    ? `Builder ${config.name} derrubado (o cache continua).`
                    : `Builder ${config.name} apagado com o cache.`
    }
    await lastAction(action, true, message)
    await audit(actorId, action === "delete" ? AcaoAuditoria.EXCLUIR : action === "create" ? AcaoAuditoria.CRIAR : AcaoAuditoria.ATUALIZAR, { acao: action, nome: config.name, ...(input.force ? { forcado: true } : {}) })
    envLog.info({ action, name: config.name }, "[environments] Ação no builder do servidor")
    await publishEnvironment(null, "builder")
    return { builder: await getBuilderStatus(run), message }
}

/**
 * Recriação adiada por um build: roda quando nenhum build está em andamento (tick do agendador e motor
 * da fila do build). Só no processo original (as prévias das mesas não mexem no Docker do host).
 */
export async function runPendingBuilderRecreate(run: HostRunner = runEnvHost): Promise<boolean> {
    if (isPreviewInstance()) return false
    const { config, state } = await loadState()
    if (!state?.builderPending) return false
    if (!config) {
        await setState({ builderPending: null })
        return false
    }
    if (await buildRunningNow()) return false
    try {
        await recreateNow(config, run, "pending")
    } catch (error) {
        envLog.warn({ err: error }, "[environments] Falha na recriação pendente do builder do servidor")
        await setState({ builderPending: null })
        return false
    }
    const message = `Builder ${config.name} recriado depois do build (cache mantido).`
    await lastAction("pending", true, message)
    await audit("system", AcaoAuditoria.ATUALIZAR, { acao: "recriar (pendente)", nome: config.name })
    envLog.info({ name: config.name }, "[environments] Recriação pendente do builder concluída")
    await publishEnvironment(null, "builder")
    return true
}
