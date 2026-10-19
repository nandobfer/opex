import { decryptSecret, type EncryptedSecret } from "@/lib/crypto/secretBox"
import { dbConnect } from "@/lib/db"
import { EnvironmentRepoConfig } from "@/lib/db/models/EnvironmentRepoConfig"
import { Environment } from "@/lib/db/models/Environment"
import { DomainError } from "@/lib/api/route"
import type { EnvironmentInput, RepoConfigInput } from "../schemas"

/**
 * Conteúdo do acesso temporário protegido. O servidor do Opex roda em outro filesystem que o agente
 * (app em container × OpenCode no host), então os arquivos são gravados **no host pelo shell do
 * OpenCode** (`server/host.ts`), nunca no disco do servidor. Ver `aicontext/modules/environments.md`.
 */

/** Executado SOMENTE no host do OpenCode (pelo agente ou pelos comandos de leitura do Opex). */
export const SSH_HELPER = `#!/usr/bin/env node
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

/** Escopo do acesso: de qual ambiente/repositório e o que ele carrega. */
export interface AccessScope {
    environmentId: string
    projectId: string
    repoConfig: RepoConfigInput
    /** Variáveis congeladas na operação; `null` não grava `variables.json` (ex.: sessão de logs). */
    variables: EnvironmentInput["variables"] | null
}

/** Arquivo a gravar no diretório de acesso: conteúdo e permissão. */
export interface AccessFile {
    content: string
    mode: number
}

/** Prazo máximo do acesso remoto (o helper SSH recusa depois disso). */
const ACCESS_TTL_MS = 5 * 60 * 60_000

function parseSecrets(value: EncryptedSecret | null | undefined): Record<string, string> {
    if (!value) return {}
    try {
        return JSON.parse(decryptSecret(value)) as Record<string, string>
    } catch {
        throw new DomainError(409, "Não foi possível ler as credenciais salvas; substitua-as novamente")
    }
}

async function readSecrets(scope: AccessScope) {
    await dbConnect()
    const config = await EnvironmentRepoConfig.findOne({ projectId: scope.projectId }).select("+secrets").lean()
    const env = await Environment.findById(scope.environmentId).select("+secretVariables").lean()
    return { secrets: parseSecrets(config?.secrets), secretVariables: parseSecrets(env?.secretVariables) }
}

/** Valores secretos conhecidos do escopo, para `redact` das saídas do host e do agente. */
export async function readAccessSecrets(scope: AccessScope): Promise<string[]> {
    const { secrets, secretVariables } = await readSecrets(scope)
    return [...Object.values(secrets), ...Object.values(secretVariables)].filter(Boolean)
}

/**
 * Arquivos do acesso: `variables.json` (variáveis públicas + secretas, quando o escopo tem variáveis)
 * e, no acesso remoto, `access.json`, `identity`, `known_hosts`, `ssh.cjs` e `askpass`.
 */
export async function buildAccessFiles(
    scope: AccessScope,
    dir: string,
    now = Date.now(),
): Promise<{ files: Record<string, AccessFile>; secretValues: string[] }> {
    const { secrets, secretVariables } = await readSecrets(scope)
    const remote = scope.repoConfig.mode === "remote"
    if (remote && !(scope.repoConfig.auth === "key" ? secrets.privateKey : secrets.password))
        throw new DomainError(409, "Credenciais SSH ausentes: solicite a configuração ao dono", "ACCESS_WRITE_FAILED")
    const files: Record<string, AccessFile> = {}
    if (scope.variables) {
        const publicVariables = Object.fromEntries(
            scope.variables.filter((variable) => !variable.secret).map((variable) => [variable.name, variable.value]),
        )
        files["variables.json"] = { content: JSON.stringify({ ...publicVariables, ...secretVariables }), mode: 0o600 }
    }
    if (remote) {
        files["access.json"] = {
            content: JSON.stringify({ ...scope.repoConfig, ...secrets, expiresAt: now + ACCESS_TTL_MS }),
            mode: 0o600,
        }
        if (secrets.privateKey) files.identity = { content: `${secrets.privateKey}\n`, mode: 0o600 }
        files.known_hosts = { content: `${scope.repoConfig.hostKey}\n`, mode: 0o600 }
        files["ssh.cjs"] = { content: SSH_HELPER, mode: 0o700 }
        files.askpass = {
            content: `#!/bin/sh\nexec node '${`${dir}/ssh.cjs`.replace(/'/g, "'\\''")}' --askpass\n`,
            mode: 0o700,
        }
    }
    return { files, secretValues: [...Object.values(secrets), ...Object.values(secretVariables)].filter(Boolean) }
}
