import { DomainError } from "@/lib/api/route"
import { clearAiCatalogCache } from "@/lib/ai/catalog"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { publishAppEvent } from "@/lib/pusher/channels"
import { addBackup, backupArchivePath, backupIndexPath, newBackupId, parseBackupIndex, type BackupMeta } from "../backups"
import { backupCommand, quote, removeFilesCommand, restoreCommand } from "../commands"
import { OPENCODE_BACKUP_AUDIT_ENTITY, OPENCODE_BACKUPS_UPDATED_EVENT, OPENCODE_RESOURCES_UPDATED_EVENT } from "../constants"
import type { OpencodeBackupDto } from "../types"
import { openHost, runOrFail, type OpencodeHost } from "./host"
import { withConfigLock } from "./lock"

/**
 * Backup automático antes de cada alteração: `tar.gz` dos caminhos afetados, no host
 * (`~/.local/share/opencode/opex-backups`), com índice JSON. Os segredos dos MCPs continuam só no host.
 */

export const toBackupDto = (meta: BackupMeta): OpencodeBackupDto => ({ id: meta.id, createdAt: meta.createdAt, action: meta.action, label: meta.label, paths: meta.paths, size: meta.size })

async function existing(host: OpencodeHost, paths: readonly string[]): Promise<Set<string>> {
    if (paths.length === 0) return new Set()
    const output = await runOrFail(host, `for p in ${paths.map(quote).join(" ")}; do { [ -e "$p" ] || [ -L "$p" ]; } && printf '%s\\n' "$p"; done; true`, "Não foi possível conferir os arquivos do backup", 15_000, { quiet: true })
    return new Set(output.split("\n").map((line) => line.trim()).filter(Boolean))
}

/** Cria o backup (chamar DENTRO de `withConfigLock`). Devolve o id. */
export async function createBackup(host: OpencodeHost, input: { action: string; label: string; paths: readonly string[] }): Promise<string> {
    const paths = [...new Set(input.paths.filter(Boolean))]
    const present = await existing(host, paths)
    const id = newBackupId()
    const archive = backupArchivePath(host.home, id)
    const sizeText = await runOrFail(host, backupCommand(archive, paths), "Não foi possível criar o backup da configuração", 60_000)
    const size = Number.parseInt(sizeText.trim().split("\n").at(-1) ?? "", 10)
    const meta: BackupMeta = { id, createdAt: new Date().toISOString(), action: input.action, label: input.label, paths, absent: paths.filter((path) => !present.has(path)), size: Number.isFinite(size) ? size : null }
    const { index, dropped } = addBackup(parseBackupIndex(await host.readText(backupIndexPath(host.home))), meta)
    await host.writeText(backupIndexPath(host.home), `${JSON.stringify(index, null, 2)}\n`)
    if (dropped.length) await host.run(removeFilesCommand(dropped.map((item) => backupArchivePath(host.home, item))), 15_000, { quiet: true })
    await publishAppEvent(OPENCODE_BACKUPS_UPDATED_EVENT, {})
    return id
}

/** Desfaz uma alteração que deixou a configuração inválida (sem backup de segurança). */
export async function rollbackTo(host: OpencodeHost, id: string): Promise<void> {
    const meta = parseBackupIndex(await host.readText(backupIndexPath(host.home))).backups.find((item) => item.id === id)
    if (!meta) return
    await runOrFail(host, restoreCommand(backupArchivePath(host.home, meta.id), meta.absent), "Não foi possível desfazer a alteração", 60_000)
}

export async function listBackups(): Promise<OpencodeBackupDto[]> {
    const host = await openHost()
    return parseBackupIndex(await host.readText(backupIndexPath(host.home))).backups.map(toBackupDto)
}

/** Restaura um backup (antes, faz backup do estado atual dos mesmos caminhos). */
export async function restoreBackup(id: string, actor: { id: string; origin: string }): Promise<{ restored: OpencodeBackupDto; safetyBackupId: string }> {
    return withConfigLock(async () => {
        const host = await openHost()
        const meta = parseBackupIndex(await host.readText(backupIndexPath(host.home))).backups.find((item) => item.id === id)
        if (!meta) throw new DomainError(404, "Backup não encontrado", "OPENCODE_BACKUP_NOT_FOUND")
        const safetyBackupId = await createBackup(host, { action: "restaurar", label: `Antes de restaurar o backup de ${meta.createdAt}`, paths: meta.paths })
        await runOrFail(host, restoreCommand(backupArchivePath(host.home, meta.id), meta.absent), "Não foi possível restaurar o backup", 60_000)
        await host.client.location.reload().catch(() => undefined)
        clearAiCatalogCache()
        await recordAudit({ userId: actor.id, entidade: OPENCODE_BACKUP_AUDIT_ENTITY, entidadeId: meta.id, acao: AcaoAuditoria.EXECUTAR, depois: { acao: "restaurar", backup: meta.id, caminhos: meta.paths, backupDeSeguranca: safetyBackupId, origem: actor.origin } })
        await publishAppEvent(OPENCODE_RESOURCES_UPDATED_EVENT, { kind: "all", scope: "all" })
        return { restored: toBackupDto(meta), safetyBackupId }
    })
}
