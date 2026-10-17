import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { runAgentTurn, probeAttachSession } from "@/lib/ai/opencode-run"
import { loadEnvironmentSettings } from "@/features/ai/server/settings"
import { Environment } from "@/lib/db/models/Environment"
import { EnvironmentImage } from "@/lib/db/models/EnvironmentImage"
import { EnvironmentOperation, type IEnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { EnvironmentDeployment } from "@/lib/db/models/EnvironmentDeployment"
import { EnvironmentRepoConfig } from "@/lib/db/models/EnvironmentRepoConfig"
import { IntegrationLog } from "@/lib/db/models/IntegrationLog"
import { AcaoAuditoria, recordAudit } from "@/lib/audit/record"
import { logger } from "@/lib/logger"
import { agentCheckpointSchema, type AgentResult } from "../schemas"
import {
    imageBuiltAt,
    parseAgentFailure,
    parseAgentResult,
    redact,
    restoreCompatibility,
    type EnvironmentFailureCode,
} from "../logic"
import { grantAccess, readAccessSecrets, releaseAccess, type AccessGrant } from "./credentials"
import { accessDirectoryFor, type AccessGrantInput } from "./access-registry"
import { operationPrompt, type PromptAccess } from "./prompts"
import { publishEnvironment } from "./events"
import { dispatchAndWatch } from "./github"

const running = new Set<string>()
export function isEnvironmentRunning(id: string) {
    return running.has(id)
}
export async function appendEnvironmentLog(
    environmentId: string,
    message: string,
    secrets: string[] = [],
    service?: string,
) {
    await IntegrationLog.create({
        integrationId: "ai",
        level: "info",
        message: redact(message, secrets).slice(0, 16000),
        ts: new Date(),
        data: { scope: `environment:${environmentId}`, ...(service ? { service } : {}) },
    })
}

export async function executeEnvironment(id: string, reconcile = false): Promise<void> {
    if (running.has(id)) return
    running.add(id)
    let op: (IEnvironmentOperation & { _id: unknown }) | null = null
    let access: AccessGrant | null = null
    /** Acesso usado no texto do prompt; em reconexão o texto não é enviado, mas precisa existir. */
    let promptAccess: PromptAccess | null = null
    let secretValues: string[] = []
    let failureCode: EnvironmentFailureCode | null = null
    let state: IEnvironmentOperation["state"] = "failed"
    let result: AgentResult | null = null
    let message: string | null = null
    let keepReservation = false
    let preserveAccess = false
    let mutationMayHaveStarted = reconcile
    const controller = new AbortController()
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined
    try {
        op = await EnvironmentOperation.findById(id).select("+accessPath").lean()
        if (!op) return
        heartbeatTimer = setInterval(() => {
            void EnvironmentOperation.updateOne({ _id: id }, { $set: { heartbeatAt: new Date() } }).catch(() =>
                logger.warn({ operationId: id }, "[environments] Heartbeat não persistido"),
            )
        }, 15000)
        heartbeatTimer.unref?.()
        const currentSettings = (await loadEnvironmentSettings()).settings
        const settings = op.agentSettings ?? currentSettings
        if (!currentSettings.enabled) throw new Error("Administração de sistema desativada")
        const remainingMs = reconcile
            ? settings.timeoutMinutes * 60_000
            : settings.timeoutMinutes * 60_000 - (Date.now() - (op.startedAt?.getTime() ?? Date.now()))
        if (remainingMs <= 0) throw new Error("Tempo máximo esgotado; é necessário reconciliar o host")
        deadlineTimer = setTimeout(() => controller.abort(), remainingMs)
        const env = await Environment.findById(op.environmentId).lean()
        await EnvironmentDeployment.updateOne(
            { operationId: id },
            {
                $setOnInsert: {
                    environmentId: op.environmentId,
                    previousDbVersion: env?.dbVersion ?? null,
                    result: "running",
                },
            },
            { upsert: true },
        )
        const repoConfig = await EnvironmentRepoConfig.findOne({ projectId: op.projectId }).lean()
        if (!env || env.activeOperationId !== id) throw new Error("Reserva do ambiente inválida")
        if (!reconcile && (env.revision !== op.environmentRevision || (repoConfig?.revision ?? 0) !== op.repoRevision))
            throw new Error("Configuração alterada; confirme uma nova operação")
        const client = await getOpencodeClient()
        const probe =
            reconcile && op.sessionId
                ? await probeAttachSession(
                      client,
                      op.sessionId,
                      op.turnStartedAt?.getTime() ?? op.startedAt?.getTime() ?? 0,
                  )
                : null
        if (probe?.kind === "unavailable") {
            keepReservation = true
            preserveAccess = true
            return
        }
        const attach =
            (op.phase === "action" || op.phase === "inspect") &&
            (probe?.kind === "running" || probe?.kind === "finished")
        if (!attach && probe?.kind === "running" && op.sessionId)
            await client.session.interrupt({ sessionID: op.sessionId })
        const accessContext: AccessGrantInput = {
            id,
            environmentId: op.environmentId,
            projectId: op.projectId,
            repoConfig: op.repoConfig,
            variables: op.config.variables,
        }
        // Attach reusa o acesso existente; não envia credenciais nem novo prompt à sessão.
        if (attach) {
            secretValues = await readAccessSecrets(accessContext)
            promptAccess = {
                id,
                dir: op.accessPath ?? accessDirectoryFor(settings.accessDirectory, "operation", id),
                baseUrl: settings.agentBaseUrl,
                token: "",
            }
            await EnvironmentOperation.updateOne({ _id: id }, { $set: { heartbeatAt: new Date() } })
        } else {
            access = await grantAccess(accessContext, settings, "operation")
            secretValues = access.secretValues
            promptAccess = access
            await EnvironmentOperation.updateOne(
                { _id: id },
                { $set: { accessPath: access.dir, heartbeatAt: new Date() } },
            )
        }
        let cdEvidence = ""
        if (op.method === "cd" && (!reconcile || op.cdDispatched || op.runId)) {
            mutationMayHaveStarted = true
            await EnvironmentOperation.updateOne({ _id: id }, { $set: { phase: "cd" } })
            const run = await dispatchAndWatch(op, controller.signal, reconcile)
            cdEvidence = `\nCD esperado: ${JSON.stringify(run)}. Comprove o SHA publicado no host.`
        }
        const session =
            attach && op.sessionId
                ? { id: op.sessionId }
                : await client.session.create({
                      title: `Ambientes · ${op.config.name} · ${reconcile ? "reconciliar" : op.kind}`,
                      location: { directory: settings.sessionDirectory },
                      metadata: { app: "opex", kind: "environment", operationId: id },
                  })
        await EnvironmentOperation.updateOne(
            { _id: id },
            {
                $set: {
                    sessionId: session.id,
                    stage: reconcile ? "Reconciliando host" : "Agente em execução",
                    heartbeatAt: new Date(),
                },
            },
        )
        await appendEnvironmentLog(
            op.environmentId,
            reconcile ? "Reconciliando operação sem repetir ações." : "Agente iniciado.",
        )
        await publishEnvironment(op.projectId, op.environmentId)
        const image = op.imageId ? await EnvironmentImage.findById(op.imageId).lean() : null
        if (!attach && !reconcile && op.kind !== "inspect" && op.method !== "cd") {
            await EnvironmentOperation.updateOne(
                { _id: id },
                {
                    $set: { phase: "preflight", stage: "Inspeção prévia" },
                    $push: { steps: { name: "Inspeção prévia iniciada", at: new Date() } },
                },
            )
            // Primeiro turno somente leitura: guarda imagens anteriores e revalida o banco no host.
            const preflight = await runAgentTurn(
                client,
                {
                    id,
                    sessionId: session.id,
                    stage: "environment-preflight",
                    title: op.config.name,
                    agent: settings,
                    text: operationPrompt({ ...op, kind: "inspect" }, promptAccess!, settings),
                    timeoutMs: settings.timeoutMinutes * 60_000,
                    signal: controller.signal,
                    consumption: { origin: "environments", subject: `${op.repo} · preflight` },
                },
                {
                    onForm: async (form) => {
                        await client.session.form.cancel({ sessionID: session.id, formID: form.id })
                    },
                    onPermission: async (permission) => {
                        await client.permission.reply({
                            sessionID: session.id,
                            requestID: permission.id,
                            decision: "reject",
                        })
                    },
                },
            )
            const observed = parseAgentResult(redact(preflight.text, secretValues))
            if (!observed?.verified || preflight.outcome !== "succeeded") {
                failureCode = parseAgentFailure(preflight.text) ?? "PREFLIGHT_UNVERIFIED"
                throw new Error("Preflight sem comprovação. Nenhuma publicação autorizada.")
            }
            const dbVersion = observed.databaseCertain ? observed.dbVersion : null
            await Environment.updateOne(
                { _id: op.environmentId, activeOperationId: id },
                { $set: { dbVersion, observedAt: new Date(), compose: observed.compose } },
            )
            await EnvironmentDeployment.updateOne({ operationId: id }, { $set: { previousDbVersion: dbVersion } })
            if (observed.images.length)
                await EnvironmentImage.updateOne(
                    { operationId: `${id}:before` },
                    {
                        $setOnInsert: {
                            environmentId: op.environmentId,
                            operationId: `${id}:before`,
                            images: observed.images,
                            dbVersion,
                            version: observed.images.map((x) => `${x.service}: ${x.version || x.tag}`).join(" · "),
                            builtAt: imageBuiltAt(observed.images),
                            origin: "external",
                        },
                    },
                    { upsert: true },
                )
            if (op.kind === "restore") {
                const compatibility = restoreCompatibility(dbVersion, image?.dbVersion ?? null)
                if (compatibility === "blocked" || (compatibility === "unknown" && !op.riskConfirmed))
                    throw new Error(
                        "O banco observado mudou ou não é compatível. Restauração bloqueada antes de alterar containers.",
                    )
            }
        }
        let checkpointBuffer = ""
        let checkpointCount = 0
        if (!reconcile && op.kind !== "inspect") mutationMayHaveStarted = true
        if (!attach)
            await EnvironmentOperation.updateOne(
                { _id: id },
                {
                    $set: {
                        phase: reconcile ? "reconcile" : op.kind === "inspect" ? "inspect" : "action",
                        turnStartedAt: new Date(),
                        stage: reconcile
                            ? "Reconciliando host"
                            : op.kind === "inspect"
                              ? "Inspecionando host"
                              : op.kind === "restore"
                                ? "Restaurando imagens"
                                : "Publicando",
                    },
                    $push: {
                        steps: {
                            $each: [
                                {
                                    name: reconcile
                                        ? "Reconciliação iniciada"
                                        : op.kind === "inspect"
                                          ? "Inspeção iniciada"
                                          : "Execução autorizada após inspeção",
                                    at: new Date(),
                                },
                            ],
                            $slice: -100,
                        },
                    },
                },
            )
        const turn = await runAgentTurn(
            client,
            {
                id,
                sessionId: session.id,
                stage: "environment",
                title: op.config.name,
                agent: settings,
                text:
                    operationPrompt(
                        op,
                        promptAccess!,
                        settings,
                        image?.images ?? [],
                        reconcile,
                        image?.dbVersion ?? null,
                    ) + cdEvidence,
                timeoutMs: settings.timeoutMinutes * 60_000,
                signal: controller.signal,
                attach: Boolean(attach),
                startedAt: attach ? (op.turnStartedAt?.getTime() ?? op.startedAt?.getTime()) : undefined,
                consumption: { origin: "environments", subject: `${op.repo} · ${op.config.name}` },
            },
            {
                // Não repassar inputs/outputs brutos: podem incluir arquivos e credenciais do host.
                onText: async (delta) => {
                    checkpointBuffer += delta
                    let end: number
                    while ((end = checkpointBuffer.indexOf("\n")) >= 0) {
                        const line = checkpointBuffer.slice(0, end).trim()
                        checkpointBuffer = checkpointBuffer.slice(end + 1)
                        if (!line.startsWith("OPEX_CHECKPOINT ")) continue
                        if (++checkpointCount > 200) {
                            controller.abort()
                            return
                        }
                        let raw: unknown
                        try {
                            raw = JSON.parse(redact(line.slice(16), secretValues))
                        } catch {
                            continue
                        }
                        const parsed = agentCheckpointSchema.safeParse(raw)
                        if (!parsed.success) continue
                        try {
                            const cp = parsed.data
                            const safe = {
                                ...cp,
                                evidence: cp.evidence.map((x) => redact(x, secretValues)),
                                migrations: cp.migrations.map((x) => redact(x, secretValues)),
                            }
                            const dbVersion = safe.databaseCertain ? safe.dbVersion : null
                            await EnvironmentOperation.updateOne(
                                { _id: id },
                                {
                                    $set: { stage: safe.stage, evidence: safe.evidence },
                                    $addToSet: { migrations: { $each: safe.migrations } },
                                    $push: { steps: { $each: [{ name: safe.stage, at: new Date() }], $slice: -100 } },
                                },
                            )
                            await Environment.updateOne(
                                { _id: op!.environmentId, activeOperationId: id },
                                { $set: { dbVersion, observedAt: new Date() } },
                            )
                            await EnvironmentDeployment.updateOne(
                                { operationId: id },
                                {
                                    $set: { dbVersion, evidence: safe.evidence, result: "running" },
                                    $setOnInsert: {
                                        environmentId: op!.environmentId,
                                        previousDbVersion: env.dbVersion,
                                    },
                                    $addToSet: { migrations: { $each: safe.migrations } },
                                },
                                { upsert: true },
                            )
                            await appendEnvironmentLog(op!.environmentId, `Etapa: ${safe.stage}`, access!.secretValues)
                            await publishEnvironment(op!.projectId, op!.environmentId)
                        } catch {
                            controller.abort()
                            logger.warn(
                                { operationId: id },
                                "[environments] Checkpoint não persistido; agente interrompido para reconciliação",
                            )
                        }
                    }
                    checkpointBuffer = checkpointBuffer.slice(-64000)
                },
                onPermission: async (permission) => {
                    // Sem aprovação irrestrita: configuração do agente deve autorizar o escopo administrativo.
                    await client.permission.reply({
                        sessionID: session.id,
                        requestID: permission.id,
                        decision: "reject",
                    })
                },
                onForm: async (form) => {
                    await client.session.form.cancel({ sessionID: session.id, formID: form.id })
                },
                heartbeat: async () => {
                    await EnvironmentOperation.updateOne({ _id: id }, { $set: { heartbeatAt: new Date() } })
                },
            },
        )
        result = parseAgentResult(redact(turn.text, secretValues))
        const imageSetVerified = !result
            ? false
            : op.kind === "inspect" || (reconcile && !attach)
              ? true
              : op.kind === "restore"
                ? Boolean(image?.images.length) &&
                  image!.images.length === result.images.length &&
                  image!.images.every((expected) =>
                      result!.images.some(
                          (actual) => actual.service === expected.service && actual.imageId === expected.imageId,
                      ),
                  )
                : op.config.services.every((service) => result!.images.some((actual) => actual.service === service))
        if (
            result &&
            turn.outcome === "succeeded" &&
            result.verified &&
            result.quiescent &&
            imageSetVerified &&
            (op.kind === "inspect" || result.images.length > 0)
        ) {
            state = reconcile && !attach ? "interrupted" : result.healthy ? "succeeded" : "degraded"
            if (reconcile && !attach)
                message =
                    "Host reconciliado sem repetir ações. Consulte as evidências antes de confirmar uma nova operação."
        } else {
            state = turn.outcome === "interrupted" ? "interrupted" : "failed"
            failureCode = parseAgentFailure(turn.text) ?? "AGENT_UNVERIFIED"
            message =
                "A operação terminou sem comprovação completa. Confira o estado registrado e reconcilie antes de repetir."
            // Um turno terminado não comprova que subprocessos no host pararam.
            keepReservation = mutationMayHaveStarted
        }
        if (result) {
            await Environment.updateOne(
                { _id: op.environmentId, activeOperationId: id },
                {
                    $set: {
                        dbVersion: result.databaseCertain ? result.dbVersion : null,
                        observedAt: new Date(),
                        compose: result.compose,
                    },
                },
            )
            if (result.images.length && result.verified)
                await EnvironmentImage.updateOne(
                    { operationId: id },
                    {
                        $setOnInsert: {
                            environmentId: op.environmentId,
                            operationId: id,
                            images: result.images,
                            dbVersion: result.databaseCertain ? result.dbVersion : null,
                            version: result.images.map((x) => `${x.service}: ${x.version || x.tag}`).join(" · "),
                            builtAt: imageBuiltAt(result.images),
                            origin: op.kind === "inspect" ? "external" : op.method === "cd" ? "cd" : "opex",
                        },
                    },
                    { upsert: true },
                )
            await EnvironmentOperation.updateOne(
                { _id: id },
                {
                    $set: { result, evidence: result.evidence },
                    $addToSet: { migrations: { $each: result.migrations } },
                },
            )
        }
    } catch (error) {
        message = error instanceof Error ? redact(error.message, secretValues) : "Falha ao executar agente"
        failureCode = failureCode ?? parseAgentFailure(message)
        // Só falhas ANTES da sessão permitem liberar sem inspeção do host.
        keepReservation = mutationMayHaveStarted
        const latest = op
            ? await EnvironmentOperation.findById(id)
                  .lean()
                  .catch(() => null)
            : null
        keepReservation = mutationMayHaveStarted || Boolean(latest?.runId || latest?.cdDispatched)
        logger.warn({ operationId: id }, "[environments] Operação não concluída; detalhes sanitizados no histórico")
    } finally {
        clearTimeout(deadlineTimer)
        clearInterval(heartbeatTimer)
        try {
            if (!preserveAccess) {
                releaseAccess(id)
                await EnvironmentOperation.updateOne({ _id: id }, { $set: { accessPath: null } })
            }
        } catch {
            logger.warn({ operationId: id }, "[environments] Limpeza de acesso temporário pendente")
        }
        try {
            if (op) {
                const finalState = keepReservation ? "reconciling" : state
                await EnvironmentOperation.updateOne(
                    { _id: id },
                    {
                        $set: {
                            state: finalState,
                            stage: keepReservation
                                ? "Requer reconciliação"
                                : state === "succeeded"
                                  ? "Concluído"
                                  : state === "degraded"
                                    ? "Concluído com alerta de saúde"
                                    : state === "interrupted"
                                      ? "Interrompido após reconciliação"
                                      : "Falhou",
                            error: message,
                            failureCode:
                                finalState === "failed" || finalState === "interrupted" ? failureCode : null,
                            finishedAt: keepReservation ? null : new Date(),
                        },
                    },
                )
                await EnvironmentDeployment.updateOne(
                    { operationId: id },
                    {
                        $set: {
                            result: finalState,
                            ...(result
                                ? { images: result.images, dbVersion: result.databaseCertain ? result.dbVersion : null }
                                : {}),
                        },
                        $setOnInsert: { environmentId: op.environmentId },
                    },
                    { upsert: true },
                )
                if (!keepReservation)
                    await Environment.updateOne(
                        { _id: op.environmentId, activeOperationId: id },
                        { $set: { activeOperationId: null }, $inc: { revision: 1 } },
                    )
                await recordAudit({
                    userId: op.actorId,
                    entidade: "AmbienteOperacao",
                    entidadeId: id,
                    acao: AcaoAuditoria.ATUALIZAR,
                    depois: { estado: finalState },
                })
                await publishEnvironment(op.projectId, op.environmentId)
            }
        } finally {
            running.delete(id)
            // Não aguardar o pump que iniciou este turno.
            const { pumpEnvironments } = await import("./queue")
            void pumpEnvironments().catch(() => logger.warn("[environments] Fila aguardando próximo tick"))
        }
    }
}
