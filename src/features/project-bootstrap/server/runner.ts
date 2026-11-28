import { randomUUID } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { Project } from "@/lib/db/models/Project"
import { AgenticCentral } from "@/lib/db/models/Agentic"
import { loggerFor } from "@/lib/logger"
import { getLocalUser } from "@/lib/local-user"
import { DEFAULT_PROVIDER_LIMIT_POLICY, type OpencodeFormDto, type OpencodePermissionDto } from "@/lib/ai/opencode-events"
import type { WorkbenchEventPayload } from "@/features/agentic/types"
import { abortWorkbenchRun, clearWorkbenchActive, flushWorkbenchEvents, isWorkbenchActive, markWorkbenchActive, prepareHub, publishWorkbenchEvent } from "@/features/agentic/server/hub"
import { skillPermissionRules } from "@/features/opencode-resources/skill-permissions"
import { BOOTSTRAP_DEPLOY_POLL_MS, BOOTSTRAP_HEARTBEAT_MS, PROJECT_BOOTSTRAP_AUDIT_ENTITY, PROJECT_BOOTSTRAP_CONSUMPTION_ORIGIN, PROJECT_BOOTSTRAP_INSTRUCTIONS_KEY, PROJECT_BOOTSTRAP_STAGE_LABEL } from "../constants"
import { bootstrapCentralConfig, bootstrapEnvironmentInput } from "../environment-input"
import { describeMissing } from "../host-checks"
import { isBootstrapStale } from "../liveness"
import { buildBootstrapInstructions, buildDeployFailedPrompt } from "../prompts"
import { parseBootstrapResult } from "../result"
import type { BootstrapResult } from "../schemas"
import { missingSkillsMessage, resolveSkills, skillsToActivate } from "../skills"
import type { BootstrapPhase } from "../steps"
import { ensureHostDirectory, readBootstrapEnv, verifyDeliverables } from "./host"
import { ProjectBootstrap, type IProjectBootstrap } from "./models"
import { publishProjectBootstrap } from "./events"
import { loadProjectBootstrapSettings } from "./settings"

/**
 * Motor do bootstrap (SOMENTE servidor): o turno do Agente de Bootstrap numa sessão longa do OpenCode
 * no host (etapa 2), a conferência das entregas, o vínculo e a central (etapa 3) e o ambiente com o
 * deploy (etapa 4). Cada execução em segundo plano é uma **ativação** (`activationId`): só ela grava
 * no bootstrap, com batimento a cada 15 s. Cancelar troca a ativação e tudo o que ela ainda tentar
 * gravar é descartado. As etapas 3 e 4 são idempotentes: o que já foi criado fica em `created.*`.
 */

const log = loggerFor({ module: "project-bootstrap" })
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const actorId = () => getLocalUser().id

type Owned = { _id: IProjectBootstrap["_id"]; activationId: string }

interface Activation {
    id: string
    activationId: string
    controller: AbortController
    own: Owned
}

/** Próximo passo depois que a ativação termina (o deploy falhou: volta ao agente com o erro). */
interface Continuation {
    prompt: string
}

export async function loadBootstrapDoc(id: string): Promise<IProjectBootstrap> {
    await dbConnect()
    const doc = (await ProjectBootstrap.findById(id).lean()) as IProjectBootstrap | null
    if (!doc) throw new DomainError(404, "Bootstrap não encontrado", "BOOTSTRAP_NOT_FOUND")
    return doc
}

