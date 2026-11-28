import { PROJECT_BOOTSTRAP_STEPS, type ProjectBootstrapStatus, type ProjectBootstrapStep } from "./constants"

/**
 * Estado do stepper (módulo puro): de cada etapa, o estado (cor), o progresso (0–1) e um rótulo curto;
 * qual etapa fica aberta por padrão e até onde o dono pode navegar (as concluídas abrem só leitura).
 */

export const BOOTSTRAP_PHASES = ["turn", "verify", "link", "central", "environment", "deploy"] as const
export type BootstrapPhase = (typeof BOOTSTRAP_PHASES)[number]

export const BOOTSTRAP_PHASE_LABELS: Record<BootstrapPhase, string> = {
    turn: "O agente está provisionando",
    verify: "Conferindo as entregas no host",
    link: "Criando o vínculo do GitHub",
    central: "Criando a central de desenvolvimento",
    environment: "Criando o ambiente",
    deploy: "Fazendo o deploy",
}

/** Progresso da etapa em cada fase (a barra avança fase a fase). */
const PHASE_PROGRESS: Record<BootstrapPhase, number> = { turn: 0.45, verify: 0.9, link: 0.35, central: 0.8, environment: 0.15, deploy: 0.55 }

export type StepVisualStatus = "idle" | "running" | "waiting" | "failed" | "done"

export interface StepState {
    id: ProjectBootstrapStep
    status: StepVisualStatus
    progress: number
    /** Ex.: "Tentativa 3" na volta ao agente depois de um deploy com falha. */
    badge: string | null
}

export interface StepperInput {
    step: ProjectBootstrapStep
    status: ProjectBootstrapStatus
    phase: BootstrapPhase | null
    attempt: number
}

export const stepIndex = (step: ProjectBootstrapStep) => PROJECT_BOOTSTRAP_STEPS.indexOf(step)

export function stepperState(input: StepperInput): StepState[] {
    const current = stepIndex(input.step)
    return PROJECT_BOOTSTRAP_STEPS.map((id, index): StepState => {
        const badge = id === "provision" && input.attempt > 1 ? `Tentativa ${input.attempt}` : null
        if (input.status === "done" || index < current) return { id, status: "done", progress: 1, badge }
        if (index > current) return { id, status: "idle", progress: 0, badge }
        const progress = input.phase && stepIndex(input.step) === index ? PHASE_PROGRESS[input.phase] ?? 0.1 : 0.1
        switch (input.status) {
            case "running":
                return { id, status: "running", progress, badge }
            case "waiting":
                return { id, status: "waiting", progress, badge }
            case "failed":
                return { id, status: "failed", progress, badge }
            default:
                return { id, status: "idle", progress, badge }
        }
    })
}

/** Etapa aberta por padrão (a atual) e o maior índice navegável (todas até a atual). */
export function defaultStepIndex(input: Pick<StepperInput, "step" | "status">): number {
    return stepIndex(input.status === "done" ? "done" : input.step)
}

/** Etapa que conta para o card de em andamento e o histórico (o rótulo da linha). */
export function activeStepLabel(input: Pick<StepperInput, "step" | "phase" | "status">): string | null {
    if (input.status === "done" || input.status === "cancelled") return null
    return input.phase ? BOOTSTRAP_PHASE_LABELS[input.phase] : null
}
