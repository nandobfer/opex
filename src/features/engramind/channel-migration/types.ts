import type { ChannelNamespace } from "../channel-namespace"
import type { MigrationDirection } from "./plan"

/** DTOs da migração dos nomes dos canais (OPE-206). Sem o resumo das memórias: só totais, mapa e relatório. */

export type ChannelMigrationStatusDto = "running" | "interrupted" | "verify_failed" | "failed" | "done" | "done_with_conflicts"

export interface ChannelMigrationDto {
    id: string
    direction: MigrationDirection
    status: ChannelMigrationStatusDto
    step: string
    app: string
    startedAt: string
    finishedAt: string | null
    error: string | null
    backup: { file: string; memories: number; byStatus: Record<string, number> } | null
    verify: { file: string; memories: number; byStatus: Record<string, number>; ok: boolean; problems: string[] } | null
    channels: { from: string; to: string; wasArchived: boolean; moved: boolean }[]
    tooLong: string[]
    movedCount: number
    conflicts: { id: string; channel: string; code: string; existingId: string | null }[]
    subscriptions: { agent: string; fromTarget: string; toTarget: string; mode: string; foreign: boolean; created: boolean; removed: boolean }[]
    archived: string[]
    mongo: Record<string, number> | null
    log: { at: string; step: string; message: string }[]
}

export interface ChannelMigrationStateDto {
    namespace: ChannelNamespace
    scriptPath: string | null
    current: ChannelMigrationDto | null
    /** Há uma migração de ida concluída para desfazer. */
    canRevert: boolean
    /** Os canais ainda usam os nomes antigos e há o que migrar. */
    canMigrate: boolean
}
