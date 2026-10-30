import { z } from "zod"
import { OPENCODE_BACKUP_DIR, OPENCODE_BACKUPS_KEEP } from "./constants"

/** Índice dos backups da configuração do OpenCode (mora no host, ao lado dos arquivos). Módulo puro. */

const metaSchema = z.object({
    id: z.string(),
    createdAt: z.string(),
    action: z.string(),
    label: z.string(),
    /** Caminhos incluídos no backup. */
    paths: z.array(z.string()),
    /** Caminhos que não existiam (a restauração os apaga). */
    absent: z.array(z.string()).default([]),
    size: z.number().nullable().default(null),
})
export type BackupMeta = z.infer<typeof metaSchema>

const indexSchema = z.object({ version: z.literal(1), backups: z.array(metaSchema) })
export type BackupIndex = z.infer<typeof indexSchema>

export function parseBackupIndex(text: string | null): BackupIndex {
    if (!text?.trim()) return { version: 1, backups: [] }
    try {
        const parsed = indexSchema.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data : { version: 1, backups: [] }
    } catch {
        return { version: 1, backups: [] }
    }
}

export const backupDir = (home: string) => `${home.replace(/\/+$/, "")}/${OPENCODE_BACKUP_DIR}`
export const backupIndexPath = (home: string) => `${backupDir(home)}/index.json`
export const backupArchivePath = (home: string, id: string) => `${backupDir(home)}/${id}.tgz`

export function newBackupId(now = new Date(), random = Math.random()): string {
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")
    return `${stamp}-${Math.floor(random * 0xffff).toString(16).padStart(4, "0")}`
}

/** Acrescenta e corta os mais antigos; devolve o índice novo e os ids descartados. */
export function addBackup(index: BackupIndex, meta: BackupMeta, keep = OPENCODE_BACKUPS_KEEP): { index: BackupIndex; dropped: string[] } {
    const all = [meta, ...index.backups.filter((item) => item.id !== meta.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { index: { version: 1, backups: all.slice(0, keep) }, dropped: all.slice(keep).map((item) => item.id) }
}
