import { PREVIEW_PORT_MAX, PREVIEW_PORT_MIN, RUNNING_STAGES, type AgentRole, type RunState, type WorkbenchStage } from "./constants"
import type { TaskAgenticFlow } from "@/features/tasks/constants"
import { centralConfigSchema, DEFAULT_AGENTIC_CI, defaultCentralConfig, type AgentConfig, type AgenticCi, type AgenticColumns, type AgenticSettings, type CentralConfig } from "./schemas"

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
    if (!override) return { ...base, fallbacks: base.fallbacks ?? [] }
    return {
        agent: override.agent || base.agent,
        model: override.model || base.model,
        variant: override.model ? override.variant : base.variant,
        // Fallback da central: ausente herda o padrão; `[]` = sem fallback; lista substitui o padrão.
        fallbacks: override.fallbacks ?? base.fallbacks ?? [],
    }
}

/**
 * Corrente de modelos de um turno: o principal (modelo do papel ou o trocado na mesa/fork; `null` =
 * modelo padrão do agente) seguido dos fallbacks, sem repetidos. O agente é o mesmo em todos.
 */
export function modelChain(agent: AgentConfig): AgentConfig[] {
    const chain: AgentConfig[] = [{ agent: agent.agent, model: agent.model, variant: agent.variant }]
    for (const item of agent.fallbacks ?? []) {
        if (chain.some((entry) => entry.model === item.model && (entry.variant ?? null) === (item.variant ?? null))) continue
        chain.push({ agent: agent.agent, model: item.model, variant: item.variant ?? null })
    }
    return chain
}

/** Modelo/variante trocados na mesa ou no fork (o agente continua o da etapa ou do Mode). */
export interface ModelOverride {
    model: string
    variant: string | null
}

/** Troca salva → válida (`null` quando ausente ou sem modelo). */
export function asModelOverride(value: unknown): ModelOverride | null {
    if (!value || typeof value !== "object") return null
    const { model, variant } = value as { model?: unknown; variant?: unknown }
    if (typeof model !== "string" || !model) return null
    return { model, variant: typeof variant === "string" && variant ? variant : null }
}

/** Agente do turno com a troca de modelo aplicada: substitui modelo e variante e mantém o agente. */
export function applyModelOverride(agent: AgentConfig, override: ModelOverride | null | undefined): AgentConfig {
    return override?.model ? { ...agent, model: override.model, variant: override.variant } : agent
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
        // Correção de CI: central sem valor próprio (anterior à OPE-81) herda o padrão global.
        git: { ...base.git, ...value.git, inheritCi: typeof value.git?.inheritCi === "boolean" ? value.git.inheritCi : value.git?.fixCi === undefined },
        environment: { ...base.environment, ...value.environment },
        // Colunas: valores salvos são preservados como personalização (centrais antigas continuam como
        // estão); só o que foi explicitamente salvo herda o padrão global (`inheritQueue`/`inheritMovement`).
        columns: {
            inheritQueue: value.columns?.inheritQueue === true,
            inheritMovement: value.columns?.inheritMovement === true,
            queue: value.columns?.queue ?? null,
            onStart: value.columns?.onStart ?? null,
            onPr: value.columns?.onPr ?? null,
            onDone: value.columns?.onDone ?? null,
        },
        cleanup: { ...base.cleanup, ...value.cleanup },
        include: { ...base.include, ...value.include },
        forks: { ...base.forks, ...value.forks },
        instructions: { ...base.instructions, ...value.instructions },
    }
    const parsed = centralConfigSchema.safeParse(merged)
    return parsed.success ? parsed.data : base
}

/** Chat durante a execução efetivo: a central liga/desliga só nela ou segue o padrão global. */
export function resolveLiveChat(settings: Pick<AgenticSettings, "liveChat">, central: Pick<CentralConfig, "liveChat">): boolean {
    if (central.liveChat === "on") return true
    if (central.liveChat === "off") return false
    return settings.liveChat === true
}

/** Diretório das sessões sugerido para um projeto (repositório): `<raiz>/<nome-do-repositório>`. */
export function defaultSessionDirectory(codeRoot: string, projectName: string): string {
    return `${codeRoot.replace(/\/+$/, "")}/${projectName.trim()}`
}

/**
 * Coluna de destino ao reabrir a mesa concluída: a mesma "Ao abrir a mesa" (desenvolvimento) e,
 * quando a central não a define, a coluna de entrada do vínculo — assim a tarefa sai da coluna de
 * conclusão e a issue é reaberta (`null` = não mover). Recebe as colunas **efetivas** (herdadas ou
 * personalizadas).
 */
export function reopenTargetColumn(columns: { onStart: string | null }, entryColumnKey: string | null): string | null {
    return columns.onStart ?? entryColumnKey ?? null
}

