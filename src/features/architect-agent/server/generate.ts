import { isSessionNotFoundError } from "@opencode/client"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { getOpencodeClient, runOpencodeShell, type OpencodeClient } from "@/lib/ai/opencode-client"
import { runAgentTurn, type TurnEvent, type TurnResult } from "@/lib/ai/opencode-run"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { memoryCacheNotice } from "@/features/ai/memories-prompt"
import { ADVERSARIAL_SESSION_PERMISSIONS, decidePermission } from "@/features/adversarial-agent/permission-policy"
import { fallbackNotice, runWithFallback } from "@/features/agentic/server/model-fallback"
import { loadCentral } from "@/features/agentic/server/centrals"
import { worktreePathFor } from "@/features/agentic/prompts"
import { getTask } from "@/features/tasks/server/service"
import type { TaskDetailDto } from "@/features/tasks/types"
import { ARCHITECT_AUDIT_ENTITY, ARCHITECT_CONSUMPTION_ORIGIN, ARCHITECT_INSTRUCTIONS_KEY, ARCHITECT_REPORT_MAX_CHARS, ARCHITECT_SETUP_STEP_TIMEOUT_MS, type ArchitectDepth, type ArchitectPhase } from "../constants"
import { architectGraphSchema } from "../graph"
import { parseArchitectOutput } from "../parse"
import { buildArchitectInstructions, buildDiagramPrompt, buildRepairPrompt } from "../prompt"
import { sanitizeGraph } from "../sanitize"
import { approvedPlanVersionOf } from "../plan-version"
import { publishDiagrams } from "./publish"
import { abortReasonOf, releaseDiagram } from "./registry"
import { ArchitectDiagram, architectDb, type IArchitectDiagram } from "./models"
import { loadArchitectSettings } from "./settings"

/**
 * Geração de uma versão do diagrama (SOMENTE servidor). Abre uma sessão NOVA do OpenCode, só leitura,
 * no worktree da mesa (ou na base do repositório, se o worktree ainda não existe), lê o plano, a
 * tarefa e o código e grava o grafo saneado. Roda em paralelo à mesa: nunca toca no estado dela, não
 * publica no barramento da mesa e nunca lança (falhas viram `failed` na própria versão).
 */

const log = loggerFor({ module: "architect-agent" })
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const DELETE_TIMEOUT_MS = 15_000
/** Intervalo mínimo entre os eventos de progresso no Pusher. */
const PROGRESS_THROTTLE_MS = 3_000
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

/**
 * Prazo de uma chamada de preparo: um serviço que aceita a conexão e nunca responde não pode deixar a
 * versão "gerando" para sempre. Estoura com erro (a versão vira falha e libera a mesa); `late` recebe
 * o valor que ainda chegar depois do prazo (ex.: excluir a sessão criada tarde).
 */
