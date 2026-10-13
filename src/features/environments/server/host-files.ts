import { logger } from "@/lib/logger"
import { DomainError } from "@/lib/api/route"
import { shellQuote, type EnvironmentHost } from "./runner"

/**
 * Escrita de arquivos no host do ambiente (override do Compose e `.env`): um `cat > arquivo` com
 * heredoc. O conteúdo é passado como argumento do comando — por isso os valores sensíveis também
 * entram na lista de segredos mascarados nos logs (`EnvironmentRuntime.secrets`).
 */

export const HEREDOC_DELIMITER = "OPEX_EOF"

export function hostFileWriteCommand(path: string, content: string): string {
    return `mkdir -p "$(dirname ${shellQuote(path)})" && cat > ${shellQuote(path)} <<'${HEREDOC_DELIMITER}'\n${content}\n${HEREDOC_DELIMITER}`
}

export async function writeHostFile(host: EnvironmentHost, path: string, content: string, options: { timeoutMs?: number } = {}): Promise<void> {
    const result = await host.run(hostFileWriteCommand(path, content), options)
    if (result.exitCode !== 0) {
        logger.warn({ path, exitCode: result.exitCode }, "[environments] Falha ao escrever arquivo no host")
        throw new DomainError(502, `Não foi possível gravar ${path} no host do ambiente.`, "HOST_FILE_WRITE_FAILED")
    }
}
