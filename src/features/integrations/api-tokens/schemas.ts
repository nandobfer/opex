import { z } from "zod"

/** Gerar um token de sistema da API interna (o valor aparece uma única vez). */
export const apiTokenInputSchema = z.object({
    nome: z.string().trim().min(2, "Informe ao menos 2 caracteres").max(60, "Máximo de 60 caracteres"),
})
export type ApiTokenInput = z.input<typeof apiTokenInputSchema>
