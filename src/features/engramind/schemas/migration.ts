import { z } from "zod"

/** Contratos da aba "Migração de memórias" (OPE-104): mesmos schemas na tela e nas rotas. */

/** Provedores do curador (os mesmos do Redator: OpenCode e Jev ficam de fora). */
export const CURATOR_PROVIDERS = ["gemini", "anthropic", "openai", "deepseek"] as const
export type CuratorProvider = (typeof CURATOR_PROVIDERS)[number]

export const curatorRunSchema = z.object({
    provider: z.enum(CURATOR_PROVIDERS, { error: "Escolha o provedor (OpenCode e Jev não entram)" }),
    model: z.string().trim().min(1, "Escolha o modelo").max(200),
    variant: z.string().trim().max(50).nullish(),
})
export type CuratorRunInput = z.infer<typeof curatorRunSchema>

export const MIGRATION_REVIEW_STATUSES = ["pendente", "aprovada", "rejeitada"] as const
export type MigrationReviewStatus = (typeof MIGRATION_REVIEW_STATUSES)[number]

export const migrationItemPatchSchema = z.object({
    items: z
        .array(
            z.object({
                id: z.string().trim().min(1).max(40),
                status: z.enum(MIGRATION_REVIEW_STATUSES).optional(),
                texto: z.string().trim().min(1, "Escreva a memória").max(20_000).nullish(),
                categoria: z.string().trim().min(1).max(40).nullish(),
            }),
        )
        .min(1)
        .max(500),
})
export type MigrationItemPatch = z.infer<typeof migrationItemPatchSchema>

export const migrationBulkSchema = z.object({
    list: z.string().trim().min(1).max(60),
    centralId: z.string().trim().max(40).nullish(),
    status: z.enum(["aprovada", "rejeitada"]),
    /** Inclui as `descartar`/`revisar_dono` (por padrão o lote não decide por elas). */
    includeAttention: z.boolean().optional(),
})
export type MigrationBulkInput = z.infer<typeof migrationBulkSchema>

export const migrationCompactSchema = z.object({ combination: z.string().trim().min(1).max(80) })
export const migrationImportSchema = z.object({ confirm: z.literal(true, { error: "Confirme a importação" }) })
