import { runOpencodeShell, type OpencodeClient } from "@/lib/ai/opencode-client"
import { AgenticWorkbench, type IAgenticWorkbench, type IPreviewBackup } from "@/lib/db/models/Agentic"
import { randomId } from "@/lib/random-id"
import { backupExistsCommand, backupRemovedCommand, previewBackupDir, previewBackupFile } from "../preview-backup"
import type { CentralConfig } from "../schemas"

/**
 * Backup do MongoDB da prévia (OPE-54): reserva do caminho (antes do build) e conferência do arquivo
 * na máquina do OpenCode. O dump é criado pelo agente; aqui garantimos que ele existe antes de
 * considerar a prévia publicada e que foi removido antes de concluir a mesa.
 */

/** Confirma, no host do OpenCode, se o comando responde com sucesso. */
async function shellOk(client: OpencodeClient, directory: string, command: string): Promise<boolean> {
    const result = await runOpencodeShell(client, directory, command, { timeoutMs: 15_000 })
    return result.exitCode === 0
}

/** Mesa (ou o mínimo dela) usada pela reserva do backup. */
type PreviewBackupDoc = Pick<IAgenticWorkbench, "_id" | "taskCode" | "previewBackup">

/**
 * Reserva o backup da prévia da mesa (persistido antes do build). Uma reserva existente é
 * **preservada**: é o backup da primeira publicação, que as correções e retentativas reutilizam.
 */
export async function reservePreviewBackup(doc: PreviewBackupDoc, config: CentralConfig): Promise<IPreviewBackup> {
    if (doc.previewBackup?.path) return doc.previewBackup
    const dir = previewBackupDir(config, doc.taskCode, randomId())
    const backup: IPreviewBackup = { dir, path: previewBackupFile(dir), createdAt: new Date() }
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { previewBackup: backup } })
    return backup
}

/** Confirma que o dump existe e não está vazio; lança quando faltar (a prévia não vale sem backup). */
export async function assertPreviewBackup(client: OpencodeClient, backup: IPreviewBackup, directory: string): Promise<void> {
    if (!(await shellOk(client, directory, backupExistsCommand(backup.path)))) {
        throw new Error(`O dump do MongoDB não foi criado em ${backup.path}`)
    }
}

/** Confirma que o dump foi removido; lança enquanto o arquivo existir. */
export async function assertPreviewBackupRemoved(client: OpencodeClient, backup: IPreviewBackup, directory: string): Promise<void> {
    if (!(await shellOk(client, directory, backupRemovedCommand(backup.path)))) {
        throw new Error(`O backup da prévia ainda existe em ${backup.path}`)
    }
}
