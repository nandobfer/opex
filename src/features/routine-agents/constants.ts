/**
 * Constantes dos agentes rotineiros (OPE-130, módulo PURO: tela e servidor). Ver
 * `aicontext/modules/routine-agents.md`.
 */

import { realFixedChannel, type ChannelNamespace } from "@/features/engramind/channel-namespace"

export const ROUTINE_AGENT_AUDIT_ENTITY = "AgenteRotineiro"
export const ROUTINE_RUN_AUDIT_ENTITY = "ExecucaoAgenteRotineiro"

/** Eventos Pusher em `private-app` (payload mínimo). */
export const ROUTINE_AGENT_UPDATED_EVENT = "routine-agent-updated"
export const ROUTINE_RUN_UPDATED_EVENT = "routine-run-updated"
export const ROUTINE_RUN_ATTENTION_EVENT = "routine-run-attention"

/** Origem do consumo de IA (painel de consumo e métricas dos agentes). */
export const ROUTINE_CONSUMPTION_ORIGIN = "routine-agent"
export const ROUTINE_PROVISIONING_ORIGIN = "routine-agent-provisioning"

/** Canais do Engramind (nomes LÓGICOS; o real leva o app da instância na frente, OPE-206). */
export const ROUTINE_GLOBAL_CHANNEL = "agentes/rotineiros/global"
export const ROUTINE_CHANNEL_PREFIX = "agentes/rotineiros"
/** Canal real do global dos rotineiros (`<app>/agentes/rotineiros/global`). */
export const routineGlobalChannel = (ns: ChannelNamespace) => realFixedChannel(ns, ROUTINE_GLOBAL_CHANNEL)
/** Canal real próprio de um rotineiro (`<app>/agentes/rotineiros/<slug>`). */
export const routineChannelOf = (slug: string, ns: ChannelNamespace) => realFixedChannel(ns, `${ROUTINE_CHANNEL_PREFIX}/${slug}`)

/** Espera viva máxima sem valor configurado. */
export const DEFAULT_LIVE_WAIT_MINUTES = 10
/** Intervalo mínimo da hibernação (a reverificação do agendador roda a cada minuto). */
export const MIN_HIBERNATE_MINUTES = 1
/** Reverificação quando a espera viva estoura sem hibernação. */
export const LIVE_WAIT_OVERFLOW_HIBERNATE_MINUTES = 1
/** Corpo do webhook: `payload` serializado acima disso → 400. */
export const MAX_WEBHOOK_PAYLOAD_BYTES = 64 * 1024
/** Solicitação de uma execução (manual, webhook ou Agente Opex). */
export const MAX_RUN_REQUEST_CHARS = 8_000

/** Rota do servidor MCP de uma execução (motor OpenCode). */
export const routineRunMcpPath = (runId: string) => `/api/routine-agents/mcp/${runId}`
/** Nome do servidor MCP de uma execução no OpenCode (prefixo das ferramentas internas). */
export const routineRunMcpName = (runId: string) => `rotina_${runId.slice(-8)}`

/** Pasta de trabalho do agente no host (motor OpenCode), relativa ao home do usuário do OpenCode. */
export const ROUTINE_WORKDIR_ROOT = "opex-rotineiros"

/** Aba de configuração em `/integracoes/ia`. */
export const ROUTINE_SETTINGS_TAB = "rotineiros"
export const routineSettingsHref = (agentId?: string) => `/integracoes/ia?aba=${ROUTINE_SETTINGS_TAB}${agentId ? `&agente=${agentId}` : ""}`
/** Lista dos agentes rotineiros (seta de voltar da página do agente, OPE-160). */
export const ROUTINE_AGENTS_PATH = "/agentes-rotineiros"
export const routineAgentHref = (agentId: string) => `${ROUTINE_AGENTS_PATH}/${agentId}`
/** Aba Execuções da página do agente (o voltar da página de uma execução). */
export const routineRunsHref = (agentId: string) => `${routineAgentHref(agentId)}?aba=execucoes`
/** Página de uma execução (OPE-208: substituiu a gaveta `?execucao=`). */
export const routineRunPath = (agentId: string, runId: string) => `${routineAgentHref(agentId)}/execucoes/${runId}`

/**
 * Chave da memória-índice de um canal (OPE-209): o mapa das chaves do canal, lido antes de consultar o resto
 * por chave (listar o canal inteiro é exceção).
 */
export const ROUTINE_MEMORY_INDEX_KEY = "indice"

/** Teto do texto de uma memória gravada pelo agente rotineiro (`remember`/`update_memory`). */
export const ROUTINE_MEMORY_TEXT_MAX = 20_000

/** Ferramentas internas da execução (sempre liberadas, nos dois motores). */
export const ROUTINE_INTERNAL_TOOLS = ["remember", "list_my_memories", "wait", "hibernate", "request_confirmation", "finish"] as const
export type RoutineInternalTool = (typeof ROUTINE_INTERNAL_TOOLS)[number]
export const ROUTINE_INTERNAL_TOOL_LABELS: Record<RoutineInternalTool, string> = {
    remember: "Gravar memória",
    list_my_memories: "Listar memórias",
    wait: "Espera viva",
    hibernate: "Hibernar",
    request_confirmation: "Pedir confirmação",
    finish: "Concluir",
}

/**
 * Grupos de ferramentas do Agente Opex que um agente rotineiro nunca recebe: com eles, um rotineiro
 * confirmaria ações pendentes de outras execuções ou afrouxaria a própria política
 * (`update_routine_agent` com `confirmIrreversible: false`). A observação de eventos (`watches`, OPE-194)
 * acorda uma conversa do Agente Opex, que o rotineiro não tem (ele já hiberna por tempo). A configuração do
 * Agente Secretário (`secretary`, OPE-200) ficou fora dos rotineiros por decisão do dono: liberar com escopo
 * restrito é uma tarefa futura. Ficam fora da árvore do editor e são descartados (com aviso) pelo motor Opex e
 * na execução de uma ação confirmada.
 */
export const ROUTINE_FORBIDDEN_TOOL_GROUPS: readonly string[] = ["routine-agents", "watches", "secretary"]
export const isRoutineForbiddenToolGroup = (group: string | null | undefined): boolean => Boolean(group && ROUTINE_FORBIDDEN_TOOL_GROUPS.includes(group))
