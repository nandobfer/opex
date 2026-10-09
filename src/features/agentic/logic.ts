import { PREVIEW_PORT_MAX, PREVIEW_PORT_MIN, RUNNING_STAGES, type AgentRole, type RunState, type WorkbenchStage } from "./constants"
import { centralConfigSchema, defaultCentralConfig, type AgentConfig, type AgenticSettings, type CentralConfig } from "./schemas"

/** Regras puras do desenvolvimento agêntico (cliente e servidor). */

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
    const base = defaultCentralConfig(sessionDirectory)
    const value = typeof raw === "object" && raw !== null ? (raw as Partial<CentralConfig>) : {}
    const merged = {
        ...base,
        ...value,
        agents: { ...base.agents, ...value.agents },
        git: { ...base.git, ...value.git },
        environment: { ...base.environment, ...value.environment },
        goSipal: { ...base.goSipal, ...value.goSipal },
        cleanup: { ...base.cleanup, ...value.cleanup },
        include: { ...base.include, ...value.include },
        instructions: { ...base.instructions, ...value.instructions },
    }
    const parsed = centralConfigSchema.safeParse(merged)
    return parsed.success ? parsed.data : base
}

/** Menor porta livre da faixa 4001–4098 (`null` = faixa esgotada). */
export function pickPreviewPort(used: Iterable<number>): number | null {
    const taken = new Set(used)
    for (let port = PREVIEW_PORT_MIN; port <= PREVIEW_PORT_MAX; port++) if (!taken.has(port)) return port
    return null
}

export const isPreviewPort = (port: number) => Number.isInteger(port) && port >= PREVIEW_PORT_MIN && port <= PREVIEW_PORT_MAX

export type WorkbenchAction =
    | "revise-plan"
    | "implement"
    | "request-correction"
    | "approve"
    | "submit-pr-feedback"
    | "reopen"
    | "retry"
    | "interrupt"
    | "open-preview"

/** Ações disponíveis na mesa (os botões da tela e a guarda das rotas usam a mesma regra). */
export function workbenchActions(stage: WorkbenchStage, runState: RunState, hasPreview: boolean): WorkbenchAction[] {
    if (runState === "running") return ["interrupt"]
    if (runState === "failed" || runState === "interrupted") {
        if (!RUNNING_STAGES.includes(stage)) return []
        // Falha depois do plano: tentar de novo ou voltar ao planejamento com uma correção.
        return stage === "planning" || stage === "finishing" ? ["retry"] : ["retry", "request-correction"]
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
