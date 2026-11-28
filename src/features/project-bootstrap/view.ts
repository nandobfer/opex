import type { ProjectBootstrapStep } from "./constants"
import { BOOTSTRAP_PHASE_LABELS, stepIndex } from "./steps"
import type { ProjectBootstrapDto } from "./types"

/**
 * O que cada painel da página do bootstrap mostra (módulo puro): o aviso da etapa (executando,
 * aguardando você, falhou) e se a etapa aceita "Tentar novamente".
 */

export interface StepNoticeView {
    tone: "running" | "waiting" | "failed" | null
    message: string | null
    retry: boolean
}

type Dto = Pick<ProjectBootstrapDto, "step" | "status" | "phase" | "error" | "notice" | "pendingForms" | "pendingPermissions" | "running">

export function stepNoticeView(bootstrap: Dto, step: ProjectBootstrapStep): StepNoticeView {
    if (bootstrap.step !== step || bootstrap.status === "done" || bootstrap.status === "cancelled") return { tone: null, message: null, retry: false }
    if (bootstrap.status === "failed") return { tone: "failed", message: bootstrap.error ?? "A etapa falhou.", retry: true }
    if (bootstrap.status === "waiting") {
        const pending = bootstrap.pendingForms.length + bootstrap.pendingPermissions.length
        if (pending) return { tone: "waiting", message: pending === 1 ? "O agente aguarda a sua resposta abaixo." : `O agente aguarda ${pending} respostas suas abaixo.`, retry: false }
        return { tone: "waiting", message: bootstrap.notice ?? "O agente aguarda você.", retry: step === "provision" }
    }
    return { tone: "running", message: bootstrap.phase ? `${BOOTSTRAP_PHASE_LABELS[bootstrap.phase]}…` : "Em andamento…", retry: false }
}

/** A conversa aceita mensagem agora (etapa 2 aberta, com o turno vivo ou parada esperando o dono). */
export function canMessage(bootstrap: Pick<ProjectBootstrapDto, "step" | "status" | "phase" | "running">): boolean {
    if (bootstrap.step !== "provision" || bootstrap.status === "done" || bootstrap.status === "cancelled") return false
    if (bootstrap.running) return bootstrap.phase === "turn"
    return bootstrap.status === "waiting" || bootstrap.status === "failed"
}

/** Etapa já passou (aberta só para leitura). */
export const isPastStep = (bootstrap: Pick<ProjectBootstrapDto, "step" | "status">, step: ProjectBootstrapStep) => bootstrap.status === "done" || stepIndex(step) < stepIndex(bootstrap.step)

export type CreatedRowState = "pending" | "running" | "done" | "failed"

type RowDto = Pick<ProjectBootstrapDto, "step" | "status" | "phase" | "created" | "deploys">

function rowState(bootstrap: RowDto, created: boolean, step: ProjectBootstrapStep, phase: string, before: boolean): CreatedRowState {
    if (created) return "done"
    if (bootstrap.step !== step || !before) return "pending"
    if (bootstrap.status === "failed") return "failed"
    return bootstrap.phase === phase && bootstrap.status === "running" ? "running" : "pending"
}

/** Estado das linhas da amarração (vínculo e central) e do ambiente/deploy. */
export function createdRows(bootstrap: RowDto) {
    const { created } = bootstrap
    const last = bootstrap.deploys.at(-1) ?? null
    const deploy: CreatedRowState = last ? (last.status === "success" ? "done" : last.status === "running" ? "running" : "failed") : bootstrap.step === "deploy" && bootstrap.phase === "deploy" && bootstrap.status === "running" ? "running" : "pending"
    return {
        link: rowState(bootstrap, Boolean(created.projectId), "link", "link", true),
        central: rowState(bootstrap, Boolean(created.centralId), "link", "central", Boolean(created.projectId)),
        environment: rowState(bootstrap, Boolean(created.environmentId), "deploy", "environment", true),
        deploy,
    }
}

/** O que o bootstrap deixou criado (resumo da conclusão e do cancelamento). */
export function createdSummary(bootstrap: Pick<ProjectBootstrapDto, "created" | "repo" | "result">): string[] {
    const items: string[] = []
    // O repositório só é certo depois do resumo final do agente (antes, pode ainda não ter sido criado).
    if (bootstrap.result || bootstrap.created.projectId) items.push(`Repositório ${bootstrap.repo}`)
    if (bootstrap.created.projectId) items.push("Vínculo do GitHub (projeto)")
    if (bootstrap.created.centralId) items.push("Central de desenvolvimento")
    if (bootstrap.created.environmentId) items.push("Ambiente")
    if (bootstrap.created.port) items.push(`Porta ${bootstrap.created.port} anotada em /home/used_ports`)
    return items
}

/** Reconectar: etapa 2 parada com falha, com sessão e sem turno vivo neste processo. */
export const canReconnect = (bootstrap: Pick<ProjectBootstrapDto, "step" | "status" | "sessionId" | "running">) => bootstrap.step === "provision" && bootstrap.status === "failed" && Boolean(bootstrap.sessionId) && !bootstrap.running
