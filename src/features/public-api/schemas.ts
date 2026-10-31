import { z } from "zod"

/** Resposta de `GET /api/v1/whoami` (campo `data`). */
export const whoAmIResponseSchema = z.object({
    token: z.object({
        id: z.string(),
        nome: z.string(),
        prefixo: z.string(),
        escopos: z.array(z.string()).describe("Escopos concedidos (vazio no token legado)"),
        legado: z.boolean().describe("Token antigo, sem escopo gravado: só as rotas livres"),
        expiraEm: z.string().nullable().describe("Expiração (ISO) ou null"),
    }),
})
export type WhoAmIResponse = z.infer<typeof whoAmIResponseSchema>
