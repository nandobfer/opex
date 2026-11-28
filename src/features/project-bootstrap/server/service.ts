import { isValidObjectId } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import type { OpencodeFormDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"
import type { FormReplyInput, PermissionReplyInput } from "@/features/agentic/schemas"
import { asReconnectOutcome } from "@/features/agentic/reconnect"
import { isWorkbenchActive, prepareHub, publishWorkbenchEvent } from "@/features/agentic/server/hub"
import { AGENTIC_CODE_ROOT } from "@/features/agentic/constants"
import { ACTIVE_BOOTSTRAP_STATUSES, PROJECT_BOOTSTRAP_AUDIT_ENTITY, type ProjectBootstrapAction, type ProjectBootstrapStatus, type ProjectBootstrapStep } from "../constants"
import { buildBootstrapPrompt, buildCompletePrompt, buildEnvironmentChangePrompt, buildMissingPrompt, buildResumePrompt } from "../prompts"
import { repoFullName } from "../repo-name"
import type { ProjectBootstrapStartValues } from "../schemas"
import type { BootstrapPhase } from "../steps"
import { detectTechnologies, flattenDetected } from "../tech-detect"
import type { DirectoryCheckDto, ProjectBootstrapDto, ProjectBootstrapPrefillDto, ProjectBootstrapSummaryDto, RepoCheckDto } from "../types"
import { getTechCatalog } from "./catalog"
import { publishProjectBootstrap } from "./events"
import { assertBootstrapColumns, checkRepoName, initialLinkColumns } from "./github"
import { checkHostDirectory } from "./host"
import { ProjectBootstrap, type IProjectBootstrap } from "./models"
import { abortBootstrap, loadBootstrapDoc, resumeIfStale, startActivation } from "./runner"
import { projectBootstrapBlockers } from "./settings"

/**
 * Bootstrap de projeto (SOMENTE servidor): início pela etapa 1, leitura com retomada, histórico,
 * nova tentativa, cancelamento, conversa (mensagens, perguntas e permissões) e as conferências da tela.
 */

const log = loggerFor({ module: "project-bootstrap" })
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function assertId(id: string): void {
    if (!isValidObjectId(id)) throw new DomainError(404, "Bootstrap não encontrado", "BOOTSTRAP_NOT_FOUND")
}

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null)

/** "Executando" com pergunta ou permissão pendente aparece como "aguardando você". */
export function visibleStatus(doc: Pick<IProjectBootstrap, "status" | "pendingForms" | "pendingPermissions">): ProjectBootstrapStatus {
    const status = doc.status as ProjectBootstrapStatus
    if (status === "running" && (doc.pendingForms?.length || doc.pendingPermissions?.length)) return "waiting"
    return status
}

export function toBootstrapDto(doc: IProjectBootstrap): ProjectBootstrapDto {
    const id = String(doc._id)
    const created = doc.created ?? { repoUrl: null, projectId: null, centralId: null, environmentId: null, deployId: null, port: null }
    return {
        id,
        repo: doc.repo,
        owner: doc.owner,
        name: doc.name,
        visibility: doc.visibility,
        mode: doc.mode,
        branch: doc.branch,
        directory: doc.directory,
        context: doc.context,
        technologies: doc.technologies ?? [],
        entryColumnKey: doc.entryColumnKey,
        closedColumnKey: doc.closedColumnKey ?? null,
        withEnvironment: doc.withEnvironment !== false,
        step: doc.step as ProjectBootstrapStep,
        status: visibleStatus(doc),
        phase: (doc.phase as BootstrapPhase | null) ?? null,
        attempt: doc.attempt ?? 1,
        error: doc.error ?? null,
        missing: doc.missing ?? [],
        notice: doc.notice ?? null,
        sessionId: doc.sessionId ?? null,
        running: isWorkbenchActive(id),
        pendingForms: (doc.pendingForms ?? []) as OpencodeFormDto[],
        pendingPermissions: (doc.pendingPermissions ?? []) as OpencodePermissionDto[],
        reconnect: doc.reconnect ? { outcome: asReconnectOutcome(doc.reconnect.outcome) ?? "transient", message: doc.reconnect.message ?? null, at: new Date(doc.reconnect.at).toISOString() } : null,
        result: doc.result ?? null,
        created: { repoUrl: created.repoUrl ?? `https://github.com/${doc.repo}`, projectId: created.projectId ?? null, centralId: created.centralId ?? null, environmentId: created.environmentId ?? null, deployId: created.deployId ?? null, port: created.port ?? null },
        deploys: (doc.deploys ?? []).map((item) => ({ deployId: item.deployId, attempt: item.attempt, status: item.status as "running" | "success" | "failed", error: item.error ?? null, at: new Date(item.at).toISOString() })),
        usage: { costUsd: doc.usage?.costUsd ?? 0, inputTokens: doc.usage?.inputTokens ?? 0, outputTokens: doc.usage?.outputTokens ?? 0 },
        startedAt: iso(doc.startedAt) ?? new Date().toISOString(),
        updatedAt: iso(doc.updatedAt) ?? new Date().toISOString(),
        finishedAt: iso(doc.finishedAt),
    }
}

