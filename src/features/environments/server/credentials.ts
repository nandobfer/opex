import { chmod, mkdir, mkdtemp, writeFile, rm, lstat } from "node:fs/promises"
import { join, resolve } from "node:path"
import { decryptSecret } from "@/lib/crypto/secretBox"
import { EnvironmentRepoConfig } from "@/lib/db/models/EnvironmentRepoConfig"
import { Environment } from "@/lib/db/models/Environment"
import { DomainError } from "@/lib/api/route"
import type { IEnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"

/** Executado SOMENTE pelo agente, no host OpenCode. Opex apenas provisiona arquivos de acesso. */
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

export async function provisionAccess(op: IEnvironmentOperation, root: string) {
    const config = await EnvironmentRepoConfig.findOne({ projectId: op.projectId }).select("+secrets").lean()
    const env = await Environment.findById(op.environmentId).select("+secretVariables").lean()
    const secrets = config?.secrets ? (JSON.parse(decryptSecret(config.secrets)) as Record<string, string>) : {}
    const variables = env?.secretVariables
        ? (JSON.parse(decryptSecret(env.secretVariables)) as Record<string, string>)
        : {}
    if (op.repoConfig.mode === "remote" && !(op.repoConfig.auth === "key" ? secrets.privateKey : secrets.password))
        throw new DomainError(409, "Credenciais SSH ausentes: solicite a configuração ao dono")
    const absolute = resolve(root)
    await mkdir(absolute, { recursive: true, mode: 0o700 })
    const info = await lstat(absolute)
    if (
        info.isSymbolicLink() ||
        !info.isDirectory() ||
        (typeof process.getuid === "function" && info.uid !== process.getuid()) ||
        (info.mode & 0o077) !== 0
    )
        throw new DomainError(409, "Diretório de acesso temporário precisa de permissão 0700")
    const dir = await mkdtemp(join(absolute, "operation-"))
    await chmod(dir, 0o700)
    try {
        await writeFile(
            join(dir, "variables.json"),
            JSON.stringify({
                ...Object.fromEntries(op.config.variables.filter((v) => !v.secret).map((v) => [v.name, v.value])),
                ...variables,
            }),
            { mode: 0o600 },
        )
        if (op.repoConfig.mode === "remote") {
            await writeFile(
                join(dir, "access.json"),
                JSON.stringify({ ...op.repoConfig, ...secrets, expiresAt: Date.now() + 5 * 60 * 60_000 }),
                { mode: 0o600 },
            )
            if (secrets.privateKey) await writeFile(join(dir, "identity"), secrets.privateKey + "\n", { mode: 0o600 })
            await writeFile(join(dir, "known_hosts"), op.repoConfig.hostKey + "\n", { mode: 0o600 })
            await writeFile(join(dir, "ssh.cjs"), SSH_HELPER, { mode: 0o700 })
            await writeFile(
                join(dir, "askpass"),
                `#!/bin/sh\nexec node '${join(dir, "ssh.cjs").replace(/'/g, "'\\''")}' --askpass\n`,
                { mode: 0o700 },
            )
        }
        return {
            dir,
            secretValues: [...Object.values(secrets), ...Object.values(variables)],
            cleanup: () => removeAccess(dir, absolute),
        }
    } catch (error) {
        await removeAccess(dir, absolute)
        throw error
    }
}
export async function removeAccess(dir: string, root: string): Promise<void> {
    const absolute = resolve(root)
    if (
        !resolve(dir).startsWith(absolute + "/operation-") ||
        resolve(dir)
            .slice(absolute.length + 1)
            .includes("/")
    )
        throw new Error("Acesso temporário fora do escopo")
    await rm(dir, { recursive: true, force: true })
}
