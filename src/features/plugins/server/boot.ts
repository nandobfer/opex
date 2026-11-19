import { loggerFor } from "@/lib/logger"

/**
 * Subida do kernel de plugins (OPE-172), chamada pelo `register()` do `instrumentation.ts` sem
 * bloquear o boot. Em instância de prévia do app o kernel sobe sem ativar código de servidor.
 */
export async function startPluginKernel(): Promise<void> {
    const log = loggerFor({ module: "plugins.boot" })
    try {
        const { getPluginKernel, markKernelStarted } = await import("./kernel/kernel")
        const state = await getPluginKernel()
        if (!(await markKernelStarted())) return
        if (state.mode === "preview-instance") {
            log.info("[plugins] Instância de prévia: código de servidor dos plugins desligado")
            return
        }
        const { syncAllPluginServers } = await import("./service")
        await syncAllPluginServers()
        log.info("[plugins] Kernel de plugins iniciado")
    } catch (error) {
        log.error({ err: error }, "[plugins] Falha ao iniciar o kernel de plugins")
    }
}
