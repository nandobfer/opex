import { z } from "zod"

/** Código de acesso do Go! Sipal: 6 dígitos (espaços ignorados, para colar do e-mail). */
export const goSipalVerifyCodeSchema = z.object({
    code: z
        .string()
        .transform((value) => value.replace(/\s+/g, ""))
        .pipe(z.string().regex(/^\d{6}$/, "Informe os 6 dígitos do código")),
})
export type GoSipalVerifyCodeInput = z.input<typeof goSipalVerifyCodeSchema>

/** E-mail do login (campo da integração). */
export const goSipalEmailSchema = z.string().trim().toLowerCase().email("E-mail inválido")
