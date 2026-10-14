import { z } from "zod"

/** Registro de uso de um repositório (corpo do `POST` das rotas de histórico). */
export const recordRepoRecentSchema = z.object({
    projectId: z.string().trim().regex(/^[a-f0-9]{24}$/i, "Repositório inválido"),
})
export type RecordRepoRecentInput = z.infer<typeof recordRepoRecentSchema>
