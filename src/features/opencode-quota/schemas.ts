import { z } from "zod"

/**
 * Snapshot v6 do `opencode-quota`, a resposta do RPC `refresh` (`{ snapshot }`). Tolerante: campos
 * desconhecidos passam e quase tudo é opcional, para uma versão nova do plugin não derrubar o painel.
 */
const amountSchema = z.looseObject({
    decimal: z.string(),
    unit: z.looseObject({ kind: z.string(), code: z.string().optional(), unit: z.string().optional(), symbol: z.string().optional() }).optional(),
})

const snapshotRowSchema = z.looseObject({
    id: z.string().optional(),
    providerId: z.string().optional(),
    account: z.string().nullish(),
    label: z.string().optional(),
    window: z.string().nullish(),
    percentRemaining: z.number().nullish(),
    used: amountSchema.nullish(),
    limit: amountSchema.nullish(),
    remaining: amountSchema.nullish(),
    amount: amountSchema.nullish(),
    flag: z.boolean().nullish(),
    text: z.string().nullish(),
    resetsAt: z.string().nullish(),
})

const snapshotErrorSchema = z.looseObject({
    code: z.string(),
    status: z.number().nullish(),
    retryAtMs: z.number().nullish(),
    tool: z.string().nullish(),
    missing: z.boolean().nullish(),
})

const snapshotProviderSchema = z.looseObject({
    providerId: z.string(),
    label: z.string().optional(),
    rows: z.array(snapshotRowSchema).default([]),
    okAtMs: z.number().nullish(),
    checkedAtMs: z.number().nullish(),
    error: snapshotErrorSchema.nullish(),
    refreshing: z.boolean().optional(),
})

export const quotaSnapshotSchema = z.looseObject({
    version: z.literal(6),
    providers: z.array(snapshotProviderSchema),
})

/** Resposta do método `refresh` do RPC. */
export const quotaRpcOutputSchema = z.looseObject({ snapshot: z.unknown() })

export type QuotaSnapshot = z.infer<typeof quotaSnapshotSchema>
export type QuotaSnapshotProvider = z.infer<typeof snapshotProviderSchema>
export type QuotaSnapshotRow = z.infer<typeof snapshotRowSchema>
export type QuotaSnapshotError = z.infer<typeof snapshotErrorSchema>
export type QuotaAmount = z.infer<typeof amountSchema>

/**
 * Preferência do painel salva no navegador: card recolhido e ids dos provedores recolhidos (provedor
 * novo nasce expandido). `collapsedProviders` tem padrão para aceitar o formato antigo `{ collapsed }`.
 */
export const quotaPanelPrefsSchema = z.object({ collapsed: z.boolean(), collapsedProviders: z.array(z.string()).default([]) })
export type QuotaPanelPrefs = z.infer<typeof quotaPanelPrefsSchema>
