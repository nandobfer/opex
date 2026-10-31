import { z } from "zod"
import { apiTokenScopesSchema } from "./scopes"

/** Expiração opcional (ISO com fuso), sempre no futuro; `null` = não expira. */
export const apiTokenExpirySchema = z
    .union([z.iso.datetime({ offset: true }), z.null()])
    .optional()
    .refine((value) => value == null || Date.parse(value) > Date.now(), "A expiração precisa ser no futuro")

/** Gerar um token de sistema da API interna (o valor aparece uma única vez). */
export const apiTokenInputSchema = z.object({
    nome: z.string().trim().min(2, "Informe ao menos 2 caracteres").max(60, "Máximo de 60 caracteres"),
    escopos: apiTokenScopesSchema,
    expiraEm: apiTokenExpirySchema,
})
export type ApiTokenInput = z.input<typeof apiTokenInputSchema>

/** Editar os escopos (e a expiração) de um token existente: vale na próxima chamada. */
export const apiTokenUpdateSchema = z.object({
    escopos: apiTokenScopesSchema,
    expiraEm: apiTokenExpirySchema,
})
export type ApiTokenUpdateInput = z.input<typeof apiTokenUpdateSchema>