/** Grava só se a ativação ainda é a dona (cancelado ou retomado por outro processo = nada muda). */
async function setOwned(activation: Activation, set: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<boolean> {
    const result = await ProjectBootstrap.updateOne(activation.own, { $set: set, ...extra })
    await publishProjectBootstrap(activation.id)
    return result.matchedCount > 0
}

async function stillOwner(activation: Activation): Promise<boolean> {
    if (activation.controller.signal.aborted) return false
    return Boolean(await ProjectBootstrap.exists({ ...activation.own, status: "running" }))
}

async function setPhase(activation: Activation, step: string, phase: BootstrapPhase): Promise<boolean> {
    return setOwned(activation, { step, phase, error: null, missing: [], notice: null })
}

async function fail(activation: Activation, error: string, extra: Record<string, unknown> = {}): Promise<void> {
    log.warn({ bootstrapId: activation.id, error }, "[project-bootstrap] etapa falhou")
    publishWorkbenchEvent(activation.id, { type: "notice", level: "error", message: error })
    await setOwned(activation, { status: "failed", error, pendingForms: [], pendingPermissions: [], ...extra })
}

// ── Ativação ──────────────────────────────────────────────────────────────────

export type ActivationKind = { kind: "turn"; prompt: string; userText?: string | null } | { kind: "attach" } | { kind: "verify" } | { kind: "link" } | { kind: "deploy" }

/**
 * Começa uma ativação em segundo plano. `claim` (a retomada) só assume se o bootstrap ainda estiver com
 * a ativação antiga: dois processos nunca assumem o mesmo bootstrap.
 */
export async function startActivation(id: string, work: ActivationKind, claim?: { previous: string | null }): Promise<boolean> {
    if (isWorkbenchActive(id)) throw new DomainError(409, "O bootstrap já está em andamento", "BOOTSTRAP_BUSY")
    await prepareHub(id)
    const activationId = randomUUID()
    const now = new Date()
    const filter: Record<string, unknown> = { _id: id }
    if (claim) filter.activationId = claim.previous
    else filter.status = { $ne: "cancelled" }
    const turn = work.kind === "turn"
    const set: Record<string, unknown> = { status: "running", activationId, heartbeatAt: now, stateAt: now, error: null, notice: null, reconnect: null }
    if (turn || work.kind === "attach") Object.assign(set, { step: "provision", phase: "turn", missing: [] })
    if (turn) Object.assign(set, { turnStartedAt: now, pendingForms: [], pendingPermissions: [] })
    const claimed = await ProjectBootstrap.updateOne(filter, { $set: set })
    if (!claimed.matchedCount) return false
    const controller = new AbortController()
    markWorkbenchActive(id, controller)
    const doc = await loadBootstrapDoc(id)
    const activation: Activation = { id, activationId, controller, own: { _id: doc._id, activationId } }
    if (turn && work.userText) publishWorkbenchEvent(id, { type: "user", text: work.userText })
    await publishProjectBootstrap(id)
    const beat = setInterval(() => void ProjectBootstrap.updateOne(activation.own, { $set: { heartbeatAt: new Date() } }).catch(() => undefined), BOOTSTRAP_HEARTBEAT_MS)
    beat.unref?.()
    void runActivation(activation, work)
        .catch(async (error: unknown) => {
            log.error({ err: errorText(error), bootstrapId: id }, "[project-bootstrap] falha inesperada")
            await fail(activation, errorText(error)).catch(() => undefined)
            return null
        })
        .then(async (next) => {
            clearInterval(beat)
            clearWorkbenchActive(id, controller)
            await flushWorkbenchEvents(id).catch(() => undefined)
            await publishProjectBootstrap(id)
            if (next && !controller.signal.aborted) await startActivation(id, { kind: "turn", prompt: next.prompt }).catch((error: unknown) => log.error({ err: errorText(error), bootstrapId: id }, "[project-bootstrap] não foi possível voltar ao agente"))
        })
    return true
}

async function runActivation(activation: Activation, work: ActivationKind): Promise<Continuation | null> {
    if (work.kind === "turn" || work.kind === "attach") {
        const result = await runProvisionTurn(activation, work.kind === "turn" ? work.prompt : "", work.kind === "attach")
        if (!result) return null
        return afterTurn(activation, result)
    }
    if (work.kind === "verify") {
        const doc = await loadBootstrapDoc(activation.id)
        if (!doc.result) {
            await fail(activation, "O resumo final do agente não foi encontrado: use Tentar novamente para pedir ao agente que conclua.")
            return null
        }
        return afterTurn(activation, doc.result)
    }
    if (work.kind === "link") return runLinkStep(activation)
    return runDeployStep(activation)
}

// ── Etapa 2: o turno do agente ────────────────────────────────────────────────

function turnHooks(activation: Activation) {
    const own = activation.own
    const changed = () => publishProjectBootstrap(activation.id)
    const accumulated = { text: "" }
    return {
        accumulated,
        hooks: {
            onPermission: async (permission: OpencodePermissionDto) => {
                await ProjectBootstrap.updateOne(own, { $pull: { pendingPermissions: { id: permission.id } } })
                await ProjectBootstrap.updateOne(own, { $push: { pendingPermissions: permission } })
                await changed()
            },
            onPermissionClosed: async (requestId: string) => {
                await ProjectBootstrap.updateOne(own, { $pull: { pendingPermissions: { id: requestId } } })
                await changed()
            },
            onForm: async (form: OpencodeFormDto) => {
                await ProjectBootstrap.updateOne(own, { $pull: { pendingForms: { id: form.id } } })
                await ProjectBootstrap.updateOne(own, { $push: { pendingForms: form } })
                await changed()
            },
            onFormClosed: async (formId: string) => {
                await ProjectBootstrap.updateOne(own, { $pull: { pendingForms: { id: formId } } })
                await changed()
            },
            onText: (delta: string) => {
                accumulated.text += delta
            },
            onStep: async ({ costUsd, tokens }: { costUsd: number; tokens: { input: number; output: number } }) => {
                await ProjectBootstrap.updateOne(own, { $inc: { "usage.costUsd": costUsd, "usage.inputTokens": tokens.input, "usage.outputTokens": tokens.output } })
            },
            heartbeat: async () => {
                await ProjectBootstrap.updateOne(own, { $set: { heartbeatAt: new Date() } })
            },
        },
    }
}

/**
 * Sessão e skills da etapa 2: lista as skills do host no diretório da sessão (falha fechada), libera só
 * as escolhidas, (re)usa a sessão e ativa cada skill uma vez. Devolve a sessão, as skills e as instruções.
 */
async function prepareSession(activation: Activation, doc: IProjectBootstrap, attach: boolean): Promise<{ sessionId: string; instructions: string } | null> {
    const { settings } = await loadProjectBootstrapSettings()
    const [{ getOpencodeClient }, { listOpencodeSkillsAt }] = await Promise.all([import("@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client"), import("@nandobfer/integracoes/modules/integrations/ia/ai/opencode-skill-list")])
    const client = await getOpencodeClient()
    if (attach) {
        if (!doc.sessionId) {
            await fail(activation, "Este bootstrap não tem uma sessão do OpenCode para reconectar: use Tentar novamente.")
            return null
        }
        return { sessionId: doc.sessionId, instructions: "" }
    }
    await ensureHostDirectory(doc.directory)
    let hostSkills: { id: string; name: string }[]
    try {
        hostSkills = (await listOpencodeSkillsAt(client, doc.directory, { want: settings.skills })).skills.map((skill) => ({ id: skill.id, name: skill.name }))
    } catch (error) {
        await fail(activation, `Não foi possível listar as skills do OpenCode do host para preparar a sessão: ${errorText(error)}. Confira o OpenCode e use Tentar novamente.`)
        return null
    }
    const skills = resolveSkills(hostSkills, settings.skills)
    if (skills.missing.length) {
        await fail(activation, missingSkillsMessage(skills.missing))
        return null
    }
    const permissions = skillPermissionRules(hostSkills, settings.skills).rules
    let sessionId = doc.sessionId
    if (sessionId) {
        const exists = await client.session
            .get({ sessionID: sessionId })
            .then(() => true)
            .catch(() => false)
        if (!exists) {
            publishWorkbenchEvent(activation.id, { type: "notice", level: "warn", message: "A sessão anterior do OpenCode não existe mais: a conversa continua numa sessão nova." })
            sessionId = null
        } else {
            const updated = await client.session
                .update({ sessionID: sessionId, permissions })
                .then(() => true)
                .catch(() => false)
            if (!updated) log.warn({ bootstrapId: activation.id, sessionId }, "[project-bootstrap] não foi possível atualizar as permissões da sessão")
        }
    }
    if (!sessionId) {
        const session = await client.session.create({ title: `Bootstrap · ${doc.owner}/${doc.name}`.slice(0, 120), location: { directory: doc.directory }, metadata: { app: "opex", kind: "project-bootstrap", bootstrapId: activation.id }, permissions })
        sessionId = session.id
        await setOwned(activation, { sessionId, activeSkills: null })
    }
    const fresh = await loadBootstrapDoc(activation.id)
    const pending = skillsToActivate(fresh.activeSkills, sessionId, skills.found)
    const activated = fresh.activeSkills?.sessionId === sessionId ? [...fresh.activeSkills.ids] : []
    for (const skill of pending) {
        try {
            await client.session.skill({ sessionID: sessionId, id: skill.id, resume: false })
            activated.push(skill.id)
        } catch (error) {
            log.warn({ err: errorText(error), bootstrapId: activation.id, skill: skill.id }, "[project-bootstrap] não foi possível ativar a skill na sessão")
            publishWorkbenchEvent(activation.id, { type: "notice", level: "warn", message: `Não foi possível ativar a skill "${skill.name}" na sessão: o agente carrega quando precisar.` })
        }
    }
    if (pending.length) await setOwned(activation, { activeSkills: { sessionId, ids: activated } })
    const instructions = buildBootstrapInstructions({
        repo: doc.repo,
        owner: doc.owner,
        name: doc.name,
        visibility: doc.visibility,
        mode: doc.mode,
        branch: doc.branch,
        directory: doc.directory,
        context: doc.context,
        technologies: doc.technologies,
        skills: skills.found.map((skill) => skill.name),
        instructions: settings.instructions,
    })
    return { sessionId, instructions }
}

/** Roda o turno e devolve o resumo final válido; sem resumo, deixa o bootstrap aguardando o dono. */
async function runProvisionTurn(activation: Activation, prompt: string, attach: boolean): Promise<BootstrapResult | null> {
    const doc = await loadBootstrapDoc(activation.id)
    const prepared = await prepareSession(activation, doc, attach)
    if (!prepared) return null
    const { sessionId } = prepared
    const [{ getOpencodeClient }, { runAgentTurn }, { runWithFallback, fallbackNotice }] = await Promise.all([
        import("@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client"),
        import("@/lib/ai/opencode-run"),
        import("@/features/agentic/server/model-fallback"),
    ])
    const client = await getOpencodeClient()
    let body = prompt
    if (!attach) {
        const applied = await client.session.instructions.entry
            .put({ sessionID: sessionId, key: PROJECT_BOOTSTRAP_INSTRUCTIONS_KEY, value: prepared.instructions })
            .then(() => true)
            .catch((error: unknown) => {
                log.warn({ err: errorText(error), bootstrapId: activation.id }, "[project-bootstrap] instruções da sessão recusadas: vão no prompt")
                return false
            })
        if (!applied) body = `${prepared.instructions}\n\n---\n${prompt}`
    }
    const { settings } = await loadProjectBootstrapSettings()
    const { hooks, accumulated } = turnHooks(activation)
    const publish = (event: WorkbenchEventPayload) => publishWorkbenchEvent(activation.id, event)
    const startedAt = doc.turnStartedAt ? new Date(doc.turnStartedAt).getTime() : Date.now()
    const agent = { agent: settings.agent.agent, model: settings.agent.model, variant: settings.agent.variant, fallbacks: settings.agent.fallbacks ?? [] }
    log.info({ bootstrapId: activation.id, model: agent.model, attach }, `${PROJECT_BOOTSTRAP_STAGE_LABEL} ${doc.repo}: turno iniciado`)
    const result = await runWithFallback(
        agent,
        attach ? "" : body,
        (turnAgent, text) =>
            runAgentTurn(
                client,
                {
                    id: activation.id,
                    sessionId,
                    stage: PROJECT_BOOTSTRAP_STAGE_LABEL,
                    title: PROJECT_BOOTSTRAP_STAGE_LABEL,
                    agent: turnAgent,
                    text,
                    timeoutMs: settings.timeoutMinutes * 60_000,
                    signal: activation.controller.signal,
                    attach,
                    ...(attach ? { startedAt } : {}),
                    consumption: { origin: PROJECT_BOOTSTRAP_CONSUMPTION_ORIGIN, subject: activation.id },
                    providerLimit: DEFAULT_PROVIDER_LIMIT_POLICY,
                },
                { ...hooks, publish },
            ),
        {
            signal: activation.controller.signal,
            attach,
            onSwitch: (change) => {
                accumulated.text = ""
                publish({ type: "notice", level: "warn", message: `Agente de Bootstrap: ${fallbackNotice(change)}` })
            },
        },
    )
    await flushWorkbenchEvents(activation.id)
    if (!(await stillOwner(activation))) return null
    if (result.outcome !== "succeeded") {
        await fail(activation, result.message ?? "O agente não concluiu o provisionamento: use Tentar novamente para continuar a conversa.")
        return null
    }
    const parsed = parseBootstrapResult(result.text || accumulated.text)
    if (!parsed.ok && parsed.reason === "missing") {
        // O agente parou para perguntar algo (ou encerrou sem concluir): aguarda a resposta do dono.
        await setOwned(activation, { status: "waiting", pendingForms: [], pendingPermissions: [], notice: "O agente encerrou o turno sem o resumo final: responda abaixo ou use Tentar novamente para pedir que ele conclua." })
        return null
    }
    if (!parsed.ok) {
        await fail(activation, `O resumo final do agente é inválido (${parsed.detail ?? "campos inválidos"}): use Tentar novamente para pedir que ele corrija.`)
        return null
    }
    return parsed.result
}

/** Conferência no host do fim da etapa 2; com tudo entregue, segue para a amarração. */
async function afterTurn(activation: Activation, result: BootstrapResult): Promise<Continuation | null> {
    const doc = await loadBootstrapDoc(activation.id)
    // A branch é a decidida na etapa 1 (a padrão do existente ou `main`), mesmo que o agente diga outra.
    const fixed: BootstrapResult = { ...result, branch: doc.branch }
    if (!(await setOwned(activation, { step: "provision", phase: "verify", result: fixed, pendingForms: [], pendingPermissions: [], "created.port": fixed.port }))) return null
    publishWorkbenchEvent(activation.id, { type: "notice", level: "info", message: "Conferindo as entregas no host…" })
    let missing
    try {
        missing = await verifyDeliverables(doc.directory, fixed.branch, fixed.port)
    } catch (error) {
        await fail(activation, `${errorText(error)}: use Tentar novamente.`)
        return null
    }
    if (missing.length) {
        const labels = describeMissing(missing)
        publishWorkbenchEvent(activation.id, { type: "notice", level: "error", message: `Faltou: ${labels.join("; ")}` })
        await fail(activation, "A conferência no host encontrou pendências: use Tentar novamente para pedir ao agente que complete.", { missing: labels })
        return null
    }
    publishWorkbenchEvent(activation.id, { type: "notice", level: "success", message: "Entregas conferidas no host." })
    await recordAudit({ userId: actorId(), entidade: PROJECT_BOOTSTRAP_AUDIT_ENTITY, entidadeId: activation.id, acao: AcaoAuditoria.ATUALIZAR, depois: { repositorio: doc.repo, etapa: "provisionamento", porta: fixed.port, branch: fixed.branch } })
    return runLinkStep(activation)
}

// ── Etapa 3: vínculo e central ────────────────────────────────────────────────

async function runLinkStep(activation: Activation): Promise<Continuation | null> {
    if (!(await setPhase(activation, "link", "link"))) return null
    const doc = await loadBootstrapDoc(activation.id)
    if (!doc.result) {
        await fail(activation, "O resumo final do agente não foi encontrado.")
        return null
    }
    try {
        let projectId = doc.created?.projectId ?? null
        if (!projectId) {
            await dbConnect()
            // Retomada: o vínculo pode ter sido criado antes do id ser gravado.
            const existing = await Project.findOne({ repo: doc.repo }).select({ _id: 1 }).lean()
            if (existing) projectId = String(existing._id)
            else {
                const { createLink } = await import("@/features/github/server/links")
                projectId = (await createLink({ repo: doc.repo, entryColumnKey: doc.entryColumnKey, closedColumnKey: doc.closedColumnKey, enabled: true }, actorId())).id
            }
            if (!(await setOwned(activation, { "created.projectId": projectId }))) return null
        }
        if (!(await setPhase(activation, "link", "central"))) return null
        let centralId = doc.created?.centralId ?? null
        if (!centralId) {
            const existing = await AgenticCentral.findOne({ projectId }).select({ _id: 1 }).lean()
            const { createCentral, loadCentral, updateCentral } = await import("@/features/agentic/server/centrals")
            if (existing) centralId = String(existing._id)
            else {
                const project = await Project.findById(projectId).select({ name: 1 }).lean()
                centralId = (await createCentral({ projectId, projectName: project?.name ?? doc.name, sessionDirectory: doc.directory }, actorId())).id
                const { config } = await loadCentral(centralId)
                await updateCentral(centralId, bootstrapCentralConfig(config, doc.result), actorId())
            }
            if (!(await setOwned(activation, { "created.centralId": centralId }))) return null
        }
        publishWorkbenchEvent(activation.id, { type: "notice", level: "success", message: "Vínculo do GitHub e central de desenvolvimento criados." })
    } catch (error) {
        await fail(activation, `Não foi possível concluir a amarração: ${errorText(error)}`)
        return null
    }
    return runDeployStep(activation)
}

// ── Etapa 4: ambiente e deploy ────────────────────────────────────────────────

async function waitDeploy(activation: Activation, deployId: string): Promise<{ status: string; error: string | null } | null> {
    const { EnvironmentDeploy } = await import("@/features/environments/server/models")
    for (;;) {
        if (activation.controller.signal.aborted) return null
        const deploy = await EnvironmentDeploy.findById(deployId).select({ status: 1, error: 1 }).lean()
        if (!deploy) return { status: "failed", error: "O registro do deploy não existe mais" }
        if (deploy.status !== "running") return { status: deploy.status, error: deploy.error ?? null }
        await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_DEPLOY_POLL_MS))
        if (!(await stillOwner(activation))) return null
    }
}

