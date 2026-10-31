import { z } from "zod"

/**
 * Ações no resultado de uma ferramenta do Agente Opex (mecanismo genérico): a ferramenta devolve
 * `resultAction` na saída e o card mostra o botão. Hoje: `reveal-secret` (segredo guardado cifrado
 * no servidor por pouco tempo, mostrado UMA vez — ex.: token emitido no Engramind).
 */

export const revealSecretActionSchema = z.object({
    kind: z.literal("reveal-secret"),
    id: z.string().min(8).max(80),
    label: z.string().min(1).max(60),
    title: z.string().min(1).max(120),
    expiresAt: z.string(),
})
export type RevealSecretAction = z.infer<typeof revealSecretActionSchema>
export type OpexResultAction = RevealSecretAction

const resultActionSchema = z.discriminatedUnion("kind", [revealSecretActionSchema])

/** `resultAction` da saída (texto JSON) da ferramenta, se houver. */
export function resultActionOf(output: string | null | undefined): OpexResultAction | null {
    if (!output || !output.includes("resultAction")) return null
    try {
        const parsed = JSON.parse(output) as { resultAction?: unknown }
        const action = resultActionSchema.safeParse(parsed?.resultAction)
        return action.success ? action.data : null
    } catch {
        return null
    }
}