/** Colunas efetivas da central: o que ela não personaliza (`inherit*`) vem do padrão global da aba. */
export function resolveCentralColumns(global: AgenticColumns | undefined, columns: CentralConfig["columns"]): AgenticColumns {
    const fallback: AgenticColumns = {
        queue: global?.queue ?? null,
        onStart: global?.onStart ?? null,
        onPr: global?.onPr ?? null,
        onDone: global?.onDone ?? null,
    }
    return {
        queue: columns.inheritQueue ? fallback.queue : columns.queue,
        onStart: columns.inheritMovement ? fallback.onStart : columns.onStart,
        onPr: columns.inheritMovement ? fallback.onPr : columns.onPr,
        onDone: columns.inheritMovement ? fallback.onDone : columns.onDone,
    }
}

/** Correção de CI efetiva da central: herdada do padrão global da aba (`inheritCi`) ou personalizada. */
export function resolveCentralCi(global: AgenticCi | undefined, git: Pick<CentralConfig["git"], "inheritCi" | "fixCi" | "ciFixLimit">): AgenticCi {
    if (git.inheritCi) return { ...DEFAULT_AGENTIC_CI, ...global }
    return { fixCi: git.fixCi, ciFixLimit: git.ciFixLimit }
}

/**
 * Fluxo efetivo das mesas novas: a escolha explícita da tarefa sempre vence; sem ela, o padrão da
 * central (`environment.publishPreview` ligado = `preview`, desligado = `auto_pr`).
 */
export function resolveCentralFlow(publishPreview: boolean, taskFlow: TaskAgenticFlow | null | undefined): TaskAgenticFlow {
    return taskFlow ?? (publishPreview ? "preview" : "auto_pr")
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
    | "cancel-wait"
    /** Agente Adversário: corrigir os bloqueios, seguir mesmo assim ou revisar de novo. */
    | "adversarial-fix"
    | "adversarial-skip"
    | "adversarial-rerun"

/**
 * Ações disponíveis na mesa (os botões da tela e a guarda das rotas usam a mesma regra).
 * `hasSession` controla a oferta de **Reconectar** (só faz sentido com uma sessão do OpenCode já criada).
 * `waitingSlot`: a mesa aguarda vaga no limite da central — só é possível cancelar a espera.
 */
export function workbenchActions(stage: WorkbenchStage, runState: RunState, hasPreview: boolean, hasSession = true, waitingSlot = false): WorkbenchAction[] {
    if (waitingSlot) return ["cancel-wait"]
    if (runState === "running") return ["interrupt"]
    if (runState === "failed" || runState === "interrupted") {
        if (!RUNNING_STAGES.includes(stage)) return []
        // A revisão adversária roda numa sessão própria (já excluída): sem reconectar; refaz a rodada ou segue sem ela.
        if (stage === "adversarial_review") return ["retry", "adversarial-skip", "request-correction"]
        const reconnect: WorkbenchAction[] = hasSession ? ["reconnect"] : []
        // Falha depois do plano: reconectar (sem reenviar), tentar de novo ou voltar ao planejamento com uma correção.
        // Merge e exclusão da branch remota não têm "voltar ao planejamento": só reconectar e tentar de novo.
        if (stage === "planning" || stage === "finishing" || stage === "merging_pr" || stage === "deleting_pr_branch") return [...reconnect, "retry"]
        return [...reconnect, "retry", "request-correction"]
    }
    switch (stage) {
        case "plan_review":
            return ["implement", "revise-plan"]
        case "adversarial_blocked":
            return ["adversarial-fix", "adversarial-rerun", "adversarial-skip"]
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

export const canRun = (stage: WorkbenchStage, runState: RunState, action: WorkbenchAction, waitingSlot = false) => workbenchActions(stage, runState, true, true, waitingSlot).includes(action)

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
export function workbenchWaitingReason(input: { stage: WorkbenchStage; runState: RunState; pendingPermissions: number; pendingForms: number; slotQueuePosition?: number | null; waitingSlot?: boolean }): string | null {
    const { stage, runState, pendingPermissions, pendingForms } = input
    if (input.waitingSlot) return `Aguardando vaga na central${input.slotQueuePosition ? ` (#${input.slotQueuePosition})` : ""}`
    if (runState === "running" && pendingPermissions === 0 && pendingForms === 0) return null
    if (runState === "failed") return "A etapa falhou — use Tentar novamente"
    if (runState === "interrupted") return "Execução interrompida — use Tentar novamente"
    if (pendingPermissions > 0) return "Aguardando você permitir uma ação"
    if (pendingForms > 0) return "Aguardando você responder uma pergunta"
    switch (stage) {
        case "plan_review":
            return "Aguardando revisão do plano"
        case "adversarial_blocked":
            return "O agente adversário bloqueou: decida como seguir"
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
 * `null` quando o agente trabalha, aguarda a vez do build (`build_queued`), aguarda vaga na central ou a mesa concluiu
 * (`done`). É o recorte de `workbenchWaitingReason` para o item da lista de tarefas/mesas.
 */
export function workbenchUserWaitReason(input: { stage: WorkbenchStage; runState: RunState; pendingPermissions: number; pendingForms: number; waitingSlot?: boolean }): string | null {
    if (input.waitingSlot) return null
    if (input.stage === "done" || input.stage === "build_queued") return null
    return workbenchWaitingReason(input)
}
