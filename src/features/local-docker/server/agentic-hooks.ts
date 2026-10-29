import { isPortInUse } from "@/features/agentic/server/ports"
import { dockerPrefix, listeningPortsCommand, parseListeningPorts, teardownCommand } from "../commands"
import { prepareCaOverride, type PreviewOverride } from "./certificates"
import { LocalDockerPreview, localDockerDb } from "./models"
import { centralUsesLocal, getCentralOverride } from "./overrides"
import { loadState, localDockerLog, publishLocalDocker, settingsOf } from "./settings"
import { runOnHost, type HostRunner } from "./shell"
import { cancelForward, forwardPort, isTunnelOpen, machineInfo, teardownLocalPreview } from "./tunnel"

/**
 * Pontos de montagem da Builder Machine no desenvolvimento agêntico (`src/features/agentic/server/workflow.ts`,
 * import dinâmico só com a integração ativa): onde sobe o build da prévia e quem derruba a prévia do PC.
 */

export interface LocalBuildTarget {
    /** Prefixo de todo comando docker da prévia (`DOCKER_CONTEXT=… BUILDX_BUILDER=…`). */
    dockerPrefix: string
    /** Porta ocupada no PC ou no servidor (onde o repasse vai escutar)? */
    portCheck: (host: string, port: number) => Promise<boolean>
    /**
     * Registra a prévia no PC, gera o override do compose com as CAs do PC e repassa a porta
     * reservada para o servidor. Devolve os arquivos do compose do build e um aviso para a mesa.
     */
    attach: (port: number) => Promise<PreviewOverride>
}

export interface ResolveBuildInput {
    workbenchId: string
    centralId: string
    composeProject: string
    worktreePath: string
    /** `composeFile` da central (vazio = descoberta padrão do compose). */
    composeFile: string
    portEnvVar: string
    /** A mesa já tinha uma porta (uma prévia anterior pode estar no ar). */
    hadPort: boolean
    /** Build fora do PC por decisão da central (ex.: prévia no GitHub Action): só derruba a prévia anterior no PC. */
    forceServer?: boolean
}

class ForcedServer extends Error {}

/**
 * Túnel aberto e a central usando o PC → o build vai para o PC; senão, `null` (servidor, como sempre).
 * Trocando de máquina entre builds, a prévia anterior é derrubada antes (libera a porta). Qualquer
 * falha ao decidir cai no servidor.
 */
export async function resolveBuildTarget(input: ResolveBuildInput, run: HostRunner = runOnHost): Promise<LocalBuildTarget | null> {
    let local = false
    let settings = settingsOf(null).settings
    try {
        if (input.forceServer) throw new ForcedServer()
        settings = settingsOf(await loadState()).settings
        const { mode } = await getCentralOverride(input.centralId)
        local = centralUsesLocal(mode, settings.useWhenOpen) && (await isTunnelOpen(run)) && Boolean(await machineInfo(settings, run))
    } catch (error) {
        if (!(error instanceof ForcedServer)) localDockerLog.warn({ err: error, workbenchId: input.workbenchId }, "[local-docker] Falha ao decidir a máquina da prévia; usando o servidor")
        local = false
    }
    await localDockerDb()
    const onPc = Boolean(await LocalDockerPreview.exists({ workbenchId: input.workbenchId }))
    if (!local) {
        if (onPc) await teardownLocalPreview(input.workbenchId, run).catch((error: unknown) => localDockerLog.warn({ err: error, workbenchId: input.workbenchId }, "[local-docker] Falha ao derrubar a prévia anterior no PC"))
        return null
    }
    if (input.hadPort && !onPc) {
        // A prévia anterior está no servidor: sai antes, para a porta ficar livre para o repasse.
        await run(teardownCommand(null, input.composeProject), 120_000)
    }
    const busy = parseListeningPorts((await run(listeningPortsCommand(), 15_000)).output)
    return {
        dockerPrefix: dockerPrefix(settings),
        portCheck: async (host, port) => busy.has(port) || (await isPortInUse(host, port)),
        attach: async (port) => {
            const override = await prepareCaOverride(settings, { composeProject: input.composeProject, worktreePath: input.worktreePath, composeFile: input.composeFile, portEnvVar: input.portEnvVar, port }, run)
            if (override.notice?.level === "warn") localDockerLog.warn({ workbenchId: input.workbenchId, notice: override.notice.message }, "[local-docker] Prévia no PC sem as CAs do PC")
            await LocalDockerPreview.updateOne(
                { workbenchId: input.workbenchId },
                { $set: { centralId: input.centralId, composeProject: input.composeProject, port, pendingTeardown: false, composeFiles: override.composeFiles ?? [] }, $setOnInsert: { createdAt: new Date() } },
                { upsert: true },
            )
            await cancelForward(port, run)
            await forwardPort(port, run)
            localDockerLog.info({ workbenchId: input.workbenchId, port }, "[local-docker] Prévia no PC; porta repassada para o servidor")
            await publishLocalDocker("previews")
            return override
        },
    }
}

/**
 * Limpeza da mesa: a prévia que está no PC é derrubada aqui (ou fica pendente até o túnel reabrir).
 * `true` = a mesa tinha prévia no PC e o agente deve pular o `docker compose down`.
 */
export async function teardownForCleanup(workbenchId: string, run: HostRunner = runOnHost): Promise<boolean> {
    try {
        return (await teardownLocalPreview(workbenchId, run)) !== "none"
    } catch (error) {
        localDockerLog.warn({ err: error, workbenchId }, "[local-docker] Falha ao derrubar a prévia no PC na limpeza; tenta de novo ao reabrir o túnel")
        await LocalDockerPreview.updateOne({ workbenchId }, { $set: { pendingTeardown: true } }).catch(() => undefined)
        return true
    }
}
