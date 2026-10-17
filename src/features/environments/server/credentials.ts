import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { decryptSecret, type EncryptedSecret } from "@/lib/crypto/secretBox"
import { dbConnect } from "@/lib/db"
import { EnvironmentRepoConfig } from "@/lib/db/models/EnvironmentRepoConfig"
import { Environment } from "@/lib/db/models/Environment"
import { DomainError } from "@/lib/api/route"
import type { EnvironmentSettings } from "../schemas"
import {
    accessGrant,
    accessDirectoryFor,
    markAccessGrantUsed,
    registerAccessGrant,
    revokeAccessGrant,
    type AccessGrantInput,
} from "./access-registry"

/**
 * Acesso temporário protegido das operações. O servidor **não** grava mais esses arquivos: ele roda
 * em outro filesystem que o agente (app em container × OpenCode no host), então o agente busca o
 * envelope **uma única vez** com um token da operação e materializa os arquivos no host dele.
 * Ver `aicontext/modules/environments.md`.
 */

/** Executado SOMENTE pelo agente, no host OpenCode. Opex apenas entrega o conteúdo do acesso. */
const SSH_HELPER = `#!/usr/bin/env node
const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path');
const dir = __dirname, data = JSON.parse(fs.readFileSync(path.join(dir, 'access.json'), 'utf8'));
if (Date.now() > data.expiresAt) process.exit(124);
if (process.argv[2] === '--askpass') { process.stdout.write(data.passphrase || data.password || ''); process.exit(0); }
const args = ['-T', '-p', String(data.port), '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile='+path.join(dir,'known_hosts'), '-o', 'ConnectTimeout=20'];
if (data.privateKey) args.push('-i', path.join(dir,'identity'), '-o', 'IdentitiesOnly=yes');
else args.push('-o','PreferredAuthentications=password,keyboard-interactive','-o','PubkeyAuthentication=no');
args.push('--', data.username+'@'+data.host, ...process.argv.slice(2));
const child = cp.spawn('ssh', args, {stdio:['ignore','inherit','inherit'], env:{...process.env, SSH_ASKPASS:path.join(dir,'askpass'), SSH_ASKPASS_REQUIRE:'force', DISPLAY:':opex'}});
child.on('exit', code => process.exit(code ?? 1));
child.on('error', () => process.exit(1));
`

export interface AccessPayload {
    /** `null` quando o acesso não carrega variáveis (sessão de logs). */
    variables: Record<string, string> | null
    /** Só no acesso remoto: destino e credenciais SSH. */
    repo: Record<string, unknown> | null
    /** Helper de SSH que o agente grava como `ssh.cjs` (só no acesso remoto). */
    helper: string | null
    expiresAt: string
}

export interface AccessGrant {
    id: string
    dir: string
    token: string
    baseUrl: string
    ttlMinutes: number
    /** Valores secretos, para censurar o texto do agente antes de persistir. */
    secretValues: string[]
}

export function hashAccessToken(token: string): string {
    return createHash("sha256").update(token).digest("hex")
}

function sameHash(left: string, right: string): boolean {
    const a = Buffer.from(left, "utf8")
    const b = Buffer.from(right, "utf8")
    return a.length === b.length && timingSafeEqual(a, b)
}

/** URL base do agente (sem barra final) ou falha dizendo onde configurar. */
export function agentBaseUrl(settings: EnvironmentSettings): string {
    const base = settings.agentBaseUrl.trim().replace(/\/+$/, "")
    if (!base)
        throw new DomainError(
            409,
            "Informe a URL base do agente em Integrações › Provedores de IA › Administração de sistema",
            "AGENT_BASE_URL_MISSING",
        )
    return base
}

function parseSecrets(value: EncryptedSecret | null | undefined): Record<string, string> {
    if (!value) return {}
    try {
        return JSON.parse(decryptSecret(value)) as Record<string, string>
    } catch {
        throw new DomainError(409, "Não foi possível ler as credenciais salvas; substitua-as novamente")
    }
}

/** Credenciais SSH e variáveis secretas da operação (nunca toca no disco do servidor). */
async function readSecrets(context: AccessGrantInput) {
    await dbConnect()
    const config = await EnvironmentRepoConfig.findOne({ projectId: context.projectId }).select("+secrets").lean()
    const env = await Environment.findById(context.environmentId).select("+secretVariables").lean()
    return { secrets: parseSecrets(config?.secrets), secretVariables: parseSecrets(env?.secretVariables) }
}

/** Valores secretos conhecidos da operação, para `redact` do texto do agente. */
export async function readAccessSecrets(context: AccessGrantInput): Promise<string[]> {
    const { secrets, secretVariables } = await readSecrets(context)
    return [...Object.values(secrets), ...Object.values(secretVariables)]
}

/** Sem credenciais não há acesso remoto: falha antes de despachar o agente. */
export async function assertRemoteCredentials(context: AccessGrantInput): Promise<void> {
    if (context.repoConfig.mode !== "remote") return
    const { secrets } = await readSecrets(context)
    if (!(context.repoConfig.auth === "key" ? secrets.privateKey : secrets.password))
        throw new DomainError(409, "Credenciais SSH ausentes: solicite a configuração ao dono")
}

/** Conteúdo entregue ao agente quando ele busca o envelope. */
export async function buildAccessPayload(context: AccessGrantInput, expiresAt: number): Promise<AccessPayload> {
    const { secrets, secretVariables } = await readSecrets(context)
    const repo = context.repoConfig.mode === "remote" ? { ...context.repoConfig, ...secrets } : null
    const publicVariables = Object.fromEntries(
        (context.variables ?? []).filter((variable) => !variable.secret).map((variable) => [variable.name, variable.value]),
    )
    return {
        variables: context.variables ? { ...publicVariables, ...secretVariables } : null,
        repo,
        helper: repo ? SSH_HELPER : null,
        expiresAt: new Date(expiresAt).toISOString(),
    }
}

/**
 * Prepara o acesso de uma operação/sessão: diretório que o agente deve criar, token de uso único
 * (registrado só em memória) e os valores secretos para censura.
 */
export async function grantAccess(
    context: AccessGrantInput,
    settings: EnvironmentSettings,
    prefix: string,
): Promise<AccessGrant> {
    const baseUrl = agentBaseUrl(settings)
    await assertRemoteCredentials(context)
    const token = randomBytes(32).toString("base64url")
    const dir = accessDirectoryFor(settings.accessDirectory, prefix, context.id)
    registerAccessGrant({ ...context, dir }, hashAccessToken(token), settings.accessTokenTtlMinutes)
    return {
        id: context.id,
        dir,
        token,
        baseUrl,
        ttlMinutes: settings.accessTokenTtlMinutes,
        secretValues: await readAccessSecrets(context),
    }
}

export function releaseAccess(id: string): void {
    revokeAccessGrant(id)
}

/** Valida o token e devolve o envelope do acesso. Uso único: a segunda chamada é recusada. */
export async function consumeAccessToken(id: string, token: string): Promise<AccessPayload> {
    const grant = accessGrant(id)
    if (!grant || !sameHash(grant.tokenHash, hashAccessToken(token)))
        throw new DomainError(403, "Acesso temporário inválido", "ACCESS_TOKEN_REJECTED")
    if (grant.usedAt !== null) throw new DomainError(409, "Acesso temporário já utilizado", "ACCESS_TOKEN_REJECTED")
    if (grant.expiresAt <= Date.now()) throw new DomainError(410, "Acesso temporário expirado", "ACCESS_TOKEN_EXPIRED")
    markAccessGrantUsed(id)
    return buildAccessPayload(grant, grant.expiresAt)
}
