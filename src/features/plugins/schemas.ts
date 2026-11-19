import { z } from "zod"
import { PLUGIN_SCOPES } from "./constants"

/** Payloads das rotas de plugins (OPE-172). */

export const pluginListQuerySchema = z.object({
    scope: z.enum(PLUGIN_SCOPES).optional(),
    clientId: z.string().trim().min(1).optional(),
})

export const pluginRollbackSchema = z.object({ versionId: z.string().regex(/^[a-f0-9]{24}$/, "Versão inválida") })
export type PluginRollbackInput = z.infer<typeof pluginRollbackSchema>

export const pluginActiveSchema = z.object({ active: z.boolean() })
export type PluginActiveInput = z.infer<typeof pluginActiveSchema>

export const pluginArchiveSchema = z.object({ archived: z.boolean() })
export type PluginArchiveInput = z.infer<typeof pluginArchiveSchema>

export const pluginDiffQuerySchema = z.object({
    to: z.string().regex(/^[a-f0-9]{24}$/, "Versão inválida"),
    from: z
        .string()
        .regex(/^[a-f0-9]{24}$/, "Versão inválida")
        .optional(),
})

export const pluginPreviewToggleSchema = z.object({ on: z.boolean() })
export type PluginPreviewToggleInput = z.infer<typeof pluginPreviewToggleSchema>

/** Erro de interface de um plugin, enviado pela fronteira de erro do navegador (OPE-172). */
export const pluginClientErrorSchema = z.object({
    message: z.string().trim().min(1).max(4096),
    stack: z.string().max(8192).nullable().optional(),
    channel: z.enum(["stable", "preview"]).nullable().optional(),
    where: z.string().trim().min(1).max(200),
})
export type PluginClientErrorInput = z.infer<typeof pluginClientErrorSchema>

/** Leitura dos logs de debug (`after` = ISO da última linha recebida). */
export const pluginLogsQuerySchema = z.object({
    after: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
})
