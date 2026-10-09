import { z } from "zod"

/** Resposta de `GET /api/v1/whoami` (campo `data`). */
export const whoAmIResponseSchema = z.object({
    token: z.object({
        id: z.string(),
        nome: z.string(),
        prefixo: z.string(),
    }),
})
export type WhoAmIResponse = z.infer<typeof whoAmIResponseSchema>
