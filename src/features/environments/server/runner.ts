import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DomainError } from "@/lib/api/route"
import { getOpencodeClient, runOpencodeShell } from "@/lib/ai/opencode-client"
import { logger } from "@/lib/logger"

/**
 * Execução de comandos no **host do ambiente** (SOMENTE servidor).
 *
 * - **Local**: a máquina do OpenCode, pelo `shell` do próprio OpenCode (o Opex em Docker não monta
 *   o socket do Docker nem os repositórios). Requer o OpenCode conectado.
 * - **Remoto**: SSH, autenticado por chave (arquivo temporário 0600) ou senha (`sshpass`).
 *
 * Os serviços (docker, git, compose) recebem um `EnvironmentHost` e são testados com um mock.
 */

export interface CommandResult {
    exitCode: number | null
    status: string
    output: string
}

export interface RunOptions {
    /** Diretório no host onde o comando roda (padrão: diretório base do host). */
    cwd?: string
    timeoutMs?: number
    signal?: AbortSignal
}

export interface EnvironmentHost {
    readonly kind: "local" | "remote"
    readonly description: string
    run(command: string, options?: RunOptions): Promise<CommandResult>
}

export interface ResolvedRepoConnection {
    mode: "local" | "remote"
    host: string
    sshPort: number
    sshUser: string
    authMethod: "key" | "password"
    sshKeyPath: string
    repositoryDirectory: string
    sshPassword: string | null
    sshPrivateKey: string | null
    sshPassphrase: string | null
}

/** Aspas simples seguras para o shell (`'` vira `'\''`). */
export function shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`
}

export const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60_000

class LocalEnvironmentHost implements EnvironmentHost {
    readonly kind = "local" as const
    readonly description = "Docker local (máquina do OpenCode)"

    constructor(private readonly baseDir: string) {}

    async run(command: string, options: RunOptions = {}): Promise<CommandResult> {
        const directory = options.cwd ?? this.baseDir
        if (!directory) throw new DomainError(400, "Defina o diretório dos repositórios na configuração do ambiente.", "HOST_DIRECTORY_MISSING")
        try {
            const client = await getOpencodeClient()
            const result = await runOpencodeShell(client, directory, command, {
                timeoutMs: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
                signal: options.signal,
            })
            return { exitCode: result.exitCode, status: result.status, output: result.output }
        } catch (error) {
            if (error instanceof DomainError) throw error
            throw new DomainError(502, `Não foi possível executar comandos no host local: ${error instanceof Error ? error.message : String(error)}`, "HOST_UNAVAILABLE")
        }
    }
}

class RemoteEnvironmentHost implements EnvironmentHost {
    readonly kind = "remote" as const
    readonly description: string

    constructor(private readonly connection: ResolvedRepoConnection) {
        this.description = `SSH ${connection.sshUser}@${connection.host}:${connection.sshPort}`
    }

    async run(command: string, options: RunOptions = {}): Promise<CommandResult> {
        const { connection } = this
        if (!connection.host || !connection.sshUser) {
            throw new DomainError(400, "Configure host e usuário do SSH na configuração do ambiente.", "SSH_NOT_CONFIGURED")
        }
        const directory = options.cwd ?? connection.repositoryDirectory
        const remoteCommand = directory ? `cd ${shellQuote(directory)} && ${command}` : command
        const args = ["-p", String(connection.sshPort), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=15"]
        let keyDir: string | null = null
        let env = process.env
        try {
            if (connection.authMethod === "key") {
                if (connection.sshPrivateKey) {
                    keyDir = await mkdtemp(join(tmpdir(), "opex-env-key-"))
                    const keyPath = join(keyDir, "id")
                    await writeFile(keyPath, connection.sshPrivateKey, { mode: 0o600 })
                    args.push("-i", keyPath)
                } else if (connection.sshKeyPath) {
                    args.push("-i", connection.sshKeyPath)
                }
            } else if (connection.sshPassword) {
                // `sshpass` entrega a senha pelo ambiente (nunca na linha de comando).
                env = { ...process.env, SSHPASS: connection.sshPassword }
            }
            args.push(`${connection.sshUser}@${connection.host}`, remoteCommand)
            const binary = connection.authMethod === "password" ? "sshpass" : "ssh"
            const commandArgs = connection.authMethod === "password" ? ["-e", "ssh", ...args] : args
            const result = await runProcess(binary, commandArgs, { timeoutMs: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS, signal: options.signal, env })
            return result
        } finally {
            if (keyDir) await rm(keyDir, { recursive: true, force: true }).catch(() => undefined)
        }
    }
}

interface RunProcessOptions {
    timeoutMs: number
    signal?: AbortSignal
    env: NodeJS.ProcessEnv
}

function runProcess(binary: string, args: string[], options: RunProcessOptions): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
        let settled = false
        const child = spawn(binary, args, { env: options.env })
        let output = ""
        const append = (chunk: Buffer | string) => {
            output += chunk.toString()
        }
        child.stdout.on("data", append)
        child.stderr.on("data", append)
        const timer = setTimeout(() => {
            if (settled) return
            settled = true
            child.kill("SIGKILL")
            reject(new DomainError(504, "O comando excedeu o tempo limite no host remoto.", "HOST_TIMEOUT"))
        }, options.timeoutMs)
        const onAbort = () => {
            if (settled) return
            settled = true
            child.kill("SIGKILL")
            reject(new DomainError(499, "Comando cancelado.", "CANCELLED"))
        }
        options.signal?.addEventListener("abort", onAbort, { once: true })
        child.on("error", (error) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            options.signal?.removeEventListener("abort", onAbort)
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                reject(new DomainError(503, `O binário "${binary}" não está disponível no servidor do Opex.`, "HOST_BINARY_MISSING"))
                return
            }
            reject(new DomainError(502, `Falha ao executar no host remoto: ${error.message}`, "HOST_UNAVAILABLE"))
        })
        child.on("close", (code) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            options.signal?.removeEventListener("abort", onAbort)
            logger.debug({ binary, code, length: output.length }, "[environments] comando remoto")
            resolve({ exitCode: code, status: code === 0 ? "done" : "failed", output: output.trim() })
        })
    })
}

export function createEnvironmentHost(connection: ResolvedRepoConnection): EnvironmentHost {
    if (connection.mode === "remote") return new RemoteEnvironmentHost(connection)
    return new LocalEnvironmentHost(connection.repositoryDirectory)
}
