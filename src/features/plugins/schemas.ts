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

export const pluginDiffQuerySchema = z.object({
    to: z.string().regex(/^[a-f0-9]{24}$/, "Versão inválida"),
    from: z
        .string()
        .regex(/^[a-f0-9]{24}$/, "Versão inválida")
        .optional(),
})

export const pluginPreviewToggleSchema = z.object({ on: z.boolean() })
export type PluginPreviewToggleInput = z.infer<typeof pluginPreviewToggleSchema>
