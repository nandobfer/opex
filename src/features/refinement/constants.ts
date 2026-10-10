/** Vocabulário e protocolo do refinamento de tarefa (módulo puro). */

/** Título de nível 2 sob o qual o agente reescreve a especificação técnica a cada rodada. */
export const REFINEMENT_SPEC_HEADING = "## Especificação técnica"

export const REFINEMENT_AUDIT_ENTITY = "RefinamentoTarefa"

/** Evento em `private-app` quando o estado de um refinamento muda. Payload: `{ taskId }`. */
export const REFINEMENT_UPDATED_EVENT = "refinement-updated"

/** Rótulo exibido na saída do agente como nome do turno. */
export const REFINEMENT_STAGE_LABEL = "Refinando"

export const REFINEMENT_RUN_STATES = ["idle", "running", "failed", "interrupted"] as const
export type RefinementRunState = (typeof REFINEMENT_RUN_STATES)[number]

export const REFINEMENT_ACTIONS = ["interrupt", "restart", "continue"] as const
export type RefinementAction = (typeof REFINEMENT_ACTIONS)[number]

/**
 * Protocolo do refinamento, sempre aplicado por cima das instruções configuráveis: garante que o
 * agente pergunte (uma rodada por vez), reescreva a especificação completa e cubra critérios de
 * aceite, localização da mudança e casos de borda.
 */
export const REFINEMENT_PROTOCOL = [
    "Protocolo do refinamento (sempre aplicado):",
    "1. Faça as perguntas de esclarecimento em rodadas, usando o formulário de perguntas (uma rodada por vez). Não peça permissões nem execute comandos.",
    "2. Garanta que a especificação cubra, no mínimo: (a) critérios de aceite; (b) localização da mudança — rotas/URLs, telas, módulos, integrações e arquivos envolvidos; (c) casos de borda (edge cases).",
    `3. Ao final de cada rodada, reescreva a especificação técnica COMPLETA em Markdown sob o título exatamente "${REFINEMENT_SPEC_HEADING}", já incorporando as respostas.`,
    "4. Continue perguntando e reescrevendo até julgar a especificação totalmente esclarecida. Quando julgar concluído, responda apenas com a especificação final, sem abrir um novo formulário.",
].join("\n")