async function runDeployStep(activation: Activation): Promise<Continuation | null> {
    if (!(await setPhase(activation, "deploy", "environment"))) return null
    const doc = await loadBootstrapDoc(activation.id)
    const centralId = doc.created?.centralId
    if (!doc.result || !centralId) {
        await fail(activation, "A central do bootstrap não foi encontrada: use Tentar novamente na amarração.")
        return null
    }
    const [{ createEnvironment, updateEnvironment, getDeploy }, { Environment }, { startDeploy }] = await Promise.all([
        import("@/features/environments/server/service"),
        import("@/features/environments/server/models"),
        import("@/features/environments/server/deploy"),
    ])
    let environmentId = doc.created?.environmentId ?? null
    let deployId: string
    try {
        const envText = await readBootstrapEnv(doc.directory)
        if (envText === null) {
            await fail(activation, "O .env do projeto não foi encontrado no host: use Tentar novamente.")
            return null
        }
        const input = bootstrapEnvironmentInput({ repoName: doc.name, centralId, result: doc.result }, envText)
        if (!environmentId) {
            const existing = await Environment.findOne({ "source.kind": "central", "source.centralId": centralId }).select({ _id: 1 }).lean()
            environmentId = existing ? String(existing._id) : String((await createEnvironment(input, actorId()))._id)
            if (!(await setOwned(activation, { "created.environmentId": environmentId }))) return null
        } else {
            // Nova volta depois de um deploy com falha: o agente pode ter mudado o `.env` ou a porta.
            const saved = await Environment.findById(environmentId).lean()
            if (saved) await updateEnvironment(environmentId, { ...input, name: saved.name, slug: saved.slug, limits: saved.limits ?? null, composeOverrides: saved.composeOverrides ?? null }, actorId())
        }
        if (!(await setPhase(activation, "deploy", "deploy"))) return null
        try {
            deployId = await startDeploy(environmentId, actorId(), { kind: "deploy", ref: doc.result.branch })
        } catch (error) {
            // Já havia um deploy deste ambiente (ex.: retomada depois de reiniciar): acompanha o último.
            if (!(error instanceof DomainError) || error.code !== "ENVIRONMENT_BUSY") throw error
            const saved = await Environment.findById(environmentId).select({ lastDeployId: 1 }).lean()
            if (!saved?.lastDeployId) throw error
            deployId = saved.lastDeployId
        }
    } catch (error) {
        await fail(activation, `Não foi possível criar o ambiente ou iniciar o deploy: ${errorText(error)}`)
        return null
    }
    const entry = { deployId, attempt: doc.attempt, status: "running", error: null, at: new Date() }
    if (!(await setOwned(activation, { "created.deployId": deployId }, { $pull: { deploys: { deployId } } }))) return null
    await ProjectBootstrap.updateOne(activation.own, { $push: { deploys: entry } })
    await publishProjectBootstrap(activation.id)
    const outcome = await waitDeploy(activation, deployId)
    if (!outcome) return null
    await ProjectBootstrap.updateOne({ ...activation.own, "deploys.deployId": deployId }, { $set: { "deploys.$.status": outcome.status === "success" ? "success" : "failed", "deploys.$.error": outcome.error } })
    if (outcome.status === "success") {
        await setOwned(activation, { status: "done", step: "done", phase: null, error: null, finishedAt: new Date() })
        await recordAudit({ userId: actorId(), entidade: PROJECT_BOOTSTRAP_AUDIT_ENTITY, entidadeId: activation.id, acao: AcaoAuditoria.ATUALIZAR, depois: { repositorio: doc.repo, concluido: true, ambiente: environmentId, deploy: deployId } })
        log.info({ bootstrapId: activation.id }, `${PROJECT_BOOTSTRAP_STAGE_LABEL} ${doc.repo}: concluído`)
        return null
    }
    // Build ou deploy com falha: volta à conversa do agente com o erro e o fim do log, sem limite de voltas.
    const logText = await getDeploy(deployId)
        .then((deploy) => deploy.log ?? "")
        .catch(() => "")
    const attempt = doc.attempt + 1
    if (!(await setOwned(activation, { attempt, step: "provision", phase: "turn", error: null }))) return null
    publishWorkbenchEvent(activation.id, { type: "notice", level: "error", message: `O deploy falhou${outcome.error ? `: ${outcome.error}` : ""}. Voltando ao agente (tentativa ${attempt}).` })
    await recordAudit({ userId: actorId(), entidade: PROJECT_BOOTSTRAP_AUDIT_ENTITY, entidadeId: activation.id, acao: AcaoAuditoria.ATUALIZAR, depois: { repositorio: doc.repo, deployFalhou: deployId, tentativa: attempt } })
    // Libera a ativação: o próximo turno abre uma ativação nova (o batimento continua contando).
    await ProjectBootstrap.updateOne(activation.own, { $set: { stateAt: new Date() } })
    return { prompt: buildDeployFailedPrompt({ attempt, error: outcome.error, log: logText }) }
}

