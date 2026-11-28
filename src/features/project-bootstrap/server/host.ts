import { DomainError } from "@/lib/api/route"
import { openHost, type OpencodeHost } from "@/features/opencode-resources/server/host"
import { classifyDirectory, directoryCheckCommand, missingDeliverables, shq, verificationCommand, type Deliverable, type VerificationTarget } from "../host-checks"
import type { DirectoryCheckDto } from "../types"

/**
 * Conferências do bootstrap no host do OpenCode (SOMENTE servidor). O app não enxerga o disco do host:
 * tudo passa pelo shell e pelos arquivos do OpenCode.
 */

export async function checkHostDirectory(path: string, repo: string, host?: OpencodeHost): Promise<DirectoryCheckDto> {
    const target = host ?? (await openHost())
    const result = await target.run(directoryCheckCommand(path), 20_000, { quiet: true, retryOnLost: true })
    if (result.exitCode !== 0) return { path, kind: "blocked", reason: "Não foi possível conferir a pasta no host.", message: "Confira o OpenCode e tente de novo." }
    return { path, ...classifyDirectory(result.output, repo) }
}

/** Cria a pasta da sessão (o OpenCode abre a sessão num diretório que precisa existir). */
export async function ensureHostDirectory(path: string, host?: OpencodeHost): Promise<void> {
    const target = host ?? (await openHost())
    const result = await target.run(`mkdir -p ${shq(path)} && test -w ${shq(path)}`, 20_000, { quiet: true, retryOnLost: true })
    if (result.exitCode !== 0) throw new DomainError(502, `Não foi possível criar a pasta ${path} no host do OpenCode`, "BOOTSTRAP_DIRECTORY_FAILED")
}

/** Fim da etapa 2: o que faltou entregar (vazio = tudo certo). */
export async function verifyDeliverables(input: VerificationTarget & { repo: string }, host?: OpencodeHost): Promise<Deliverable[]> {
    const target = host ?? (await openHost())
    const result = await target.run(verificationCommand(input), 60_000, { quiet: true, retryOnLost: true })
    if (result.exitCode !== 0) throw new DomainError(502, "Não foi possível conferir as entregas no host do OpenCode", "BOOTSTRAP_VERIFY_FAILED")
    return missingDeliverables(result.output, input.repo, input.withEnvironment !== false)
}

/** `.env` produzido pelo agente (o conteúdo nunca vai para log, evento ou auditoria). */
export async function readBootstrapEnv(directory: string, host?: OpencodeHost): Promise<string | null> {
    const target = host ?? (await openHost())
    return target.readText(`${directory.replace(/\/+$/, "")}/.env`)
}