function toSummary(doc: IProjectBootstrap): ProjectBootstrapSummaryDto {
    return {
        id: String(doc._id),
        repo: doc.repo,
        step: doc.step as ProjectBootstrapStep,
        status: visibleStatus(doc),
        phase: (doc.phase as BootstrapPhase | null) ?? null,
        attempt: doc.attempt ?? 1,
        withEnvironment: doc.withEnvironment !== false,
        startedAt: iso(doc.startedAt) ?? new Date().toISOString(),
        updatedAt: iso(doc.updatedAt) ?? new Date().toISOString(),
        finishedAt: iso(doc.finishedAt),
    }
}

async function load(id: string): Promise<IProjectBootstrap> {
    assertId(id)
    return loadBootstrapDoc(id)
}

/** Lê o bootstrap e, se o trabalho em andamento se perdeu (reinício), dispara a retomada. */
export async function getProjectBootstrap(id: string): Promise<ProjectBootstrapDto> {
    const doc = await load(id)
    const resumed = await resumeIfStale(doc).catch((error: unknown) => {
        log.warn({ err: errorText(error), bootstrapId: id }, "[project-bootstrap] falha ao retomar na leitura")
        return false
    })
    return toBootstrapDto(resumed ? await load(id) : doc)
}

export async function listProjectBootstraps(options: { active?: boolean } = {}): Promise<ProjectBootstrapSummaryDto[]> {
    await dbConnect()
    const docs = (await ProjectBootstrap.find(options.active ? { status: { $in: ACTIVE_BOOTSTRAP_STATUSES } } : {})
        .sort({ startedAt: -1 })
        .limit(options.active ? 50 : 500)
        .lean()) as IProjectBootstrap[]
    return docs.map(toSummary)
}

// ── Etapa 1 ───────────────────────────────────────────────────────────────────

export async function getBootstrapPrefill(): Promise<ProjectBootstrapPrefillDto> {
    const [columns, blockers] = await Promise.all([initialLinkColumns(), projectBootstrapBlockers()])
    return { codeRoot: AGENTIC_CODE_ROOT, ...columns, blockers }
}

export async function checkBootstrapRepo(owner: string, name: string, visibility?: "private" | "public"): Promise<RepoCheckDto> {
    return checkRepoName(owner, name, { visibility })
}

export async function checkBootstrapDirectory(path: string, repo: string): Promise<DirectoryCheckDto> {
    return checkHostDirectory(path, repo)
}

/**
 * Envio da etapa 1: confere de novo no servidor o agente, o OpenCode, o token, o nome no GitHub e a
 * pasta no host; reconhece as tecnologias pelo catálogo e começa o turno do agente.
 */
