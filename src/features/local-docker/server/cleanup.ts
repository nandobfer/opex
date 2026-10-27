import { getIntegrationConfig } from "@/lib/integrations/config"
import { BUILDER_MACHINE_CLEANUP_JOB_ID, type CronJobConfig } from "@/lib/integrations/catalog"
import { updateIntegration } from "@/features/integrations/services/integration-service"
import { cleanupSteps } from "../commands"
import { isBuilderMachineActive } from "./active"
import { loadState, localDockerLog, publishLocalDocker, settingsOf } from "./settings"
import { builderDebug, lastLine, runOnHost, type HostRunner } from "./shell"
import { isTunnelOpen } from "./tunnel"

/**
 * Rotina "Limpar imagens órfãs e cache do builder do PC" (Integrações › Crons; ponto de montagem em
 * `cron-scheduler.ts`). Integração desativada ou túnel fechado: não faz nada (a próxima execução tenta de novo).
 */
export async function runBuilderMachineCleanup(run: HostRunner = runOnHost): Promise<string> {
    if (!(await isBuilderMachineActive())) return "Integração Builder Machine desativada: nada a limpar"
    const { settings } = settingsOf(await loadState())
    if (!(await isTunnelOpen(run))) return "Túnel do PC fechado: limpeza adiada para a próxima execução"
    const results: string[] = []
    for (const step of cleanupSteps(settings)) {
        const result = await run(step.command, 300_000)
        if (result.exitCode !== 0) throw new Error(`${step.label}: ${lastLine(result.output) || "falhou"}`)
        results.push(`${step.label}: ${lastLine(result.output) || "OK"}`)
    }
    builderDebug.success(`Limpeza do PC: ${results.join("; ")}`)
    localDockerLog.info({ results }, "[local-docker] Limpeza do PC concluída")
    await publishLocalDocker("containers")
    return results.join("; ")
}

/** Ao ativar a integração (transição desativada → ativa): liga a rotina de limpeza em Integrações › Crons. */
export async function onBuilderMachineEnabled(actorId: string): Promise<void> {
    const { jobs } = await getIntegrationConfig("crons")
    const job = jobs.find((item) => item.id === BUILDER_MACHINE_CLEANUP_JOB_ID)
    if (job?.enabled) return
    const next: CronJobConfig[] = job ? jobs.map((item) => (item.id === BUILDER_MACHINE_CLEANUP_JOB_ID ? { ...item, enabled: true } : item)) : jobs
    await updateIntegration("crons", { publicValues: { jobs: next } }, actorId)
    localDockerLog.info("[local-docker] Rotina de limpeza do PC ligada ao ativar a integração")
}
