import { PREVIEW_PORT_MAX, PREVIEW_PORT_MIN, RUNNING_STAGES, type AgentRole, type RunState, type WorkbenchStage } from "./constants"
import type { TaskAgenticFlow } from "@/features/tasks/constants"
import { centralConfigSchema, defaultCentralConfig, type AgentConfig, type AgenticSettings, type CentralConfig } from "./schemas"

/** Regras puras do desenvolvimento agêntico (cliente e servidor). */

/** Fluxo da mesa salvo (tarefa/mesa) → valor conhecido; qualquer registro antigo cai em `preview`. */
export const asAgenticFlow = (value: string | null | undefined): TaskAgenticFlow => (value === "auto_pr" ? "auto_pr" : "preview")

/**
 * Agente efetivo de uma etapa: o override da central vale campo a campo (agente vazio usa o
 * agente padrão; modelo vazio usa o modelo e a variante padrão).
 */
export function resolveAgent(settings: AgenticSettings, central: Pick<CentralConfig, "agents">, role: AgentRole): AgentConfig {
    const base = settings.agents[role]
    const override = central.agents[role]
    if (!override) return base
    return {
        agent: override.agent || base.agent,
        model: override.model || base.model,
        variant: override.model ? override.variant : base.variant,
    }
}

/** Configuração salva → validada; campos ausentes (versões antigas) caem nos padrões. */
export function parseCentralConfig(raw: unknown, sessionDirectory = "/"): CentralConfig {
    const value = typeof raw === "object" && raw !== null ? (raw as Partial<CentralConfig>) : {}
    const directory = typeof value.sessionDirectory === "string" && value.sessionDirectory.trim() ? value.sessionDirectory : sessionDirectory
    const base = defaultCentralConfig(directory)
    const merged = {
        ...base,
        ...value,
        worktreeRoot: value.worktreeRoot?.trim() ? value.worktreeRoot : base.worktreeRoot,
        agents: { ...base.agents, ...value.agents },
        git: { ...base.git, ...value.git },
        environment: { ...base.environment, ...value.environment },
        columns: { ...base.columns, ...value.columns },
        cleanup: { ...base.cleanup, ...value.cleanup },
        include: { ...base.include, ...value.include },
        instructions: { ...base.instructions, ...value.instructions },
    }
    const parsed = centralConfigSchema.safeParse(merged)
    return parsed.success ? parsed.data : base
}

/** Diretório das sessões sugerido para um projeto (repositório): `<raiz>/<nome-do-repositório>`. */
export function defaultSessionDirectory(codeRoot: string, projectName: string): string {
    return `${codeRoot.replace(/\/+$/, "")}/${projectName.trim()}`
}

/**
 * Coluna de destino ao reabrir a mesa concluída: a mesma "Ao abrir a mesa" (desenvolvimento) e,
 * quando a central não a define, a coluna de entrada do vínculo — assim a tarefa sai da coluna de
 * conclusão e a issue é reaberta (`null` = não mover).
 */
export function reopenTargetColumn(config: CentralConfig, entryColumnKey: string | null): string | null {
    return config.columns.onStart ?? entryColumnKey ?? null
}

/** Menor porta livre da faixa (`null` = faixa esgotada). */
export function pickPreviewPort(used: Iterable<number>, min = PREVIEW_PORT_MIN, max = PREVIEW_PORT_MAX): number | null {
    const taken = new Set(used)
    for (let port = min; port <= max; port++) if (!taken.has(port)) return port
    return null
}

/**
 * Pré-requisitos do merge automático informados pelo GitHub. `mergeable_state` é o estado de
 * verificações/revisões (`clean`, `blocked`, `unstable`, `dirty`, `unknown`…).
 */
export interface PrMergeState {
    mergeable?: boolean | null
    mergeableState?: string | null
    draft?: boolean | null
}

/**
 * PR pronto para o merge automático: sem conflito (`mergeable: true`), fora do rascunho e sem
 * bloqueios pendentes (`blocked`/`unstable`) nem base desatualizada em relação às regras. Estados
 * `null` (GitHub calculando) e de bloqueio não autorizam o merge.
 */
