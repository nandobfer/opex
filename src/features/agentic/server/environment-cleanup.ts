import type { IAgenticWorkbench, IPreviewBackup } from "@/lib/db/models/Agentic"
import { backupRemovedCommand, shellQuote } from "../preview-backup"
import type { WorkbenchContext } from "../prompts"
import type { CentralConfig } from "../schemas"

/**
 * Limpeza de ambiente compartilhada pela conclusão (merge) e pela exclusão da mesa (OPE-68).
 *
 * Decide o que remover a partir do que a mesa **realmente criou** (nunca caminhos apenas inferidos:
 * uma mesa que parou no planejamento não tem worktree/branch) e monta os comandos que **confirmam**
 * a ausência dos recursos depois do turno de limpeza — a exclusão não se apoia só no bloco JSON do
 * agente. A checagem é idempotente: um recurso já ausente conta como removido.
 */

/** Recursos que a limpeza de uma mesa remove, conforme as opções da central e o que a mesa criou. */
export interface CleanupTargets {
    /** Backup do MongoDB da prévia: sempre removido, mesmo com toda a limpeza de ambiente desligada. */
    backup: IPreviewBackup | null
    /** Derrubar os containers da prévia (só quando a mesa chegou a preparar um build). */
    teardownEnvironment: boolean
    /** Worktree registrado na mesa (a remover quando a central manda e a mesa o criou). */
    worktreePath: string | null
    /** Branch local registrada na mesa (a remover quando a central manda e a mesa a criou). */
    branch: string | null
}

/** Campos da mesa consultados pela limpeza. */
export type CleanupDoc = Pick<IAgenticWorkbench, "previewBackup" | "previewBuild" | "previewUrl" | "port" | "worktreePath" | "branch">

/**
 * Alvos da limpeza de uma mesa. O worktree e a branch só entram quando foram **registrados** pela
 * mesa; os containers só são derrubados quando a mesa chegou a preparar um build (que pode ter
 * falhado sem registrar `previewUrl`).
 */
export function cleanupTargets(config: CentralConfig, doc: CleanupDoc): CleanupTargets {
    const built = Boolean(doc.previewBuild || doc.previewUrl || doc.port)
    return {
        backup: doc.previewBackup ?? null,
        teardownEnvironment: config.cleanup.teardownEnvironment && built,
        worktreePath: config.cleanup.removeWorktree ? (doc.worktreePath ?? null) : null,
        branch: config.cleanup.deleteBranch ? (doc.branch ?? null) : null,
    }
}

/** Há algo a limpar? Sem alvos, a mesa pode ser removida na hora (nenhum turno do agente). */
export function hasCleanupWork(targets: CleanupTargets): boolean {
    return Boolean(targets.backup || targets.teardownEnvironment || targets.worktreePath || targets.branch)
}

/**
 * Comandos (na máquina do OpenCode) que confirmam que a limpeza terminou: o backup não existe, o
 * worktree sumiu, a branch local sumiu e não sobrou nenhum container do projeto. Todos idempotentes.
 */
export function cleanupVerificationCommands(targets: CleanupTargets, composeProject: string): string[] {
    const commands: string[] = []
    if (targets.backup) commands.push(backupRemovedCommand(targets.backup.path))
    if (targets.worktreePath) commands.push(`test ! -e ${shellQuote(targets.worktreePath)}`)
    if (targets.branch) commands.push(`! git show-ref --verify --quiet ${shellQuote(`refs/heads/${targets.branch}`)}`)
    if (targets.teardownEnvironment) commands.push(`test -z "$(docker ps -q --filter ${shellQuote(`label=com.docker.compose.project=${composeProject}`)})"`)
    return commands
}

/**
 * Contexto do prompt de limpeza da exclusão: worktree e branch só aparecem quando a mesa os
 * registrou (vazio = a mesa não chegou a criá-los, então o passo é omitido).
 */
export function deletionContext(ctx: WorkbenchContext, targets: CleanupTargets): WorkbenchContext {
    return { ...ctx, worktreePath: targets.worktreePath ?? "", branch: targets.branch ?? "" }
}