export async function startProjectBootstrap(input: ProjectBootstrapStartValues, actorId: string): Promise<ProjectBootstrapDto> {
    const blockers = await projectBootstrapBlockers()
    if (blockers.length) throw new DomainError(409, blockers[0]!.message, "BOOTSTRAP_UNAVAILABLE", { blockers })
    const repo = repoFullName(input.owner, input.name)
    // Antes do provisionamento: uma coluna inexistente só apareceria na amarração, depois do turno inteiro do agente.
    await assertBootstrapColumns(input.entryColumnKey, input.closedColumnKey)
    const check = await checkRepoName(input.owner, input.name, { visibility: input.visibility })
    if (check.blocked) throw new DomainError(409, check.message, "BOOTSTRAP_REPO_BLOCKED")
    const directory = await checkHostDirectory(input.directory, repo)
    if (directory.kind === "blocked") throw new DomainError(409, `${directory.reason} ${directory.message}`, "BOOTSTRAP_DIRECTORY_BLOCKED")
    const catalog = await getTechCatalog()
    const technologies = flattenDetected(detectTechnologies(input.context, catalog.technologies, catalog.groups))
    const mode = check.state === "existing" ? "existing" : "new"
    const branch = check.defaultBranch ?? "main"
    const visibility = mode === "existing" ? (check.private === false ? "public" : "private") : input.visibility
    await dbConnect()
    // A trava `activeRepo` (índice único parcial) torna a reserva atômica: o segundo envio concorrente cai aqui.
    const createdDoc = await ProjectBootstrap.create({
            repo,
            activeRepo: repo,
            owner: input.owner,
            name: input.name,
            visibility,
            mode,
            branch,
            directory: input.directory,
            context: input.context,
            technologies,
            entryColumnKey: input.entryColumnKey,
            closedColumnKey: input.closedColumnKey,
            withEnvironment: input.withEnvironment !== false,
            step: "provision",
            status: "running",
            phase: "turn",
            attempt: 1,
            stateAt: new Date(),
            heartbeatAt: new Date(),
        }).catch((error: unknown) => {
            if ((error as { code?: number }).code === 11000) throw new DomainError(409, `Já há um bootstrap em andamento para ${repo}.`, "BOOTSTRAP_ALREADY_RUNNING")
            throw error
        })
    const doc = createdDoc.toObject() as unknown as IProjectBootstrap
    const id = String(doc._id)
    await recordAudit({
        userId: actorId,
        entidade: PROJECT_BOOTSTRAP_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.CRIAR,
        depois: { repositorio: repo, modo: mode === "new" ? "novo" : "existente", visibilidade: visibility, branch, diretorio: input.directory, comAmbiente: input.withEnvironment !== false, tecnologias: technologies.map((tech) => tech.name) },
    })
    log.info({ bootstrapId: id, repo, mode }, "[project-bootstrap] bootstrap iniciado")
    await startActivation(id, { kind: "turn", prompt: buildBootstrapPrompt({ owner: input.owner, name: input.name, context: input.context, technologies }), userText: input.context }, { previous: null })
    return toBootstrapDto(await load(id))
}

// ── Ações ─────────────────────────────────────────────────────────────────────

function assertOpen(doc: IProjectBootstrap): void {
    if (doc.status === "cancelled") throw new DomainError(409, "O bootstrap foi cancelado", "BOOTSTRAP_CANCELLED")
    if (doc.status === "done") throw new DomainError(409, "O bootstrap já foi concluído", "BOOTSTRAP_DONE")
}

/** Tentar novamente: refaz só a etapa que falhou; na etapa 2, continua a mesma conversa. */
export async function retryProjectBootstrap(id: string, actorId: string): Promise<ProjectBootstrapDto> {
    const doc = await load(id)
    assertOpen(doc)
    if (isWorkbenchActive(id)) throw new DomainError(409, "O bootstrap já está em andamento", "BOOTSTRAP_BUSY")
    if (doc.status === "running") {
        // Executando sem trabalho vivo: a retomada decide (attach ou refaz a fase).
        await resumeIfStale(doc, Number.MAX_SAFE_INTEGER)
        return toBootstrapDto(await load(id))
    }
    if (doc.step === "provision") {
        // Sem sessão, o primeiro turno nem chegou ao agente (ex.: skill ausente): recomeça pelo prompt inicial.
        const prompt = !doc.sessionId
            ? buildBootstrapPrompt({ owner: doc.owner, name: doc.name, context: doc.context, technologies: doc.technologies ?? [] })
            : doc.missing?.length
              ? buildMissingPrompt(doc.missing)
              : doc.status === "waiting"
                ? buildCompletePrompt()
                : buildResumePrompt(doc.error)
        await startActivation(id, { kind: "turn", prompt })
    } else if (doc.step === "link") await startActivation(id, { kind: "link" })
    else if (doc.step === "deploy") await startActivation(id, { kind: "deploy" })
    await recordAudit({ userId: actorId, entidade: PROJECT_BOOTSTRAP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXECUTAR, depois: { repositorio: doc.repo, acao: "tentar novamente", etapa: doc.step } })
    return toBootstrapDto(await load(id))
}

/** Cancelar: para o agente e marca como cancelado; nada do que já foi criado é apagado. */
export async function cancelProjectBootstrap(id: string, actorId: string): Promise<ProjectBootstrapDto> {
    const doc = await load(id)
    assertOpen(doc)
    await ProjectBootstrap.updateOne({ _id: doc._id }, { $set: { status: "cancelled", activeRepo: null, activationId: null, finishedAt: new Date(), pendingForms: [], pendingPermissions: [] } })
    if (doc.sessionId) {
        const { getOpencodeClient } = await import("@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client")
        const client = await getOpencodeClient().catch(() => null)
        for (const form of (doc.pendingForms ?? []) as { id?: string }[]) {
            if (form.id) await client?.session.form.cancel({ sessionID: doc.sessionId, formID: form.id }).catch(() => undefined)
        }
        // Sempre: depois de um reinício (ou em outra instância) o mapa local está vazio, mas a sessão remota pode seguir trabalhando.
        await client?.session.interrupt({ sessionID: doc.sessionId }).catch(() => undefined)
    }
    abortBootstrap(id)
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "notice", level: "warn", message: "Bootstrap cancelado pelo dono. Nada do que já foi criado foi apagado." })
    const created = doc.created ?? null
    await recordAudit({ userId: actorId, entidade: PROJECT_BOOTSTRAP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { status: doc.status }, depois: { status: "cancelado", repositorio: doc.repo, ficou: created } })
    await publishProjectBootstrap(id)
    return toBootstrapDto(await load(id))
}

