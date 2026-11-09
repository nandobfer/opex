import type { AiBilling } from "@/lib/ai/provider-cost"
import type { OpexTool } from "@/features/opex-agent/server/tools/define"
import type { Activation } from "../hub"
import type { RoutineAgentDoc, RoutineRunDoc } from "../shared"

/** Contrato dos motores da execução (OPE-130): Opex (AI SDK no servidor) e OpenCode no host. */

export interface EngineStep {
    kind: "text" | "tool" | "notice"
    label: string
    toolName?: string | null
    detail?: string | null
    durationMs?: number | null
    error?: boolean
}

export interface EngineInput {
    agent: RoutineAgentDoc
    run: RoutineRunDoc
    activation: Activation
    /** Instruções do sistema, com o prefixo das ferramentas internas do motor. */
    instructions: (toolPrefix: string) => string
    /** Mensagem desta ativação (disparo ou retomada). */
    message: string
    /** Ferramentas internas (controle e memória), sempre liberadas. */
    internalTools: OpexTool[]
    onStep: (step: EngineStep) => void
    /** Uso de um passo: soma, grava o consumo (se o motor ainda não gravou: `recorded`) e confere os limites (interrompe se estourar). */
    onUsage: (step: { tokens: number; inputTokens: number | null; outputTokens: number | null; costUsd: number | null; billing?: AiBilling | null; stepId: string; model: string; provider: string; recorded?: boolean; apiKeyId?: string | null }) => void
}

export interface EngineResult {
    /** Falha do motor (provedor, serviço desligado); `null` = turno terminou (ou foi interrompido). */
    error: string | null
    /** Último texto do agente (relato quando ele não chamou `finish`). */
    text: string
    /** Motor Opex: histórico do modelo para a retomada (JSON). */
    messages?: string | null
    /** Motor OpenCode: sessão usada (retomada na mesma sessão). */
    sessionId?: string | null
}
