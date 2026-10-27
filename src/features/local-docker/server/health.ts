import { LOCAL_DOCKER_HEALTH_INTERVAL_MS } from "../constants"
import { isBuilderMachineActive } from "./active"
import { LocalDockerState } from "./models"
import { loadState, localDockerLog, publishLocalDocker, settingsOf } from "./settings"
import { runOnHost, type HostRunner } from "./shell"
import { isTunnelOpen, openTunnel } from "./tunnel"
import { connectionProblem } from "../commands"

let lastRunAt = 0

/**
 * Rotina do agendador (ponto de montagem em `cron-scheduler.ts`): confere o túnel, reabre o que o
 * usuário deixou aberto e caiu (PC reiniciado, VPN) e avisa a tela quando o estado muda.
 */
export async function runLocalDockerHealth(now = new Date(), run: HostRunner = runOnHost): Promise<void> {
    if (now.getTime() - lastRunAt < LOCAL_DOCKER_HEALTH_INTERVAL_MS - 5_000) return
    if (!(await isBuilderMachineActive())) return
    lastRunAt = now.getTime()
    const state = await loadState()
    if (!state?.publicKey) return
    let open = await isTunnelOpen(run)
    if (!open && state.wantOpen && !connectionProblem(settingsOf(state).settings)) {
        try {
            open = (await openTunnel(null, run)).tunnelOpen
            localDockerLog.info("[local-docker] Túnel reaberto pela rotina")
        } catch (error) {
            localDockerLog.warn({ err: error }, "[local-docker] Túnel caiu e não reabriu (o PC está desligado ou fora da rede?)")
        }
    }
    if (open !== state.lastSeenOpen) {
        await LocalDockerState.updateOne({ key: "default" }, { $set: { lastSeenOpen: open, lastCheckAt: now } })
        await publishLocalDocker("status")
    }
}

/** Só para os testes. */
export function resetLocalDockerHealthThrottle(): void {
    lastRunAt = 0
}