export async function withTimeout<T>(promise: Promise<T>, label: string, signal: AbortSignal, late?: (value: T) => void, ms = ARCHITECT_SETUP_STEP_TIMEOUT_MS): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    let onAbort: (() => void) | undefined
    const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} não respondeu em ${Math.round(ms / 1000)} s`)), ms)
        onAbort = () => reject(new Error(`${label} interrompido`))
        if (signal.aborted) onAbort()
        else signal.addEventListener("abort", onAbort, { once: true })
    })
    expired.catch(() => undefined)
    promise.then(
        (value) => {
            if (settled) late?.(value)
        },
        () => undefined,
    )
    try {
        return await Promise.race([promise, expired])
    } finally {
        settled = true
        clearTimeout(timer)
        if (onAbort) signal.removeEventListener("abort", onAbort)
    }
}

async function removeSession(client: OpencodeClient, sessionId: string): Promise<boolean> {
    try {
        await client.session.remove({ sessionID: sessionId }, { signal: AbortSignal.timeout(DELETE_TIMEOUT_MS) })
        return true
    } catch (error) {
        if (isSessionNotFoundError(error)) return true
        log.warn({ err: errorText(error), sessionId }, "[architect] falha ao excluir a sessão do OpenCode")
        return false
    }
}

/** Sessões de versões anteriores da mesa que não puderam ser excluídas: tenta de novo (melhor esforço). */
export async function retryPendingDeletions(client: OpencodeClient, workbenchId: string): Promise<void> {
    const pending = await ArchitectDiagram.find({ workbenchId, pendingSessionDeletion: { $ne: null } }, { pendingSessionDeletion: 1 }).lean()
    for (const doc of pending) {
        if (doc.pendingSessionDeletion && (await removeSession(client, doc.pendingSessionDeletion))) await ArchitectDiagram.updateOne({ _id: doc._id }, { $set: { pendingSessionDeletion: null } })
    }
}

/** Worktree da mesa quando já existe no host; senão a base do repositório (o plano descreve mudanças sobre ela). */
async function resolveDirectory(client: OpencodeClient, input: { worktreePath: string | null; centralId: string; taskCode: string }, signal: AbortSignal): Promise<{ directory: string; worktree: boolean }> {
    const { config } = await loadCentral(input.centralId)
    const worktree = input.worktreePath || worktreePathFor(config, input.taskCode)
    try {
        const probe = await runOpencodeShell(client, config.sessionDirectory, `git -C ${shellQuote(worktree)} rev-parse --is-inside-work-tree`, { timeoutMs: 15_000, signal })
        if (probe.exitCode === 0 && probe.output.includes("true")) return { directory: worktree, worktree: true }
    } catch (error) {
        log.info({ err: errorText(error), worktree }, "[architect] não foi possível conferir o worktree: lendo a base do repositório")
    }
    return { directory: config.sessionDirectory, worktree: false }
}

async function loadTaskSafe(taskId: string): Promise<TaskDetailDto | null> {
    try {
        return await getTask(taskId)
    } catch (error) {
        log.warn({ err: errorText(error), taskId }, "[architect] não foi possível ler a tarefa: o diagrama segue só com o plano")
        return null
    }
}

async function applyInstructions(client: OpencodeClient, sessionId: string, instructions: string): Promise<boolean> {
    try {
        await client.session.instructions.entry.put({ sessionID: sessionId, key: ARCHITECT_INSTRUCTIONS_KEY, value: instructions })
        return true
    } catch {
        return false
    }
}

async function memoryInstructions(client: OpencodeClient, directory: string, workbenchId: string): Promise<{ memories: string; selfMemory: boolean; notice: string | null }> {
    const { architectMemoryContext } = await import("@/features/ai/server/agent-memory-context")
    const context = await architectMemoryContext()
    const { selfMemoryEnabled } = await import("@/features/ai/server/self-memory/settings")
    let selfMemory = await selfMemoryEnabled("arquiteto")
    if (selfMemory) {
        const { ensureAgentMemoryMcp } = await import("@/features/ai/server/self-memory/mcp")
        const registered = await ensureAgentMemoryMcp(client, [directory])
        if (!registered.ok) {
            selfMemory = false
            log.warn({ workbenchId, err: registered.error }, "[architect] aprendizado autônomo indisponível nesta geração")
        }
    }
    return { memories: context.block, selfMemory, notice: memoryCacheNotice(context) }
}

/**
 * Executa a geração de uma versão já criada (`state: running`). Chamada em segundo plano por
 * `requestDiagram`/`retryDiagram`, com o controlador registrado em `registry.ts`.
 */
export async function runDiagram(diagramId: string, controller: AbortController): Promise<void> {
    const signal = controller.signal
    let client: OpencodeClient | null = null
    let sessionId: string | null = null
    let doc: IArchitectDiagram | null = null
    let lastPublish = 0
    const filter = { _id: diagramId }
    const publish = (force = false) => {
        if (!doc) return
        const now = Date.now()
        if (!force && now - lastPublish < PROGRESS_THROTTLE_MS) return
        lastPublish = now
        void publishDiagrams(doc.workbenchId, diagramId)
    }
    const setPhase = async (phase: ArchitectPhase) => {
        await ArchitectDiagram.updateOne(filter, { $set: { "progress.phase": phase } })
        publish(true)
    }
    /** Exclui a sessão ANTES de gravar o desfecho: com a versão já "falhou", o Tentar novamente não pode cruzar com esta limpeza. */
    const cleanupSession = async () => {
        if (!client || !sessionId) return
        const current = sessionId
        sessionId = null
        const removed = await removeSession(client, current)
        await ArchitectDiagram.updateOne(filter, { $set: { sessionId: null, pendingSessionDeletion: removed ? null : current } }).catch(() => undefined)
    }
    const finish = async (set: Partial<IArchitectDiagram>) => {
        await cleanupSession()
        await ArchitectDiagram.updateOne(filter, { $set: { ...set, "progress.phase": null, finishedAt: new Date() } })
        if (doc) {
            await recordAudit({
                userId: getLocalUser().id,
                entidade: ARCHITECT_AUDIT_ENTITY,
                entidadeId: diagramId,
                acao: AcaoAuditoria.ATUALIZAR,
                depois: { tarefa: doc.taskCode, versao: doc.version, plano: doc.planVersion, profundidade: doc.depth, estado: set.state, ...(set.error ? { erro: set.error } : {}) },
            })
            await publishDiagrams(doc.workbenchId, diagramId)
        }
    }
    const fail = async (message: string) => {
        const reason = abortReasonOf(diagramId)
        if (reason === "superseded") return finish({ state: "superseded", error: "Descartada: um plano mais novo foi aprovado" })
        if (signal.aborted) return finish({ state: "interrupted", error: reason === "deleted" ? "A mesa foi excluída durante a geração" : message })
        return finish({ state: "failed", error: message })
    }

    try {
        await architectDb()
        doc = await ArchitectDiagram.findById(diagramId).lean()
        if (!doc) return
        const { settings } = await loadArchitectSettings()
        const workbench = await AgenticWorkbench.findById(doc.workbenchId).lean()
        if (!workbench) return void (await fail("a mesa de trabalho não existe mais"))
        const plan = workbench.plans?.[doc.planVersion - 1]?.text
        if (!plan) return void (await fail(`o plano v${doc.planVersion} não foi encontrado na mesa`))
        client = await withTimeout(getOpencodeClient(), "O OpenCode", signal)
        const opencodeClient = client
        await withTimeout(retryPendingDeletions(opencodeClient, doc.workbenchId), "A exclusão das sessões pendentes", signal)
        const { directory, worktree } = await withTimeout(resolveDirectory(opencodeClient, { worktreePath: workbench.worktreePath, centralId: workbench.centralId, taskCode: workbench.taskCode }, signal), "A leitura da central", signal)
        await ArchitectDiagram.updateOne(filter, { $set: { directory } })
        const task = await withTimeout(loadTaskSafe(doc.taskId), "A leitura da tarefa", signal)
        const base = doc.baseDiagramId ? await ArchitectDiagram.findById(doc.baseDiagramId, { graph: 1 }).lean() : null
        const adjust = doc.feedback && base?.graph ? { graph: base.graph, feedback: doc.feedback } : null
        const memory = await withTimeout(memoryInstructions(opencodeClient, directory, doc.workbenchId), "As memórias do agente", signal)
        if (memory.notice) log.warn({ workbenchId: doc.workbenchId, diagramId }, `[architect] ${memory.notice}`)
        const instructions = buildArchitectInstructions({ instructions: settings.instructions, memories: memory.memories, selfMemory: memory.selfMemory })
        const session = await withTimeout(
            opencodeClient.session.create({
                title: `Arquiteto · ${doc.taskCode} · v${doc.version}`.slice(0, 120),
                location: { directory },
                metadata: { app: "opex", kind: "architect-diagram", workbenchId: doc.workbenchId, diagramId },
                permissions: [...ADVERSARIAL_SESSION_PERMISSIONS],
            }),
            "A criação da sessão do OpenCode",
            signal,
            // Sessão criada depois do prazo: ninguém vai usá-la.
            (late) => void removeSession(opencodeClient, late.id),
        )
        sessionId = session.id
        await ArchitectDiagram.updateOne(filter, { $set: { sessionId } })
        const applied = await withTimeout(applyInstructions(opencodeClient, sessionId, instructions), "A gravação das instruções da sessão", signal)
        const depth = doc.depth as ArchitectDepth
        const prompt = buildDiagramPrompt({ code: doc.taskCode, title: doc.taskTitle, description: task?.description ?? null, technicalSpec: task?.technicalSpec ?? null, planVersion: doc.planVersion, plan, directory, worktree, depth, adjust })
        await setPhase("reading")

        const opencode = client
        const sid = sessionId
        const current = doc
        const onEvent = (event: TurnEvent) => {
            if (event.type === "tool" && event.state === "running") {
                void ArchitectDiagram.updateOne(filter, { $inc: { "progress.tools": 1 }, $set: { "progress.lastTool": event.name.slice(0, 80) } }).then(() => publish())
            } else if (event.type === "text") {
                void ArchitectDiagram.updateOne(filter, { $set: { "progress.phase": "writing" } }).then(() => publish())
            }
        }
        const turn = (text: string, title: string): Promise<TurnResult> =>
            runWithFallback(
                settings.agent,
                text,
                (agent, body) =>
                    runAgentTurn(
                        opencode,
                        { id: `architect:${diagramId}`, sessionId: sid, stage: "architect", title, agent, text: body, timeoutMs: settings.timeoutMinutes * 60_000, signal, consumption: { origin: ARCHITECT_CONSUMPTION_ORIGIN, subject: current.workbenchId } },
                        {
                            publish: onEvent,
                            // Ninguém responde durante a geração: a política de leitura decide na hora.
                            onPermission: async (permission) => {
                                const decision = decidePermission(permission)
                                await opencode.permission.reply({ sessionID: sid, requestID: permission.id, decision, ...(decision === "reject" ? { message: "O agente arquiteto só lê o código: não altera arquivos nem roda testes, build, lint ou typecheck." } : {}) }).catch(() => undefined)
                            },
                            onForm: async (form) => {
                                await opencode.session.form.cancel({ sessionID: sid, formID: form.id }).catch(() => undefined)
                            },
                            onStep: async ({ costUsd, tokens }) => {
                                await ArchitectDiagram.updateOne(filter, { $inc: { "usage.costUsd": costUsd, "usage.inputTokens": tokens.input, "usage.outputTokens": tokens.output, "usage.reasoningTokens": tokens.reasoning } })
                            },
                        },
                    ),
                { signal, onSwitch: (change) => log.warn({ workbenchId: current.workbenchId, diagramId }, `[architect] ${fallbackNotice(change)}`) },
            )

        let result = await turn(applied ? prompt : `${instructions}\n\n---\n${prompt}`, `Agente Arquiteto · v${doc.version}`)
        if (result.outcome !== "succeeded") return void (await fail(result.message ?? "o agente não concluiu o diagrama"))
        let parsed = parseArchitectOutput(result.text)
        let repaired = false
        if (!parsed.ok) {
            log.info({ diagramId, err: parsed.error }, "[architect] resposta inválida: pedindo a correção uma vez")
            await setPhase("retrying")
            result = await turn(buildRepairPrompt(parsed.error, depth), `Agente Arquiteto · v${doc.version} (correção)`)
            if (result.outcome !== "succeeded") return void (await fail(result.message ?? "o agente não concluiu a correção do diagrama"))
            parsed = parseArchitectOutput(result.text)
            repaired = true
        }
        if (!parsed.ok) return void (await finish({ state: "failed", error: `Resposta inválida depois de uma nova tentativa: ${parsed.error}`, report: result.text.slice(-ARCHITECT_REPORT_MAX_CHARS) }))
        const sanitized = sanitizeGraph(parsed.raw, depth)
        architectGraphSchema.parse(sanitized.graph)

        // Resultado atrasado: um plano mais novo foi aprovado enquanto o agente trabalhava.
        const latest = await AgenticWorkbench.findById(doc.workbenchId, { stage: 1, plans: 1, branch: 1, approvedPlanVersion: 1 }).lean()
        const approved = latest ? approvedPlanVersionOf(latest) : null
        if (abortReasonOf(diagramId) === "superseded" || (doc.origin === "auto" && approved !== null && approved > doc.planVersion)) {
            log.info({ diagramId, planVersion: doc.planVersion, approved }, "[architect] resultado de um plano antigo descartado")
            return void (await finish({ state: "superseded", error: "Descartada: um plano mais novo foi aprovado", report: result.text.slice(-ARCHITECT_REPORT_MAX_CHARS) }))
        }
        await finish({ state: "done", graph: sanitized.graph, trimmed: sanitized.trimmed, warnings: sanitized.warnings, repaired, report: result.text.slice(-ARCHITECT_REPORT_MAX_CHARS), error: null })
        log.info({ diagramId, workbenchId: doc.workbenchId, nodes: sanitized.graph.nodes.length, edges: sanitized.graph.edges.length, trimmed: sanitized.trimmed }, `[architect] ${doc.taskCode} arquitetura v${doc.version} pronta`)
    } catch (error) {
        log.error({ err: errorText(error), diagramId }, "[architect] falha na geração")
        await fail(errorText(error)).catch(() => undefined)
    } finally {
        await cleanupSession().catch(() => undefined)
        releaseDiagram(diagramId, controller)
    }
}
