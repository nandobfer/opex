import { createHash } from "node:crypto"
import { Client } from "ssh2"
import { DomainError } from "@/lib/api/route"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"

/**
 * SSH do servidor do app até a máquina do OpenCode — EXCEÇÃO à regra de Ambientes, restrita ao ciclo
 * de vida do serviço (iniciar, parar, reiniciar, atualizar, status e logs), que o shell do próprio
 * OpenCode não alcança com o serviço parado. Comandos fixos (`../commands.ts`); a chave do host é
 * sempre conferida pela impressão digital confiada pelo dono.
 */

const debug = integrationDebug("ai_opencode")

export interface SshSettings {
    host: string | null
    port: number
    username: string | null
    privateKey: string | null
    fingerprint: string | null
    bin: string | null
}

export function hostOfUrl(url: string | undefined): string | null {
    if (!url) return null
    try {
        return new URL(url).hostname || null
    } catch {
        return null
    }
}

export async function getSshSettings(): Promise<SshSettings> {
    const config = await getIntegrationConfig("ai_opencode")
    return {
        host: config.sshHost?.trim() || hostOfUrl(config.baseUrl),
        port: Number(config.sshPort) || 22,
        username: config.sshUser?.trim() || null,
        privateKey: config.sshPrivateKey?.trim() ? `${config.sshPrivateKey.trim()}\n` : null,
        fingerprint: config.sshHostFingerprint?.trim() || null,
        bin: config.opencodeBin?.trim() || null,
    }
}

export const isSshConfigured = (settings: SshSettings) => Boolean(settings.host && settings.username && settings.privateKey)

export function fingerprintOf(key: Buffer): string {
    return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`
}

function requireConfigured(settings: SshSettings): asserts settings is SshSettings & { host: string; username: string; privateKey: string } {
    if (!isSshConfigured(settings))
        throw new DomainError(409, "Acesso SSH ao host do OpenCode não configurado: preencha host, usuário e chave privada na aba Configuração", "OPENCODE_SSH_NOT_CONFIGURED")
}

/** Impressão digital da chave do host (sem autenticar), para o dono confiar. */
export async function probeHostFingerprint(settings: SshSettings): Promise<string> {
    if (!settings.host) throw new DomainError(409, "Informe o host SSH na aba Configuração", "OPENCODE_SSH_NOT_CONFIGURED")
    return new Promise<string>((resolve, reject) => {
        const conn = new Client()
        let captured: string | null = null
        const timer = setTimeout(() => {
            conn.end()
            reject(new DomainError(502, `O host SSH ${settings.host}:${settings.port} não respondeu`, "OPENCODE_SSH_UNREACHABLE"))
        }, 10_000)
        const finish = () => {
            clearTimeout(timer)
            if (captured) resolve(captured)
            else reject(new DomainError(502, `Não foi possível ler a chave do host SSH ${settings.host}:${settings.port}`, "OPENCODE_SSH_UNREACHABLE"))
        }
        conn.on("error", finish)
        conn.on("close", finish)
        conn.connect({
            host: settings.host!,
            port: settings.port,
            username: settings.username ?? "probe",
            readyTimeout: 10_000,
            hostVerifier: (key: Buffer) => {
                captured = fingerprintOf(key)
                return false
            },
        })
    })
}

export interface SshResult {
    exitCode: number | null
    output: string
}

/** Executa um comando fixo no host por SSH e espera terminar. */
export async function runSsh(command: string, timeoutMs: number, options: { quiet?: boolean; settings?: SshSettings } = {}): Promise<SshResult> {
    const settings = options.settings ?? (await getSshSettings())
    requireConfigured(settings)
    if (!settings.fingerprint) throw new DomainError(409, "Confie na chave do host SSH antes (aba Controles › Acesso SSH)", "OPENCODE_SSH_UNTRUSTED")
    if (!options.quiet) debug.request(`ssh ${settings.username}@${settings.host}: ${command}`)
    return new Promise<SshResult>((resolve, reject) => {
        const conn = new Client()
        let output = ""
        let hostMismatch: string | null = null
        let settled = false
        const done = (fn: () => void) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            conn.end()
            fn()
        }
        const timer = setTimeout(() => done(() => reject(new DomainError(504, `O comando por SSH passou de ${Math.round(timeoutMs / 1000)} s`, "OPENCODE_SSH_TIMEOUT"))), timeoutMs)
        conn.on("ready", () => {
            conn.exec(command, (error, stream) => {
                if (error) return done(() => reject(new DomainError(502, `Falha ao executar por SSH: ${error.message}`, "OPENCODE_SSH_FAILED")))
                stream.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")))
                stream.stderr.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")))
                stream.on("close", (code: number | null) => {
                    if (!options.quiet && code === 0) debug.response(`exit 0`)
                    else if (!options.quiet) debug.warn(`exit ${code ?? "?"}: ${output.trim().split("\n").at(-1) ?? ""}`.slice(0, 400))
                    done(() => resolve({ exitCode: typeof code === "number" ? code : null, output: output.slice(-200_000) }))
                })
            })
        })
        conn.on("error", (error) =>
            done(() =>
                reject(
                    hostMismatch
                        ? new DomainError(409, `A chave do host SSH mudou (${hostMismatch}): confira a máquina e limpe a impressão digital na aba Configuração para confiar de novo`, "OPENCODE_SSH_HOST_KEY_MISMATCH")
                        : new DomainError(502, `Não foi possível conectar por SSH em ${settings.host}:${settings.port}: ${error.message}`, "OPENCODE_SSH_UNREACHABLE"),
                ),
            ),
        )
        conn.connect({
            host: settings.host,
            port: settings.port,
            username: settings.username,
            privateKey: settings.privateKey,
            readyTimeout: 15_000,
            hostVerifier: (key: Buffer) => {
                const print = fingerprintOf(key)
                if (print === settings.fingerprint) return true
                hostMismatch = print
                return false
            },
        })
    })
}
