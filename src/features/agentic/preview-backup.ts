import type { CentralConfig } from "./schemas"

/**
 * Backup do MongoDB da prévia (OPE-54), regras puras (cliente e servidor): o dump é criado pelo
 * agente ANTES de publicar a prévia, em uma pasta exclusiva da mesa **fora do worktree** — assim
 * nunca entra em commit nem é derrubado pelo `git worktree remove` — e é removido na conclusão.
 */

/** Pasta (oculta) dos backups de prévia, ao lado dos worktrees. */
export const PREVIEW_BACKUP_DIR = ".opex-backups"
/** Nome do arquivo único do dump (`mongodump --archive`). */
export const PREVIEW_BACKUP_FILE = "opex-preview-backup.archive"

/** Aspas simples para o shell (mesma regra usada no teste da central). */
export const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

/** Código da tarefa em forma segura para nome de pasta. */
function safeCode(code: string): string {
    return (
        code
            .trim()
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/^[-.]+|[-.]+$/g, "") || "mesa"
    )
}

/** Raiz dos backups: `<pasta dos worktrees>/.opex-backups`. */
export function previewBackupRoot(config: CentralConfig): string {
    const root = config.worktreeRoot || `${config.sessionDirectory}/worktrees`
    return `${root}/${PREVIEW_BACKUP_DIR}`
}

/**
 * Pasta exclusiva de um ciclo de backup da mesa. O `token` é único por ciclo (reserva nova a cada
 * abertura/reabertura), evitando reaproveitar resíduos de um ciclo anterior.
 */
export function previewBackupDir(config: CentralConfig, code: string, token: string): string {
    return `${previewBackupRoot(config)}/${safeCode(code)}/${token}`
}

/** Caminho do arquivo de dump dentro da pasta do ciclo. */
export function previewBackupFile(dir: string): string {
    return `${dir}/${PREVIEW_BACKUP_FILE}`
}

/** Comando que confirma que o dump existe e não está vazio. */
export function backupExistsCommand(path: string): string {
    return `test -s ${shellQuote(path)}`
}

/** Comando que confirma que o dump foi removido (ausente conta como sucesso, idempotente). */
export function backupRemovedCommand(path: string): string {
    return `test ! -e ${shellQuote(path)}`
}
