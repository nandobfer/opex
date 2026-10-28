import { z } from "zod"

/**
 * Export público do `opencode-quota` (versões 2 e 3 do formato). Tolerante: campos desconhecidos
 * passam e quase tudo é opcional, para uma versão nova do plugin não derrubar o painel.
 */
const exportEntrySchema = z.looseObject({
    id: z.string().optional(),
    name: z.string().optional(),
    account: z.string().nullish(),
    resultType: z.string().optional(),
    window: z.string().nullish(),
    resetAt: z.number().nullish(),
    renderType: z.string().optional(),
    percentRemaining: z.number().nullish(),
    value: z.string().nullish(),
})

const exportProviderSchema = z.looseObject({
    status: z.string(),
    fetchedAt: z.number().nullish(),
    entries: z.array(exportEntrySchema).optional(),
    error: z.string().nullish(),
    errors: z.array(z.union([z.string(), z.looseObject({ message: z.string().optional() })])).optional(),
})

export const quotaExportSchema = z.looseObject({
    version: z.number(),
    exportedAt: z.number().nullish(),
    providers: z.record(z.string(), exportProviderSchema),
})

export type QuotaExport = z.infer<typeof quotaExportSchema>
export type QuotaExportEntry = z.infer<typeof exportEntrySchema>
export type QuotaExportProvider = z.infer<typeof exportProviderSchema>

/**
 * Preferência do painel salva no navegador: card recolhido e ids dos provedores recolhidos (provedor
 * novo nasce expandido). `collapsedProviders` tem padrão para aceitar o formato antigo `{ collapsed }`.
 */
export const quotaPanelPrefsSchema = z.object({ collapsed: z.boolean(), collapsedProviders: z.array(z.string()).default([]) })
export type QuotaPanelPrefs = z.infer<typeof quotaPanelPrefsSchema>
