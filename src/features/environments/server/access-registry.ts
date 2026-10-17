import { join } from "node:path"
import type { EnvironmentInput, RepoConfigInput } from "../schemas"

/**
 * Registro **em memória** do acesso temporário das operações de Ambientes.
 *
 * O servidor não escreve mais o envelope em disco: ele roda em container e o agente do OpenCode roda
 * no host do dono (filesystems diferentes — ver `aicontext/modules/environments.md`). O agente busca
 * o envelope **uma única vez** por uma rota autenticada por este token e materializa os arquivos no
 * host dele. O token nunca é persistido (só o hash, e só em memória) e morre com o processo: um
 * reinício no meio da operação cai na reconciliação, que emite um acesso novo.
 */

export interface AccessGrantInput {
    /** Identificador do dono do acesso (operação ou sessão de logs). */
    id: string
    environmentId: string
    projectId: string
    repoConfig: RepoConfigInput
    /** Variáveis do ambiente congeladas na operação (valores públicos); `null` não envia variáveis. */
    variables: EnvironmentInput["variables"] | null
}

export interface AccessGrantContext extends AccessGrantInput {
    /** Diretório protegido que o **agente** cria no host dele. */
    dir: string
}

interface Grant extends AccessGrantContext {
    tokenHash: string
    expiresAt: number
    usedAt: number | null
}

const grants = new Map<string, Grant>()

/** Registra um acesso de uso único e devolve o token em claro (vai apenas para o prompt do agente). */
export function registerAccessGrant(
    context: AccessGrantContext,
    tokenHash: string,
    ttlMinutes: number,
    now = Date.now(),
): void {
    grants.set(context.id, { ...context, tokenHash, expiresAt: now + ttlMinutes * 60_000, usedAt: null })
}

export function accessGrant(id: string): Grant | undefined {
    return grants.get(id)
}

/** Marca o acesso como utilizado (uso único). */
export function markAccessGrantUsed(id: string, now = Date.now()): void {
    const grant = grants.get(id)
    if (grant) grant.usedAt = now
}

export function revokeAccessGrant(id: string): void {
    grants.delete(id)
}

/** Remove acessos expirados/consumidos (chamado pelo tick das rotinas). */
export function sweepAccessGrants(now = Date.now()): number {
    let removed = 0
    for (const [id, grant] of grants)
        if (grant.expiresAt <= now || grant.usedAt !== null) {
            grants.delete(id)
            removed += 1
        }
    return removed
}

/** Diretório protegido do acesso, no host do agente (`settings.accessDirectory`/`<prefixo>-<id>`). */
export function accessDirectoryFor(accessDirectory: string, prefix: string, id: string): string {
    return join(accessDirectory, `${prefix}-${id}`)
}
