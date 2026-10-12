import { z } from "zod"

/** Contrato do login — o mesmo schema vale na rota (`parseBody`) e no formulário (`zodResolver`). */
export const loginSchema = z.object({
    identifier: z.string().trim().min(1, "Informe o usuário ou email."),
    password: z.string().min(1, "Informe a senha."),
})

export type LoginInput = z.infer<typeof loginSchema>
