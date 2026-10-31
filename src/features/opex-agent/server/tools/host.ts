import { z } from "zod"
import { getOpencodeConnection } from "@/lib/ai/opencode"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { OPEX_HOST_AUDIT_ENTITY, OPEX_HOST_COMMAND_MAX, OPEX_HOST_MAX_TIMEOUT_LIMIT_SECONDS, OPEX_HOST_OUTPUT_MAX, OPEX_HOST_TIMEOUT_DEFAULT_SECONDS } from "../../constants"
import { normalizeHostDirectory, resolveHostDirectory } from "../../host-terminal"
import { runHostCommand } from "../host-shell"
import { loadOpexSettings } from "../settings"
import { contextSessionId, defineTool, OpexToolError } from "./define"

const log = loggerFor({ module: "opex-agent" })

/** Diretório das sessões do OpenCode (padrão sem diretórios permitidos); falha de conexão = sem padrão. */
async function opencodeDirectory(): Promise<string | null> {
    return getOpencodeConnection()
        .then((conn) => conn.directory ?? null)
        .catch(() => null)
}

const runInput = z.object({
    command: z.string().trim().min(1, "Informe o comando").max(OPEX_HOST_COMMAND_MAX).describe("Comando de shell (ex.: \"git status\", \"docker ps\", \"ls -la\"). Não interativo: nada de prompts, editores ou senhas"),
    directory: z.string().trim().max(500).optional().describe("Diretório absoluto de trabalho. Omitido: o padrão de get_host_terminal"),
    timeoutSeconds: z.number().int().min(1).max(OPEX_HOST_MAX_TIMEOUT_LIMIT_SECONDS).optional().describe(`Tempo máximo em segundos (padrão ${OPEX_HOST_TIMEOUT_DEFAULT_SECONDS}; limitado pela configuração)`),
})

export const hostTools = [
    defineTool({
        name: "get_host_terminal",
        group: "host",
        label: "Terminal do host",
        risk: "read",
        description: "Configuração do terminal do host: diretórios permitidos (vazio = qualquer um), diretório padrão e tempo máximo dos comandos. Consulte antes de run_host_command.",
        input: z.object({}),
        execute: async () => {
            const { settings } = await loadOpexSettings()
            const { allowedDirectories, maxTimeoutSeconds } = settings.host
            const resolved = resolveHostDirectory(undefined, allowedDirectories, await opencodeDirectory())
            return {
                machine: "Máquina do servidor OpenCode (fora do container do My Tasks)",
                unrestricted: allowedDirectories.length === 0,
                allowedDirectories,
                defaultDirectory: resolved.ok ? resolved.directory : null,
                defaultTimeoutSeconds: Math.min(OPEX_HOST_TIMEOUT_DEFAULT_SECONDS, maxTimeoutSeconds),
                maxTimeoutSeconds,
                outputLimitChars: OPEX_HOST_OUTPUT_MAX,
            }
        },
    }),
    defineTool({
        name: "run_host_command",
        group: "host",
        label: "Executar comando",
        risk: "destructive",
        description:
            "Executa um comando de shell na máquina do OpenCode (o host, fora do container do app) e espera terminar. Devolve status, exitCode e a saída (stdout+stderr; acima do limite, só o fim). Não interativo e sem estado entre chamadas: encadeie com && e use caminhos absolutos. O diretório precisa estar entre os permitidos (get_host_terminal).",
        input: runInput,
        summarize: (input) => `Executar no host${input.directory ? ` (em ${normalizeHostDirectory(input.directory)})` : ""}: ${input.command.length > 300 ? `${input.command.slice(0, 300)}…` : input.command}`,
        execute: async (input, context) => {
            const { settings } = await loadOpexSettings()
            const { allowedDirectories, maxTimeoutSeconds } = settings.host
            const resolved = resolveHostDirectory(input.directory, allowedDirectories, await opencodeDirectory())
            if (!resolved.ok) throw new OpexToolError(resolved.message)
            const timeoutSeconds = Math.min(input.timeoutSeconds ?? OPEX_HOST_TIMEOUT_DEFAULT_SECONDS, maxTimeoutSeconds)
            const result = await runHostCommand(input.command, resolved.directory, { timeoutMs: timeoutSeconds * 1000, signal: context.signal })
            log.info({ sessionId: context.sessionId, directory: result.cwd, status: result.status, exitCode: result.exitCode, durationMs: result.durationMs }, "[opex] comando no host")
            await recordAudit({
                userId: context.actorId,
                entidade: OPEX_HOST_AUDIT_ENTITY,
                entidadeId: contextSessionId(context) ?? `api-token:${context.origin?.tokenId ?? "desconhecido"}`,
                acao: AcaoAuditoria.EXECUTAR,
                depois: { comando: input.command, diretorio: result.cwd, situacao: result.status, codigoSaida: result.exitCode, duracaoMs: result.durationMs, via: context.origin ? "api-token" : "opex", ...(context.origin ? { token: { id: context.origin.tokenId, nome: context.origin.nome, prefixo: context.origin.prefixo } } : {}) },
            })
            return {
                ...result,
                timeoutSeconds,
                ...(result.status === "timeout" ? { note: `O comando passou de ${timeoutSeconds} s e foi encerrado.` } : {}),
                ...(result.truncated ? { outputNote: `Saída com ${result.outputSize.toLocaleString("pt-BR")} caracteres: mostrando só os últimos ${OPEX_HOST_OUTPUT_MAX.toLocaleString("pt-BR")}. Filtre (grep, tail, head) para ver outra parte.` } : {}),
            }
        },
    }),
]
