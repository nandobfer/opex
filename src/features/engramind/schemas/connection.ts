import { z } from "zod"

/** URL http(s) com host e sem barra final. */
const httpUrl = (label: string) =>
    z
        .string()
        .trim()
        .min(1, `Informe a ${label}`)
        .max(500)
        .url(`${label}: URL inválida`)
        .regex(/^https?:\/\//, `${label}: use http:// ou https://`)
        .transform((value) => value.replace(/\/+$/, ""))

/** Corpo de `PUT /api/engramind/connection` (aba Conexão). Token vazio mantém o salvo. */
export const connectionInputSchema = z.object({
    baseUrl: httpUrl("URL base do Engramind"),
    opexPublicUrl: httpUrl("URL pública do Opex"),
    environmentId: z.string().trim().max(60).nullable(),
    adminToken: z
        .string()
        .trim()
        .max(400)
        .refine((value) => value === "" || /^eng\.tk_[0-9a-f]{8}\.[A-Za-z0-9_-]{32,}$/.test(value), "Token no formato eng.tk_<8 hex>.<segredo>")
        .optional(),
})
export type ConnectionInput = z.input<typeof connectionInputSchema>
export type ConnectionValues = z.output<typeof connectionInputSchema>