/** Reconectar ao turno da etapa 2 (attach à mesma sessão, sem reenviar o prompt). */
export async function reconnectProjectBootstrap(id: string): Promise<ProjectBootstrapDto> {
    const doc = await load(id)
    assertOpen(doc)
    if (isWorkbenchActive(id)) return toBootstrapDto(doc)
    if (doc.step !== "provision" || !doc.sessionId) throw new DomainError(409, "Não há conversa do agente para reconectar: use Tentar novamente", "BOOTSTRAP_NO_SESSION")
    const { probeReconnect } = await import("@/features/agentic/server/reconnect")
    const probe = await probeReconnect(doc.sessionId, doc.turnStartedAt ? new Date(doc.turnStartedAt).getTime() : 0)
    await ProjectBootstrap.updateOne({ _id: doc._id }, { $set: { reconnect: { outcome: probe.outcome, message: probe.message, at: new Date() } } })
    if (probe.follow) await startActivation(id, { kind: "attach" }, { previous: doc.activationId ?? null })
    await publishProjectBootstrap(id)
    return toBootstrapDto(await load(id))
}

/**
 * Mensagem do dono: com o turno vivo, entra no turno em andamento; parado na etapa 2 (aguardando ou com
 * falha), abre um turno novo na mesma conversa.
 */
export async function sendProjectBootstrapMessage(id: string, text: string, actorId: string): Promise<ProjectBootstrapDto> {
    const doc = await load(id)
    assertOpen(doc)
    if (isWorkbenchActive(id)) {
        if (doc.step !== "provision" || doc.phase !== "turn") throw new DomainError(409, "O agente não está conversando agora: aguarde a etapa atual terminar", "BOOTSTRAP_NOT_IN_TURN")
        const { steerAgentTurn } = await import("@/lib/ai/opencode-run")
        const delivered = await steerAgentTurn(id, text).catch((error: unknown) => {
            throw new DomainError(502, `O OpenCode recusou a mensagem: ${errorText(error)}`, "LIVE_MESSAGE_FAILED")
        })
        if (!delivered) throw new DomainError(409, "O agente acabou de encerrar o turno: envie de novo em instantes", "TURN_NOT_RUNNING")
        publishWorkbenchEvent(id, { type: "user", text })
    } else {
        if (doc.step !== "provision") throw new DomainError(409, "A conversa com o agente é só na etapa de provisionamento", "BOOTSTRAP_NOT_IN_TURN")
        await startActivation(id, { kind: "turn", prompt: text, userText: text })
    }
    // Só o tamanho: a mensagem pode trazer uma credencial que o agente pediu (nunca segredos na auditoria).
    await recordAudit({ userId: actorId, entidade: PROJECT_BOOTSTRAP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { repositorio: doc.repo, mensagemCaracteres: text.length } })
    return toBootstrapDto(await load(id))
}

/**
 * Liga ou desliga o ambiente e deploy de um bootstrap aberto. Na etapa 2 com o turno vivo, o aviso entra no
 * turno; parada e com o resumo já entregue, a conferência roda de novo no modo novo. Na etapa 4 parada,
 * desligar conclui sem deploy (o ambiente já criado fica). Ligar de novo só na etapa 2.
 */
