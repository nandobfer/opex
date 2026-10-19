import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
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
import { agentCheckpointSchema, type AgentResult, type DbEvidence, type EnvironmentSettings } from "../schemas"
import {
    composeProject,
    imageBuiltAt,
    parseAgentResult,
    parseDbEvidence,
    redact,
    restoreCompatibility,
    verifyHostResult,
    type EnvironmentFailureCode,
} from "../logic"
import { readAccessSecrets, type AccessScope } from "./credentials"
import {
    accessDirectoryFor,
    hasAccess,
    HostError,
    inspectHost,
    removeAccess,
    writeAccess,
    type HostInspection,
    type HostTarget,
} from "./host"
import { dbVersionPrompt, operationPrompt } from "./prompts"
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

type Operation = IEnvironmentOperation & { _id: unknown }

async function mark(id: string, stage: string, phase?: string) {
    await EnvironmentOperation.updateOne(
        { _id: id },
        {
            $set: { stage, heartbeatAt: new Date(), ...(phase ? { phase } : {}) },
            $push: { steps: { $each: [{ name: stage, at: new Date() }], $slice: -100 } },
        },
    )
}

/** Grava o que o shell leu do host: Compose efetivo, imagens (por ID imutável) e, se comprovada, a versão do banco. */
async function recordObservation(
    op: Operation,
    id: string,
    facts: HostInspection,
    db: DbEvidence | null,
    imageKey: string | null,
    origin: "opex" | "cd" | "external",
) {
    const dbVersion = db?.databaseCertain ? db.dbVersion : null
    await Environment.updateOne(
        { _id: op.environmentId, activeOperationId: id },
        { $set: { observedAt: new Date(), compose: facts.compose, ...(db ? { dbVersion } : {}) } },
    )
    if (imageKey && facts.images.length)
        await EnvironmentImage.updateOne(
            { operationId: imageKey },
            {
                $setOnInsert: {
                    environmentId: op.environmentId,
                    operationId: imageKey,
                    images: facts.images,
                    dbVersion,
                    version: facts.images.map((x) => `${x.service}: ${x.version || x.tag}`).join(" · "),
                    builtAt: imageBuiltAt(facts.images),
                    origin,
                },
            },
            { upsert: true },
        )
}

function toResult(facts: HostInspection, db: DbEvidence | null, extra: Partial<AgentResult> = {}): AgentResult {
    return {
        verified: true,
        healthy: facts.healthy,
        quiescent: facts.quiescent,
        dbVersion: db?.databaseCertain ? db.dbVersion : null,
        databaseCertain: Boolean(db?.databaseCertain),
        evidence: [...facts.evidence, ...(db?.evidence.length ? db.evidence : ["Versão do banco não identificada."])].slice(0, 100),
        migrations: db?.migrations ?? [],
        images: facts.images,
        compose: facts.compose,
        ...extra,
    }
}

/**
 * Coordena uma operação de Ambientes. Leitura do host, preflight e conferência final usam o shell
 * do OpenCode (`server/host.ts`); o agente executa só a ação (publicar/restaurar) e o turno curto
 * que identifica a versão do banco. O acesso temporário é gravado no host pelo shell e removido ao
 * terminar, falhar ou interromper.
 */
