import { Schema, model, models, type Model } from "mongoose"
import type { ChannelMapEntry, ExportDigest, MigrationDirection, SubscriptionPlanItem } from "../../channel-migration/plan"

/**
 * Execução da migração B (OPE-206): uma por clique em "Migrar canais" (ou "Desfazer migração"), retomável. Guarda o
 * mapa dos canais, as assinaturas trocadas, os conflitos, o resumo dos dois exports (só ids, canais e hashes; o texto
 * fica no host) e o relatório. Coleção `engramind_channel_migrations`.
 */

export const CHANNEL_MIGRATION_STEPS = ["backup", "maintenance", "map", "destinations", "subscriptions", "moves", "unsubscribe", "mongo", "verify", "archive", "finished"] as const
export type ChannelMigrationStep = (typeof CHANNEL_MIGRATION_STEPS)[number]
export type ChannelMigrationStatus = "running" | "verify_failed" | "failed" | "done" | "done_with_conflicts"

export interface ChannelMigrationConflict {
    id: string
    channel: string
    code: string
    existingId: string | null
}

export interface IChannelMapItem extends ChannelMapEntry {
    /** A origem arquivada foi restaurada para mover (é arquivada de novo no fim). */
    restoredOrigin: boolean
    /** Destino criado/restaurado e com as configurações copiadas. */
    ready: boolean
    /** Todas as memórias da origem foram tratadas (movidas ou em conflito). */
    moved: boolean
}

export interface IChannelMigration {
    _id: string
    direction: MigrationDirection
    /** Volta atrás: a migração de ida desfeita. */
    revertOf: string | null
    status: ChannelMigrationStatus
    step: ChannelMigrationStep
    app: string
    scriptPath: string
    map: IChannelMapItem[]
    tooLong: string[]
    movedCount: number
    conflicts: ChannelMigrationConflict[]
    subscriptions: SubscriptionPlanItem[]
    backup: (ExportDigest & { at: Date }) | null
    verify: { file: string; totals: ExportDigest["totals"]; ok: boolean; problems: string[]; at: Date } | null
    mongo: Record<string, number> | null
    archived: string[]
    log: { at: Date; step: string; message: string }[]
    error: string | null
    instance: string | null
    beatAt: Date | null
    startedAt: Date
    finishedAt: Date | null
}

const schema = new Schema<IChannelMigration>(
    {
        _id: { type: String, required: true },
        direction: { type: String, required: true },
        revertOf: { type: String, default: null },
        status: { type: String, required: true },
        step: { type: String, required: true },
        app: { type: String, required: true },
        scriptPath: { type: String, required: true },
        map: { type: Schema.Types.Mixed, default: [] },
        tooLong: { type: [String], default: [] },
        movedCount: { type: Number, default: 0 },
        conflicts: { type: Schema.Types.Mixed, default: [] },
        subscriptions: { type: Schema.Types.Mixed, default: [] },
        backup: { type: Schema.Types.Mixed, default: null },
        verify: { type: Schema.Types.Mixed, default: null },
        mongo: { type: Schema.Types.Mixed, default: null },
        archived: { type: [String], default: [] },
        log: { type: Schema.Types.Mixed, default: [] },
        error: { type: String, default: null },
        instance: { type: String, default: null },
        beatAt: { type: Date, default: null },
        startedAt: { type: Date, required: true },
        finishedAt: { type: Date, default: null },
    },
    { collection: "engramind_channel_migrations", versionKey: false },
)
schema.index({ startedAt: -1 })

export const ChannelMigration: Model<IChannelMigration> = (models.EngramindChannelMigration as Model<IChannelMigration>) ?? model<IChannelMigration>("EngramindChannelMigration", schema)
