import { isValidObjectId } from "mongoose"
import type { HostRunner } from "@/features/local-docker/server/shell"
import { DEPLOY_STALE_MS } from "../constants"
import { resumeDeploy, runnerId } from "./deploy"
import { hasLiveDeploy } from "./hub"
import { EnvironmentDeploy, environmentsDb, type IEnvironmentDeploy } from "./models"
import { envLog, runEnvHost } from "./settings"

/**
 * Retomada dos deploys cujo processo morreu no meio — o caso típico é o redeploy do próprio opex:
 * o `up -d` recria o container do app e o processo que conduzia o deploy some, mas o comando segue no
 * host. Um deploy `running` com o sinal de vida vencido é reivindicado (atômico: só um processo ganha)
 * e retomado por `resumeDeploy`, que nunca o deixa em andamento.
 */

/** Retomadas em curso neste processo (a lista, o tick e o log podem pedir a mesma ao mesmo tempo). */
const KEY = Symbol.for("opex.environments.resuming")
const store = globalThis as unknown as Record<symbol, Map<string, Promise<void>> | undefined>
const resuming = () => (store[KEY] ??= new Map())

const staleFilter = (now = Date.now()) => ({ status: "running" as const, $or: [{ heartbeatAt: { $lt: new Date(now - DEPLOY_STALE_MS) } }, { heartbeatAt: null }] })

/**
 * Garante que o deploy não está órfão: conduzido por este processo (`live`), retomado agora
 * (`resumed`) ou não reivindicável (`other`: encerrado ou com outro processo vivo cuidando dele).
 */
export async function ensureDeployResumed(deployId: string, run: HostRunner = runEnvHost): Promise<"resumed" | "live" | "other"> {
    if (!isValidObjectId(deployId)) return "other"
    if (hasLiveDeploy(deployId) || resuming().has(deployId)) return "live"
    await environmentsDb()
    const claimed = await EnvironmentDeploy.findOneAndUpdate({ _id: deployId, ...staleFilter() }, { $set: { heartbeatAt: new Date(), runnerId: runnerId(), resumed: true } }, { new: true }).lean<IEnvironmentDeploy>()
    if (!claimed) return hasLiveDeploy(deployId) ? "live" : "other"
    const job = resumeDeploy(claimed, run)
        .catch((error: unknown) => envLog.error({ err: error, deployId }, "[environments] Falha ao retomar o deploy"))
        .finally(() => resuming().delete(deployId))
    resuming().set(deployId, job)
    return "resumed"
}

/** Procura e retoma os deploys órfãos (tick do agendador e a lista). Devolve quantos foram retomados. */
export async function resumeInterruptedDeploys(run: HostRunner = runEnvHost): Promise<number> {
    await environmentsDb()
    const stale = await EnvironmentDeploy.find(staleFilter()).select({ _id: 1 }).lean<Pick<IEnvironmentDeploy, "_id">[]>()
    let resumed = 0
    for (const item of stale) {
        const id = String(item._id)
        if (hasLiveDeploy(id) || resuming().has(id)) continue
        if ((await ensureDeployResumed(id, run)) === "resumed") resumed++
    }
    return resumed
}

/** Varredura da lista (consultada a cada 10 s): no máximo uma a cada 10 s por processo. */
const SCAN_KEY = Symbol.for("opex.environments.resume-scan")
const scanStore = globalThis as unknown as Record<symbol, number | undefined>
const SCAN_INTERVAL_MS = 10_000

export async function scheduleDeployResume(run: HostRunner = runEnvHost): Promise<void> {
    const last = scanStore[SCAN_KEY] ?? 0
    if (Date.now() - last < SCAN_INTERVAL_MS) return
    scanStore[SCAN_KEY] = Date.now()
    await resumeInterruptedDeploys(run)
}

/** Só para os testes: espera as retomadas em curso e zera a varredura. */
export async function settleResumes(): Promise<void> {
    await Promise.all([...resuming().values()])
    scanStore[SCAN_KEY] = undefined
}
