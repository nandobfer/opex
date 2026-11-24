import { z } from "zod"

/**
 * Modelos de fallback (puro, sem servidor): a mesma lista e a mesma validação para todo turno do
 * OpenCode do app — papéis da mesa e do fork, Agente Adversário, Arquiteto, Revisor de PR, Refinador,
 * agentes rotineiros (motor OpenCode) e Maddox. A execução da corrente é o `runWithFallback`
 * (`features/agentic/server/model-fallback.ts`).
 */

/** Máximo de modelos de fallback por configuração. */
export const MAX_MODEL_FALLBACKS = 5

/** Um modelo (`provedor/modelo`) e a variante — item da lista de fallback. */
export const modelChoiceSchema = z.object({
    model: z.string().trim().min(1, "Escolha o modelo").max(200),
    variant: z.string().trim().max(50).nullable(),
})
export type ModelChoice = z.infer<typeof modelChoiceSchema>

/** Lista de fallback (ordem = ordem de tentativa). */
export const fallbackListSchema = z.array(modelChoiceSchema).max(MAX_MODEL_FALLBACKS, `Até ${MAX_MODEL_FALLBACKS} modelos de fallback`)

type Choice = { model: string | null; variant: string | null }

export const sameModelChoice = (a: Choice, b: Choice) => a.model === b.model && (a.variant ?? null) === (b.variant ?? null)

/** Problema de um item: igual ao modelo principal (`primary`) ou repetido antes na lista (`duplicate`). */
export function fallbackConflict(list: readonly ModelChoice[], index: number, primary: Choice): "primary" | "duplicate" | null {
    const item = list[index]
    if (!item) return null
    if (primary.model && sameModelChoice(item, primary)) return "primary"
    if (list.slice(0, index).some((other) => sameModelChoice(other, item))) return "duplicate"
    return null
}

/** Lista gravada: variante vazia vira `null`; ausente (configuração antiga) vira lista vazia. */
export function normalizeFallbacks(list: readonly ModelChoice[] | null | undefined): ModelChoice[] {
    return (list ?? []).map((item) => ({ model: item.model, variant: item.variant || null }))
}

/** Mensagens do schema (API e formulário). */
export const FALLBACK_CONFLICT_MESSAGES = { primary: "O fallback é igual ao modelo principal", duplicate: "Modelo de fallback repetido" } as const

/** Aponta no `ctx` do `superRefine` os itens repetidos ou iguais ao principal, no caminho `path`. */
export function addFallbackIssues(ctx: z.RefinementCtx, list: readonly ModelChoice[] | null | undefined, primary: Choice, path: (string | number)[]): void {
    list?.forEach((_, index) => {
        const conflict = fallbackConflict(list, index, primary)
        if (conflict) ctx.addIssue({ code: "custom", path: [...path, index, "model"], message: FALLBACK_CONFLICT_MESSAGES[conflict] })
    })
}