export async function executeEnvironment(id: string, reconcile = false): Promise<void> {
    if (running.has(id)) return
    running.add(id)
    let op: Operation | null = null
    let client: OpencodeClient | null = null
    let settings: EnvironmentSettings | null = null
    let accessDir: string | null = null
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
        const current = op
        heartbeatTimer = setInterval(() => {
            void EnvironmentOperation.updateOne({ _id: id }, { $set: { heartbeatAt: new Date() } }).catch(() =>
                logger.warn({ operationId: id }, "[environments] Heartbeat não persistido"),
            )
        }, 15000)
        heartbeatTimer.unref?.()
        const currentSettings = (await loadEnvironmentSettings()).settings
        const conf: EnvironmentSettings = { ...currentSettings, ...(op.agentSettings ?? {}) }
        settings = conf
        if (!currentSettings.enabled) throw new Error("Administração de sistema desativada")
        const remainingMs = reconcile
            ? conf.timeoutMinutes * 60_000
            : conf.timeoutMinutes * 60_000 - (Date.now() - (op.startedAt?.getTime() ?? Date.now()))
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
        const opencode = await getOpencodeClient()
        client = opencode
        const probe =
            reconcile && op.sessionId
                ? await probeAttachSession(
                      opencode,
                      op.sessionId,
                      op.turnStartedAt?.getTime() ?? op.startedAt?.getTime() ?? 0,
                  )
                : null
        if (probe?.kind === "unavailable") {
            keepReservation = true
            preserveAccess = true
            return
        }
        // Só a ação do agente é retomada; leituras e conferências são refeitas pelo shell.
        const attach =
            op.kind !== "inspect" &&
            op.phase === "action" &&
            (probe?.kind === "running" || probe?.kind === "finished")
        if (!attach && probe?.kind === "running" && op.sessionId)
            await opencode.session.interrupt({ sessionID: op.sessionId })

        const scope: AccessScope = {
            environmentId: op.environmentId,
            projectId: op.projectId,
            repoConfig: op.repoConfig,
            variables: op.config.variables,
        }
        const dir = op.accessPath ?? accessDirectoryFor(conf, "operation", id)
        accessDir = dir
        if (attach && (await hasAccess(opencode, conf, dir))) secretValues = await readAccessSecrets(scope)
        else secretValues = (await writeAccess(opencode, conf, scope, dir)).secretValues
        await EnvironmentOperation.updateOne({ _id: id }, { $set: { accessPath: dir, heartbeatAt: new Date() } })
        const target: HostTarget = {
            mode: op.repoConfig.mode,
            directory: op.config.directory,
            composeFile: op.config.composeFile,
            project: composeProject(op.repo, op.config.slug),
            accessDir: dir,
        }
        const readHost = () => inspectHost(opencode, conf, target, secretValues, controller.signal)
        const image = op.imageId ? await EnvironmentImage.findById(op.imageId).lean() : null
        const cdResumable = op.method === "cd" && Boolean(op.cdDispatched || op.runId)

        // Reconciliação sem sessão para retomar: só observa o host, nunca repete a ação.
        if (reconcile && !attach && !cdResumable && op.kind !== "inspect") {
            await mark(id, "Reconciliando pelo host", "reconcile")
            const facts = await readHost()
            await recordObservation(op, id, facts, null, facts.quiescent ? id : null, "external")
            result = toResult(facts, null, { verified: false })
            if (facts.quiescent) {
                state = "interrupted"
                message = "Host reconciliado sem repetir ações. Consulte as evidências antes de confirmar uma nova operação."
                keepReservation = false
            } else {
                keepReservation = true
                message = "Ainda há processos de compose/build deste ambiente no host. A reserva continua até terminarem."
            }
            mutationMayHaveStarted = keepReservation
            return
        }

        const session =
            attach && op.sessionId
                ? { id: op.sessionId }
                : await opencode.session.create({
                      title: `Ambientes · ${op.config.name} · ${reconcile ? "reconciliar" : op.kind}`,
                      location: { directory: conf.sessionDirectory },
                      metadata: { app: "opex", kind: "environment", operationId: id },
                  })
        await EnvironmentOperation.updateOne({ _id: id }, { $set: { sessionId: session.id, heartbeatAt: new Date() } })
        await publishEnvironment(op.projectId, op.environmentId)

        const agentHooks = {
            onForm: async (form: { id: string }) => {
                await opencode.session.form.cancel({ sessionID: session.id, formID: form.id })
            },
            onPermission: async (permission: { id: string }) => {
                // Sem aprovação irrestrita: a configuração do agente deve autorizar o escopo administrativo.
                await opencode.permission.reply({ sessionID: session.id, requestID: permission.id, decision: "reject" })
            },
        }
        /** Turno curto e somente leitura: versão do banco. Falha aqui não derruba a operação. */
        const readDbVersion = async (facts: HostInspection): Promise<DbEvidence | null> => {
            await mark(id, "Identificando a versão do banco", "inspect")
            try {
                const turn = await runAgentTurn(
                    opencode,
                    {
                        id,
                        sessionId: session.id,
                        stage: "environment-db",
                        title: current.config.name,
                        agent: conf,
                        text: dbVersionPrompt(current, dir, conf, facts),
                        timeoutMs: Math.min(conf.timeoutMinutes, 15) * 60_000,
                        signal: controller.signal,
                        consumption: { origin: "environments", subject: `${current.repo} · versão do banco` },
                    },
                    agentHooks,
                )
                if (turn.outcome !== "succeeded") return null
                const parsed = parseDbEvidence(redact(turn.text, secretValues))
                return parsed
                    ? { ...parsed, evidence: parsed.evidence.map((item) => redact(item, secretValues)) }
                    : null
            } catch (error) {
                if (controller.signal.aborted) throw error
                return null
            }
        }

        if (op.kind === "inspect") {
            await mark(id, "Lendo o host", "inspect")
            const facts = await readHost()
            await appendEnvironmentLog(op.environmentId, "Estado do host lido pelo Opex.")
            const db = await readDbVersion(facts)
            await recordObservation(op, id, facts, db, id, "external")
            result = toResult(facts, db)
            state = facts.healthy || !facts.containers.length ? "succeeded" : "degraded"
            return
        }

        // Publicar/restaurar: preflight pelo shell (imagens anteriores por ID imutável) antes de mexer.
        let previousDb: string | null = env.dbVersion
        if (!attach && !reconcile && op.method !== "cd") {
            await mark(id, "Inspeção prévia pelo host", "preflight")
            let before: HostInspection
            try {
                before = await readHost()
            } catch (error) {
                if (error instanceof HostError && error.code !== "COMPOSE_NOT_FOUND") throw error
                if (op.kind === "restore") throw error
                // Primeira publicação: ainda não existe Compose/diretório no host.
                before = { compose: [], images: [], containers: [], healthy: false, quiescent: true, evidence: [] }
            }
            if (!before.quiescent) {
                failureCode = "PREFLIGHT_UNVERIFIED"
                throw new Error("Há processos de compose/build deste ambiente em execução no host. Nada foi alterado.")
            }
            await recordObservation(op, id, before, null, before.images.length ? `${id}:before` : null, "external")
            if (op.kind === "restore") {
                const db = await readDbVersion(before)
                previousDb = db?.databaseCertain ? db.dbVersion : null
                const compatibility = restoreCompatibility(previousDb, image?.dbVersion ?? null)
                if (compatibility === "blocked" || (compatibility === "unknown" && !op.riskConfirmed))
                    throw new Error(
                        "O banco observado mudou ou não é compatível. Restauração bloqueada antes de alterar containers.",
                    )
            }
            await EnvironmentDeployment.updateOne({ operationId: id }, { $set: { previousDbVersion: previousDb } })
            await appendEnvironmentLog(op.environmentId, "Inspeção prévia concluída; imagens anteriores registradas.")
        }

        if (!reconcile) mutationMayHaveStarted = true
        let agentResult: AgentResult | null = null
        let agentOk = true
        let turnOutcome: string = "succeeded"
        if (op.method === "cd") {
            if (!reconcile || cdResumable) {
                mutationMayHaveStarted = true
                await mark(id, reconcile ? "Retomando acompanhamento do CD" : "Disparando CD", "cd")
                await dispatchAndWatch(op, controller.signal, reconcile)
            }
        } else {
            let checkpointBuffer = ""
            let checkpointCount = 0
            if (!attach) {
                await EnvironmentOperation.updateOne({ _id: id }, { $set: { turnStartedAt: new Date() } })
                await mark(id, op.kind === "restore" ? "Restaurando imagens" : "Publicando", "action")
            }
            await appendEnvironmentLog(op.environmentId, attach ? "Retomando o agente." : "Agente iniciado.")
            const turn = await runAgentTurn(
                opencode,
                {
                    id,
                    sessionId: session.id,
                    stage: "environment",
                    title: op.config.name,
                    agent: conf,
                    text: operationPrompt(op, dir, conf, null, image?.images ?? [], reconcile, image?.dbVersion ?? null),
                    timeoutMs: conf.timeoutMinutes * 60_000,
                    signal: controller.signal,
                    attach,
                    startedAt: attach ? (op.turnStartedAt?.getTime() ?? op.startedAt?.getTime()) : undefined,
                    consumption: { origin: "environments", subject: `${op.repo} · ${op.config.name}` },
                },
                {
                    ...agentHooks,
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
                                    { _id: current.environmentId, activeOperationId: id },
                                    { $set: { dbVersion, observedAt: new Date() } },
                                )
                                await EnvironmentDeployment.updateOne(
                                    { operationId: id },
                                    {
                                        $set: { dbVersion, evidence: safe.evidence, result: "running" },
                                        $setOnInsert: { environmentId: current.environmentId, previousDbVersion: previousDb },
                                        $addToSet: { migrations: { $each: safe.migrations } },
                                    },
                                    { upsert: true },
                                )
                                await appendEnvironmentLog(current.environmentId, `Etapa: ${safe.stage}`, secretValues)
                                await publishEnvironment(current.projectId, current.environmentId)
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
                    heartbeat: async () => {
                        await EnvironmentOperation.updateOne({ _id: id }, { $set: { heartbeatAt: new Date() } })
                    },
                },
            )
            turnOutcome = turn.outcome
            agentResult = parseAgentResult(redact(turn.text, secretValues))
            agentOk = Boolean(agentResult && turn.outcome === "succeeded" && agentResult.verified)
            // Turno terminado sem sucesso: a sessão não pode seguir mexendo no host durante a conferência.
            if (turn.outcome !== "succeeded") await opencode.session.interrupt({ sessionID: session.id }).catch(() => undefined)
        }

        // Conferência independente do texto do agente: containers e imagens esperados no host.
        await mark(id, "Conferindo o resultado no host", "verify")
        const after = await readHost()
        const proven = verifyHostResult(op.kind === "restore" ? "restore" : "publish", after, {
            services: op.config.services,
            images: image?.images,
            since: op.method === "cd" ? (op.cdRequestedAt ?? op.startedAt ?? null) : null,
        })
        const db: DbEvidence | null =
            op.method === "cd"
                ? await readDbVersion(after)
                : agentResult
                  ? {
                        dbVersion: agentResult.dbVersion,
                        databaseCertain: agentResult.databaseCertain,
                        migrations: agentResult.migrations,
                        evidence: agentResult.evidence,
                    }
                  : null
        const quiescent = after.quiescent && (agentResult?.quiescent ?? true)
        result = toResult(after, db, {
            verified: proven && agentOk,
            healthy: after.healthy && (agentResult?.healthy ?? true),
            quiescent,
        })
        await recordObservation(op, id, after, db, proven && agentOk ? id : null, op.method === "cd" ? "cd" : "opex")
        if (proven && agentOk && quiescent) {
            state = result.healthy ? "succeeded" : "degraded"
        } else {
            state = turnOutcome === "interrupted" ? "interrupted" : "failed"
            failureCode = agentOk ? "RESULT_UNVERIFIED" : "AGENT_UNVERIFIED"
            message = agentOk
                ? "O agente concluiu, mas o host não mostra os containers esperados de pé."
                : "O agente não comprovou a conclusão da operação."
            // O host confirmou que nada mais roda neste projeto: a reserva pode ser liberada.
            keepReservation = !quiescent
            mutationMayHaveStarted = keepReservation
        }
    } catch (error) {
        message = error instanceof Error ? redact(error.message, secretValues) : "Falha ao executar agente"
        if (error instanceof HostError) failureCode = error.code
        const latest = op
            ? await EnvironmentOperation.findById(id)
                  .lean()
                  .catch(() => null)
            : null
        // Sem leitura do host depois de uma possível mutação, a reserva fica até a reconciliação.
        keepReservation = mutationMayHaveStarted || Boolean(latest?.runId || latest?.cdDispatched)
        logger.warn({ operationId: id }, "[environments] Operação não concluída; detalhes sanitizados no histórico")
    } finally {
        clearTimeout(deadlineTimer)
        clearInterval(heartbeatTimer)
        let accessRemoved = false
        if (!preserveAccess && client && settings && accessDir) {
            try {
                await removeAccess(client, settings, accessDir)
                accessRemoved = true
            } catch {
                logger.warn({ operationId: id }, "[environments] Limpeza do acesso temporário pendente")
            }
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
                            failureCode: finalState === "failed" || finalState === "interrupted" ? failureCode : null,
                            finishedAt: keepReservation ? null : new Date(),
                            ...(accessRemoved ? { accessPath: null } : {}),
                            ...(result ? { result, evidence: result.evidence } : {}),
                        },
                        // Migrações comprovadas por checkpoint nunca são perdidas.
                        ...(result ? { $addToSet: { migrations: { $each: result.migrations } } } : {}),
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
