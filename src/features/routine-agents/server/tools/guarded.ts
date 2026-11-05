import { toolConfirms } from "@/features/opex-agent/tool-tree"
import { redactToolInput, stringifyForDisplay } from "@/features/opex-agent/server/tool-display"
import type { OpexTool } from "@/features/opex-agent/server/tools/define"
import type { Activation } from "../hub"

/** Resposta às ferramentas chamadas depois que o turno já foi encerrado no mesmo passo. */
export const TURN_ALREADY_CLOSED = {
    status: "not_executed",
    instruction: "A ação NÃO foi executada: o turno já foi encerrado por outra ferramenta deste passo (confirmação, hibernação ou conclusão). Chame uma ferramenta por vez.",
} as const

export const CONFIRMATION_REQUIRED = { status: "confirmation_required", instruction: "A ação NÃO foi executada: aguarda a confirmação do dono. Encerre a resposta agora." } as const

/**
 * Ferramenta do app usada por um rotineiro **fora** do loop do motor Opex (MCP da execução, motor
 * OpenCode). Aplica a mesma política do motor Opex (D4/D6): com o switch de confirmação ligado, a
 * ferramenta que pede confirmação (risco, `confirmByDefault` ou o ajuste do dono em Agente Opex ›
 * Ferramentas) vira Aguardando confirmação em vez de executar; depois de encerrado o turno, nada roda.
 */
export function guardedRoutineTool(def: OpexTool, env: { activation: Activation; confirmIrreversible: boolean; overrides: Readonly<Record<string, boolean>> }): OpexTool {
    return {
        ...def,
        execute: async (input, context) => {
            if (env.activation.outcome !== null) return TURN_ALREADY_CLOSED
            if (env.confirmIrreversible && toolConfirms(def, env.overrides)) {
                env.activation.outcome = {
                    kind: "confirmation",
                    action: {
                        summary: def.summarize?.(input) ?? `Executar "${def.label}"`,
                        kind: "tool",
                        toolName: def.name,
                        toolLabel: def.label,
                        input: JSON.stringify(input ?? {}),
                        displayInput: (stringifyForDisplay(redactToolInput(def, input)) ?? "").slice(0, 4_000),
                    },
                }
                return CONFIRMATION_REQUIRED
            }
            return def.execute(input, context)
        },
    }
}
