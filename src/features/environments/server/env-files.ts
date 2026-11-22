import type { HostRunner } from "@/features/local-docker/server/shell"
import { ensureEnvFilesCommand, envFilesConfigCommand, parseCreatedEnvFiles, parseEnvFiles, type ComposePlan, type DockerTarget } from "../commands"
import { envLog } from "./settings"

/** Linha do log do deploy para um arquivo de variáveis criado pelo app. */
export const createdEnvFileMessage = (file: string) => `Arquivo de variáveis do compose ausente: ${file} (criado vazio)`

/**
 * Garante os arquivos de variáveis (`env_file`) que o compose do projeto declara: o que falta é
 * criado vazio (com a pasta) e o que existe nunca é tocado. Roda antes de toda ação do compose;
 * uma falha aqui não bloqueia a ação (o compose mostra o erro real). Devolve os arquivos declarados.
 */
export async function ensureComposeEnvFiles(plan: ComposePlan, target: DockerTarget, run: HostRunner, options: { write?: (text: string) => void } = {}): Promise<string[]> {
    try {
        // A saída do `config` pode ter valores escritos no próprio compose: nunca vai para o log.
        const read = await run(envFilesConfigCommand(plan, target), 60_000, { retryOnLost: true, redactedAs: "docker compose config --no-env-resolution (saída omitida)" })
        if (read.exitCode !== 0) {
            envLog.warn({ project: plan.projectName, exitCode: read.exitCode }, "[environments] Não foi possível ler os arquivos de variáveis do compose")
            return []
        }
        const files = parseEnvFiles(read.output)
        if (!files.length) return []
        const made = await run(ensureEnvFilesCommand(plan, files), 30_000, { retryOnLost: true })
        if (made.exitCode !== 0) {
            envLog.warn({ project: plan.projectName, exitCode: made.exitCode }, "[environments] Não foi possível criar os arquivos de variáveis do compose")
            return files
        }
        for (const file of parseCreatedEnvFiles(made.output)) {
            options.write?.(`\n${createdEnvFileMessage(file)}\n`)
            envLog.info({ project: plan.projectName, file }, "[environments] Arquivo de variáveis do compose criado vazio")
        }
        return files
    } catch (error) {
        envLog.warn({ err: error, project: plan.projectName }, "[environments] Falha ao garantir os arquivos de variáveis do compose")
        return []
    }
}
