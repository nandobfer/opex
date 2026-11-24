import { isTunnelOpen } from "@/features/local-docker/server/tunnel"
import type { HostRunner } from "@/features/local-docker/server/shell"
import { forwardPorts } from "../commands"
import { Environment, environmentsDb, type IEnvironment } from "./models"
import { resumeInterruptedDeploys } from "./resume"
import { envLog, runEnvHost } from "./settings"

/** Último estado visto do túnel (por processo): reabre os repasses só quando ele volta. */
const KEY = Symbol.for("opex.environments.tunnel-seen")
const store = globalThis as unknown as Record<symbol, boolean | undefined>

/** Ambientes no PC com portas (os que precisam de repasse) — puro. */
export function pcPortsOf(envs: Pick<IEnvironment, "deployedOn" | "ports">[]): number[] {
    return [...new Set(envs.filter((env) => env.deployedOn?.runOn === "pc").flatMap((env) => env.ports))]
}

/**
 * Tick do agendador: retoma os deploys cujo processo morreu (ex.: o redeploy do
 * próprio app), roda a recriação do builder do servidor adiada por um build e, com o túnel do Builder Machine de volta (fechado → aberto, ou o primeiro tick do
 * processo), reabre os repasses das portas dos ambientes que rodam no PC.
 */
export async function runEnvironmentsTick(run: HostRunner = runEnvHost): Promise<void> {
    await environmentsDb()
    await resumeInterruptedDeploys(run).catch((error: unknown) => envLog.warn({ err: error }, "[environments] Falha ao retomar deploys interrompidos"))
    await import("./builder").then(({ runPendingBuilderRecreate }) => runPendingBuilderRecreate(run)).catch((error: unknown) => envLog.warn({ err: error }, "[environments] Falha na recriação pendente do builder"))
    const envs = await Environment.find({ "deployedOn.runOn": "pc" }).select({ deployedOn: 1, ports: 1 }).lean<IEnvironment[]>()
    const ports = pcPortsOf(envs)
    if (!ports.length) return
    const open = await isTunnelOpen(run).catch(() => false)
    const before = store[KEY]
    store[KEY] = open
    if (!open || before === true) return
    await run(forwardPorts(ports), 60_000)
    envLog.info({ ports }, "[environments] Repasses das portas dos ambientes no PC reabertos")
}

/** Só para os testes. */
export function resetTunnelSeen(): void {
    store[KEY] = undefined
}