export function prMergeReady(pr: PrMergeState): boolean {
    if (pr.draft) return false
    if (pr.mergeable !== true) return false
    return pr.mergeableState === "clean" || pr.mergeableState === "behind" || pr.mergeableState === "has_hooks"
}

export type WorkbenchAction =
    | "revise-plan"
    | "implement"
    | "request-correction"
    | "approve"
    | "submit-pr-feedback"
    | "reopen"
    | "reconnect"
    | "retry"
    | "interrupt"
    | "open-preview"

/**
 * Ações disponíveis na mesa (os botões da tela e a guarda das rotas usam a mesma regra).
 * `hasSession` controla a oferta de **Reconectar** (só faz sentido com uma sessão do OpenCode já criada).
 */
export function workbenchActions(stage: WorkbenchStage, runState: RunState, hasPreview: boolean, hasSession = true): WorkbenchAction[] {
    if (runState === "running") return ["interrupt"]
    if (runState === "failed" || runState === "interrupted") {
        if (!RUNNING_STAGES.includes(stage)) return []
        const reconnect: WorkbenchAction[] = hasSession ? ["reconnect"] : []
        // Falha depois do plano: reconectar (sem reenviar), tentar de novo ou voltar ao planejamento com uma correção.
        // Merge e exclusão da branch remota não têm "voltar ao planejamento": só reconectar e tentar de novo.
        if (stage === "planning" || stage === "finishing" || stage === "merging_pr" || stage === "deleting_pr_branch") return [...reconnect, "retry"]
        return [...reconnect, "retry", "request-correction"]
    }
    switch (stage) {
        case "plan_review":
            return ["implement", "revise-plan"]
        case "preview":
            return hasPreview ? ["open-preview", "request-correction", "approve"] : ["request-correction", "approve"]
        case "changes_requested":
            return ["submit-pr-feedback"]
        case "done":
            return ["reopen"]
        default:
            return []
    }
}

export const canRun = (stage: WorkbenchStage, runState: RunState, action: WorkbenchAction) => workbenchActions(stage, runState, true).includes(action)

/** Tom do destaque de uma mesa em andamento: executando (verde), falhou (destructive) ou espera (warning). */
export type WorkbenchProgressTone = "running" | "waiting" | "failed"

export function workbenchProgressTone(input: { running: boolean; runState: RunState }): WorkbenchProgressTone {
    if (input.running) return "running"
    return input.runState === "failed" ? "failed" : "waiting"
}

/**
 * Motivo (pt-BR) pelo qual a mesa não está executando — o que ela aguarda do usuário (ou o que
 * precisa de ação, em falha/interrupção). `null` quando o agente está trabalhando (período ativo).
 * Falha/interrupção vêm antes das pendências: uma mesa reconciliada não deve exibir pedido obsoleto.
 */
export function workbenchWaitingReason(input: { stage: WorkbenchStage; runState: RunState; pendingPermissions: number; pendingForms: number }): string | null {
    const { stage, runState, pendingPermissions, pendingForms } = input
    if (runState === "running" && pendingPermissions === 0 && pendingForms === 0) return null
    if (runState === "failed") return "A etapa falhou — use Tentar novamente"
    if (runState === "interrupted") return "Execução interrompida — use Tentar novamente"
    if (pendingPermissions > 0) return "Aguardando você permitir uma ação"
    if (pendingForms > 0) return "Aguardando você responder uma pergunta"
    switch (stage) {
        case "plan_review":
            return "Aguardando revisão do plano"
        case "preview":
            return "Aguardando aprovação da prévia"
        case "pr_open":
            return "Aguardando comentário (@opex), revisão ou merge do PR"
        case "changes_requested":
            return "Aguardando descrever as mudanças"
        default:
            return "Aguardando você"
    }
}

/**
 * Motivo (pt-BR) pelo qual a mesa aguarda o **usuário** na lista da Central de desenvolvimento;
 * `null` quando o agente trabalha, aguarda a vez do build (`build_queued`) ou a mesa concluiu
 * (`done`). É o recorte de `workbenchWaitingReason` para o item da lista de tarefas/mesas.
 */
export function workbenchUserWaitReason(input: { stage: WorkbenchStage; runState: RunState; pendingPermissions: number; pendingForms: number }): string | null {
    if (input.stage === "done" || input.stage === "build_queued") return null
    return workbenchWaitingReason(input)
}
