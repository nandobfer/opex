import { createHostRunner } from "@/features/local-docker/server/shell"
import { integrationDebug } from "@/lib/integrations/debug"
import { HOST_METRICS_SHELL_COMMAND, HOST_METRICS_SHELL_TIMEOUT_MS } from "../constants"

/** Fallback sem o plugin: o comando fixo no shell do OpenCode (host), saída crua para o parser puro. */
export type HostMetricsShellReader = () => Promise<string>

const runner = createHostRunner(integrationDebug("ai_opencode"))

export const readHostMetricsShell: HostMetricsShellReader = async () => {
    const result = await runner(HOST_METRICS_SHELL_COMMAND, HOST_METRICS_SHELL_TIMEOUT_MS, { quiet: true, retryOnLost: true })
    if (result.exitCode !== 0) throw new Error(`O comando terminou com código ${result.exitCode ?? "?"}`)
    return result.output
}
