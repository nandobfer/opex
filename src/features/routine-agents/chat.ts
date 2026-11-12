import { ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE } from "./schemas"
import { ROUTINE_PROVISIONING_LABELS, type RoutineProvisioningStatus } from "./status"

/**
 * Conversa com um agente rotineiro (OPE-160, módulo PURO): regras de disponibilidade, o prompt de
 * sistema (só memórias e o catálogo das ferramentas, sem objetivo nem instruções) e as constantes.
 * A conversa NÃO é execução: não cria `routine_runs`, não usa fila nem vaga e não gasta os limites.
 */

/** Origem do consumo das respostas da conversa (painel de consumo; fora das execuções do agente). */
export const ROUTINE_CHAT_CONSUMPTION_ORIGIN = "routine-agent-chat"
export const ROUTINE_CHAT_TITLE_CONSUMPTION_ORIGIN = "routine-agent-chat-title"

/** Teto técnico de um turno da conversa e a folga para fechar o turno se o motor não parar. */
export const ROUTINE_CHAT_TURN_TIMEOUT_MS = 30 * 60_000
export const ROUTINE_CHAT_STOP_GRACE_MS = 15_000
export const ROUTINE_CHAT_TURN_TIMEOUT_MESSAGE = "A resposta passou do teto técnico de 30 min e foi interrompida. Envie a mensagem de novo ou divida o pedido."

export const ROUTINE_CHAT_ENGINE_UNSUPPORTED_MESSAGE = "A conversa está disponível só no motor Opex por enquanto: este agente usa o OpenCode no host."

/** Conversa recolhida na Visão geral (preferência do navegador). */
export const ROUTINE_CHAT_COLLAPSED_STORAGE_KEY = "opex:routine-chat:collapsed:v1"

/** Rotas da conversa (a partir de `/api`). */
export const routineChatApiBase = (agentId: string) => `/routine-agents/${agentId}/chat`
export const routineChatTabsKey = (agentId: string) => `opex:routine-chat:tabs:v1:${agentId}`
export const routineChatQueryPrefix = (agentId: string) => `routine-chat:${agentId}`

interface AvailabilityAgent {
    status: string
    provisioning: { status: RoutineProvisioningStatus }
    engine?: string
    opex?: { provider: string | null }
}

/** Por que "Executar agora" está desabilitado (`null` = pode executar). */
export function runDisabledReason(agent: AvailabilityAgent): string | null {
    if (agent.status !== "active") return "Retome o agente para executar"
    if (agent.provisioning.status !== "ok") return ROUTINE_PROVISIONING_LABELS[agent.provisioning.status]
    // D9: o DTO devolve o provedor vazio quando o gravado não vale no motor Opex.
    if (agent.engine === "opex" && agent.opex && !agent.opex.provider) return ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE
    return null
}

/**
 * Por que a conversa está desabilitada (`null` = pode conversar): o mesmo tratamento do "Executar agora"
 * (pausado ou sem provisionamento não tem token nem memórias) e, nesta entrega, só o motor Opex.
 */
export function chatDisabledReason(agent: AvailabilityAgent): string | null {
    if (agent.status !== "active") return "Retome o agente para conversar"
    if (agent.engine === "opencode") return ROUTINE_CHAT_ENGINE_UNSUPPORTED_MESSAGE
    return runDisabledReason(agent)
}

export interface RoutineChatInstructionInput {
    /** Contexto de memórias do Engramind lido com o token do agente. */
    memoryBlock: string
    /** Catálogo das skills liberadas (nome + descrição). */
    skillsBlock?: string
    /** Chamada HTTP liberada: nomes dos segredos (nunca os valores). */
    secrets?: readonly { name: string; description: string; allowedHosts: readonly string[] }[] | null
}

/**
 * Prompt de sistema da conversa: **nenhuma instrução**. Só o contexto de memórias, o catálogo das skills e,
 * com a Chamada HTTP liberada, os nomes dos segredos que a ferramenta aceita. Objetivo, instruções do dono,
 * "Como trabalhar", canais graváveis e as ferramentas de controle da execução não entram.
 */
export function routineChatInstructions(input: RoutineChatInstructionInput): string {
    const secrets = input.secrets?.length
        ? [
              "Segredos aceitos como {{secret:NOME}} na Chamada HTTP:",
              ...input.secrets.map((secret) => `- ${secret.name}${secret.description ? ` — ${secret.description}` : ""}${secret.allowedHosts.length ? ` (só em ${secret.allowedHosts.join(", ")})` : ""}`),
          ].join("\n")
        : ""
    return [input.memoryBlock.trim(), input.skillsBlock?.trim() ?? "", secrets].filter((part) => part !== "").join("\n\n")
}

type SessionStatus = "idle" | "running" | "awaiting_confirmation" | "error"

/**
 * Situação exibida na conversa recolhida: alguma sessão aguardando confirmação vence, depois alguma
 * respondendo; erro só o da sessão ativa (um erro antigo noutra sessão não acende o aviso).
 */
export function chatRailStatus(sessions: readonly { id: string; status: SessionStatus }[], activeId: string | null): SessionStatus {
    if (sessions.some((session) => session.status === "awaiting_confirmation")) return "awaiting_confirmation"
    if (sessions.some((session) => session.status === "running")) return "running"
    if (activeId && sessions.find((session) => session.id === activeId)?.status === "error") return "error"
    return "idle"
}
