import { buildCommand, cancelPorts, cancelReverseRegistry, ensureRegistryCommand, forwardPorts, healthCommand, pullCommand, pushCommand, reverseRegistry, upCommand, type ComposePlan, type DockerTarget } from "./commands"
import { HEALTH_TIMEOUT_MS } from "./constants"
import type { EnvironmentsSettings, Machine } from "./schemas"

/** Um passo do deploy (puro: a ordem e os comandos saem só da combinação Build → Execução). */
export interface DeployStep {
    label: string
    command: string
    timeoutMs: number
    /** Build na vez da fila: `server` = fila global do build; `pc` = trava própria do PC (um por vez). */
    lock?: Machine
    /** Roda sempre no fim (mesmo depois de uma falha): desfaz um repasse temporário. */
    always?: boolean
    /** Explicação escrita no log antes do passo. */
    note?: string
}

export interface DeployPlanInput {
    settings: EnvironmentsSettings
    plan: ComposePlan
    buildOn: Machine
    runOn: Machine
    targets: Record<Machine, DockerTarget>
    /** Serviços com `build` (as imagens que passam pelo registry quando as máquinas diferem). */
    buildServices: string[]
    ports: number[]
    healthUrl: string | null
    /** Imagens do commit já prontas na máquina do build (build reaproveitado). */
    skipBuild?: boolean
}

const BUILD_TIMEOUT = 45 * 60_000
const STEP_TIMEOUT = 15 * 60_000

/**
 * Passos do deploy para cada combinação:
 * - Servidor → Servidor: build (fila global) → `up -d`;
 * - PC → PC: build no PC (trava do PC) → `up -d --no-build` no PC → repasse das portas;
 * - PC → Servidor: build no PC → registry → repasse `-R` → `push` no PC → `pull` + `up` no servidor;
 * - Servidor → PC: build → registry → `push` → repasse `-R` → `pull` no PC → `up` no PC → repasse das portas.
 * Sem serviço com `build`, não há registry: só `pull` + `up` na máquina de execução.
 */
export function deploySteps(input: DeployPlanInput): DeployStep[] {
    const { plan, buildOn, runOn, targets, settings } = input
    const build = targets[buildOn]
    const run = targets[runOn]
    const steps: DeployStep[] = []
    const cross = buildOn !== runOn && input.buildServices.length > 0
    if (input.buildServices.length && !input.skipBuild) steps.push({ label: `Build no ${buildOn === "pc" ? "PC" : "servidor"}`, command: buildCommand(plan, build), timeoutMs: BUILD_TIMEOUT, lock: buildOn })
    if (cross) {
        steps.push({ label: "Registry no servidor", command: ensureRegistryCommand(settings), timeoutMs: 120_000 })
        if (buildOn === "pc") {
            steps.push({ label: "Repasse do registry para o PC", command: reverseRegistry(settings), timeoutMs: 30_000 })
            steps.push({ label: "Push das imagens no PC", command: pushCommand(plan, build, input.buildServices), timeoutMs: STEP_TIMEOUT })
            steps.push({ label: "Fecha o repasse do registry", command: cancelReverseRegistry(settings), timeoutMs: 30_000, always: true })
        } else {
            steps.push({ label: "Push das imagens no servidor", command: pushCommand(plan, build, input.buildServices), timeoutMs: STEP_TIMEOUT })
            steps.push({ label: "Repasse do registry para o PC", command: reverseRegistry(settings), timeoutMs: 30_000 })
        }
    }
    if (buildOn !== runOn) steps.push({ label: `Pull no ${runOn === "pc" ? "PC" : "servidor"}`, command: pullCommand(plan, run), timeoutMs: STEP_TIMEOUT })
    if (cross && buildOn === "server") steps.push({ label: "Fecha o repasse do registry", command: cancelReverseRegistry(settings), timeoutMs: 30_000, always: true })
    steps.push({ label: `Sobe no ${runOn === "pc" ? "PC" : "servidor"}`, command: upCommand(plan, run, false), timeoutMs: STEP_TIMEOUT })
    if (runOn === "pc" && input.ports.length) steps.push({ label: "Repasse das portas para o servidor", command: forwardPorts(input.ports), timeoutMs: 30_000 })
    if (input.healthUrl) steps.push({ label: "Saúde", command: healthCommand(input.healthUrl, HEALTH_TIMEOUT_MS), timeoutMs: HEALTH_TIMEOUT_MS + 30_000 })
    return steps
}

/** Derrubar na máquina onde está (e tirar os repasses das portas do PC). */
export function teardownSteps(input: { plan: ComposePlan; on: Machine; target: DockerTarget; ports: number[]; volumes: boolean; down: (plan: ComposePlan, target: DockerTarget, volumes: boolean) => string }): DeployStep[] {
    const steps: DeployStep[] = [{ label: `Derruba no ${input.on === "pc" ? "PC" : "servidor"}`, command: input.down(input.plan, input.target, input.volumes), timeoutMs: STEP_TIMEOUT }]
    if (input.on === "pc" && input.ports.length) steps.push({ label: "Tira os repasses das portas", command: cancelPorts(input.ports), timeoutMs: 30_000, always: true })
    return steps
}

const MACHINE_NAME: Record<Machine, string> = { pc: "PC", server: "servidor" }

/**
 * Fase de execução do deploy numa lista só (a que pode ser retomada depois de o app reiniciar):
 * derrubar a origem antes (mesma porta), os passos do deploy e derrubar a origem depois (sem portas).
 * Puro: o mesmo `input` sempre dá os mesmos passos, então o índice gravado aponta o mesmo passo.
 */
export function executionSteps(input: DeployPlanInput & { from: Machine | null; down: (plan: ComposePlan, target: DockerTarget, volumes: boolean) => string }): DeployStep[] {
    const order = moveOrder({ fromRun: input.from, toRun: input.runOn, ports: input.ports })
    const teardown = (on: Machine, note: string, afterDeploy: boolean) => {
        const steps = teardownSteps({ plan: input.plan, on, target: input.targets[on], ports: input.ports, volumes: false, down: input.down })
        // Depois do deploy, só com ele concluído: numa falha a origem segue no ar (com os repasses).
        return steps.map((step, index) => ({ ...step, ...(index === 0 ? { note } : {}), ...(afterDeploy ? { always: false } : {}) }))
    }
    const from = input.from
    return [
        ...(order === "down-first" && from ? teardown(from, `A porta é a mesma: derrubando no ${MACHINE_NAME[from]} antes (o ambiente fica fora do ar durante o deploy).`, false) : []),
        ...deploySteps(input),
        ...(order === "up-first" && from ? teardown(from, `No ar no destino: derrubando no ${MACHINE_NAME[from]} (volumes não migram).`, true) : []),
    ]
}

/**
 * Mover (troca a máquina de execução): com portas, a origem sai antes (mesma porta no servidor) e há
 * tempo fora do ar; sem portas, implanta no destino, espera a saúde e só então derruba a origem.
 */
export function moveOrder(input: { fromRun: Machine | null; toRun: Machine; ports: number[] }): "redeploy" | "down-first" | "up-first" {
    if (!input.fromRun || input.fromRun === input.toRun) return "redeploy"
    return input.ports.length ? "down-first" : "up-first"
}