export async function setProjectBootstrapEnvironment(id: string, enabled: boolean, actorId: string): Promise<ProjectBootstrapDto> {
    const doc = await load(id)
    assertOpen(doc)
    const current = doc.withEnvironment !== false
    if (current === enabled) return toBootstrapDto(doc)
    if (enabled && doc.step !== "provision") throw new DomainError(409, "Ligar o ambiente só vale enquanto o agente provisiona (etapa 2)", "BOOTSTRAP_ENVIRONMENT_LOCKED")
    if (doc.step === "deploy" && doc.status === "running") throw new DomainError(409, "Há um deploy em andamento: aguarde ele terminar para mudar o ambiente", "BOOTSTRAP_ENVIRONMENT_LOCKED")
    await ProjectBootstrap.updateOne({ _id: doc._id }, { $set: { withEnvironment: enabled } })
    await recordAudit({ userId: actorId, entidade: PROJECT_BOOTSTRAP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { comAmbiente: current }, depois: { repositorio: doc.repo, comAmbiente: enabled, etapa: doc.step } })
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "notice", level: "info", message: enabled ? "Ambiente e deploy ligados pelo dono." : "Ambiente e deploy desligados pelo dono: a etapa 4 não se aplica." })
    const live = isWorkbenchActive(id)
    if (doc.step === "provision") {
        if (live && doc.phase === "turn") {
            const { steerAgentTurn } = await import("@/lib/ai/opencode-run")
            const text = buildEnvironmentChangePrompt(enabled)
            const delivered = await steerAgentTurn(id, text).catch((error: unknown) => {
                log.warn({ err: errorText(error), bootstrapId: id }, "[project-bootstrap] aviso do ambiente recusado pelo OpenCode")
                return false
            })
            if (delivered) publishWorkbenchEvent(id, { type: "user", text })
            else publishWorkbenchEvent(id, { type: "notice", level: "warn", message: "O agente não recebeu o aviso agora: a próxima tentativa já sai no modo novo." })
        } else if (!live && doc.status !== "running" && doc.result) {
            // O agente já entregou o resumo: confere de novo no modo novo (ex.: só faltavam as entregas de Docker).
            await startActivation(id, { kind: "verify" })
        }
    } else if (!enabled && !live && doc.step !== "link") {
        // Etapa 4 parada: conclui sem deploy.
        await startActivation(id, { kind: "deploy" })
    }
    await publishProjectBootstrap(id)
    return toBootstrapDto(await load(id))
}

export async function replyProjectBootstrapForm(id: string, formId: string, input: FormReplyInput): Promise<ProjectBootstrapDto> {
    const doc = await load(id)
    if (!doc.sessionId || !(doc.pendingForms as { id?: string }[]).some((item) => item.id === formId)) throw new DomainError(404, "Pergunta não encontrada (já respondida?)", "FORM_NOT_FOUND")
    const { getOpencodeClient } = await import("@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client")
    const client = await getOpencodeClient()
    if (input.cancel) await client.session.form.cancel({ sessionID: doc.sessionId, formID: formId })
    else await client.session.form.reply({ sessionID: doc.sessionId, formID: formId, answer: input.answer ?? {} })
    await prepareHub(id)
    if (input.answer && !input.cancel) {
        const summary = Object.values(input.answer)
            .map((value) => (Array.isArray(value) ? value.join(", ") : String(value)))
            .join(" · ")
        if (summary) publishWorkbenchEvent(id, { type: "user", text: summary })
    }
    publishWorkbenchEvent(id, { type: "form-closed", id: formId })
    await ProjectBootstrap.updateOne({ _id: doc._id }, { $pull: { pendingForms: { id: formId } } })
    await publishProjectBootstrap(id)
    return toBootstrapDto(await load(id))
}

export async function replyProjectBootstrapPermission(id: string, requestId: string, input: PermissionReplyInput): Promise<ProjectBootstrapDto> {
    const doc = await load(id)
    if (!doc.sessionId || !(doc.pendingPermissions as { id?: string }[]).some((item) => item.id === requestId)) throw new DomainError(404, "Pedido de permissão não encontrado (já respondido?)", "PERMISSION_NOT_FOUND")
    const { getOpencodeClient } = await import("@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client")
    const client = await getOpencodeClient()
    await client.permission.reply({ sessionID: doc.sessionId, requestID: requestId, decision: input.decision, ...(input.message ? { message: input.message } : {}) })
    await prepareHub(id)
    publishWorkbenchEvent(id, { type: "permission-replied", id: requestId, decision: input.decision })
    await ProjectBootstrap.updateOne({ _id: doc._id }, { $pull: { pendingPermissions: { id: requestId } } })
    await publishProjectBootstrap(id)
    return toBootstrapDto(await load(id))
}

export async function runProjectBootstrapAction(id: string, action: ProjectBootstrapAction, actorId: string): Promise<ProjectBootstrapDto> {
    if (action === "retry") return retryProjectBootstrap(id, actorId)
    if (action === "cancel") return cancelProjectBootstrap(id, actorId)
    return reconnectProjectBootstrap(id)
}

/** Id do bootstrap para o stream NDJSON (404 se não existir). */
export async function assertBootstrapExists(id: string): Promise<void> {
    await load(id)
}