// ── Retomada ──────────────────────────────────────────────────────────────────

/**
 * Retoma o bootstrap "executando" cujo trabalho se perdeu (o app reiniciou): na etapa 2, religa a mesma
 * sessão do OpenCode sem reenviar o prompt (attach); nas demais, refaz a fase (idempotente). Assume pela
 * ativação antiga, para dois processos nunca retomarem o mesmo bootstrap.
 */
export async function resumeIfStale(doc: IProjectBootstrap, now = Date.now()): Promise<boolean> {
    const id = String(doc._id)
    if (isWorkbenchActive(id) || !isBootstrapStale(doc, now)) return false
    const claim = { previous: doc.activationId ?? null }
    if (doc.step === "provision" && doc.phase !== "verify") {
        if (!doc.sessionId) return markLost(doc, "O turno do agente foi perdido antes de abrir a sessão: use Tentar novamente.")
        const { probeReconnect } = await import("@/features/agentic/server/reconnect")
        const probe = await probeReconnect(doc.sessionId, doc.turnStartedAt ? new Date(doc.turnStartedAt).getTime() : 0)
        if (probe.outcome === "transient") return false
        if (!probe.follow) return markLost(doc, `${probe.message ?? "O turno do agente foi perdido"} (o app reiniciou durante o turno): use Tentar novamente para continuar a conversa.`)
        return startActivation(id, { kind: "attach" }, claim)
    }
    if (doc.step === "provision") return startActivation(id, { kind: "verify" }, claim)
    if (doc.step === "link") return startActivation(id, { kind: "link" }, claim)
    if (doc.step === "deploy") return startActivation(id, { kind: "deploy" }, claim)
    return false
}

async function markLost(doc: IProjectBootstrap, error: string): Promise<boolean> {
    await ProjectBootstrap.updateOne({ _id: doc._id, activationId: doc.activationId ?? null, status: "running" }, { $set: { status: "failed", error, pendingForms: [], pendingPermissions: [] } })
    await publishProjectBootstrap(String(doc._id))
    return false
}

/** Rotina do agendador: retoma os bootstraps "executando" sem batimento recente. */
export async function resumeStaleProjectBootstraps(now = new Date()): Promise<{ resumed: number }> {
    await dbConnect()
    const docs = (await ProjectBootstrap.find({ status: "running" }).lean()) as IProjectBootstrap[]
    let resumed = 0
    for (const doc of docs) {
        const ok = await resumeIfStale(doc, now.getTime()).catch((error: unknown) => {
            log.warn({ err: errorText(error), bootstrapId: String(doc._id) }, "[project-bootstrap] falha ao retomar")
            return false
        })
        if (ok) resumed++
    }
    return { resumed }
}

/** Para o trabalho em andamento neste processo (cancelar). */
export function abortBootstrap(id: string): void {
    abortWorkbenchRun(id, "Bootstrap cancelado pelo dono")
}
