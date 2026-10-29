import { LESSON_FENCE } from "./constants"
import { lessonBlockSchema, type LessonBlock } from "./schemas"

/**
 * Bloco de pedido de memória do agente desenvolvedor (módulo puro). O agente termina a resposta com
 * uma cerca ```opex-lesson``` (linguagem própria: não colide com os blocos ```json``` que as etapas
 * da mesa esperam). O bloco é retirado da resposta antes de a mesa interpretar o turno.
 */

const BLOCK = new RegExp("```" + LESSON_FENCE + "[ \\t]*\\r?\\n([\\s\\S]*?)```[ \\t]*", "g")

/** Instrução acrescentada ao pedido do turno quando o Mentor aceita pedidos do desenvolvedor. */
export const LESSON_INSTRUCTION = [
    "## Lições para o revisor adversário (opcional)",
    "Um revisor adversário revisa o seu código depois de cada implementação. Se este turno revelou algo que ele deveria ter pegado e que vale como regra permanente em qualquer projeto (ex.: um crash em runtime que nenhum teste pegou, um teste de tela faltando, uma regra da especificação ignorada), termine a resposta com UM bloco:",
    "```" + LESSON_FENCE,
    '{"problem": "o que deu errado", "shouldHaveCaught": "o que o revisor deveria ter verificado", "evidence": "como apareceu (opcional)", "why": "por que vale como regra"}',
    "```",
    "Use só para lições realmente relevantes e reaproveitáveis. Nunca para erros de digitação, mudanças de escopo ou preferências. No máximo um bloco por resposta; sem lição, não escreva o bloco. O bloco não substitui nenhuma outra saída pedida acima.",
].join("\n")

export function withLessonInstruction(text: string): string {
    return `${text}\n\n${LESSON_INSTRUCTION}`
}

export interface TakenLesson {
    /** Resposta sem os blocos de lição. */
    text: string
    /** Último bloco válido (`null` sem bloco ou com bloco inválido). */
    lesson: LessonBlock | null
    /** Motivo quando havia bloco, mas nenhum válido. */
    error: string | null
}

/** Retira os blocos de lição da resposta; vale o último bloco válido. */
export function takeLessonBlock(text: string): TakenLesson {
    const bodies = [...text.matchAll(BLOCK)].map((match) => match[1]!.trim())
    if (!bodies.length) return { text, lesson: null, error: null }
    const stripped = text.replace(BLOCK, "").replace(/\n{3,}/g, "\n\n").trimEnd()
    let error: string | null = null
    for (const body of bodies.reverse()) {
        let raw: unknown
        try {
            raw = JSON.parse(body)
        } catch {
            error = "O bloco de lição do desenvolvedor não é um JSON válido"
            continue
        }
        const parsed = lessonBlockSchema.safeParse(raw)
        if (parsed.success) return { text: stripped, lesson: parsed.data, error: null }
        error = `Bloco de lição do desenvolvedor inválido: ${parsed.error.issues[0]?.message ?? "campos ausentes"}`
    }
    return { text: stripped, lesson: null, error }
}
