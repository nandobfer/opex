import { z } from "zod"
import { OPENCODE_LOG_LINES_DEFAULT, OPENCODE_LOG_LINES_MAX, OPENCODE_SERVICE_ACTIONS } from "./constants"

export const serviceActionSchema = z.enum(OPENCODE_SERVICE_ACTIONS)

export const serviceActionBodySchema = z.object({
    /** Atualizar: versão exata (padrão: a última 2.x). */
    version: z.string().trim().regex(/^v?\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/, "Versão inválida").optional(),
    /** Atualizar para uma major nova (3.x+), ciente do risco de incompatibilidade. */
    allowMajor: z.boolean().optional(),
})
export type ServiceActionBody = z.infer<typeof serviceActionBodySchema>

export const logsQuerySchema = z.object({ lines: z.coerce.number().int().min(1).max(OPENCODE_LOG_LINES_MAX).default(OPENCODE_LOG_LINES_DEFAULT) })

export const sshTrustSchema = z.object({ fingerprint: z.string().trim().regex(/^SHA256:[A-Za-z0-9+/]{20,}$/, "Impressão digital inválida") })
