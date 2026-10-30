/**
 * Constantes do **Agente Maddox** (módulo puro: tela e servidor). O Maddox é o agente de chat que roda
 * numa sessão do OpenCode: usa as ferramentas nativas do OpenCode no host e recebe as do Opex por MCP.
 */

/** Configuração salva em `ai_feature_settings` (`feature: "maddox-agent"`). */
export const MADDOX_FEATURE = "maddox-agent"

/** Aba de `/integracoes/ia` com a configuração do agente. */
export const MADDOX_AI_TAB = "agente-maddox" as const

export const MADDOX_LABEL = "Agente Maddox"

/** Servidores MCP do Opex registrados no OpenCode (os nomes das ferramentas ganham o prefixo `{servidor}_`). */
export const MADDOX_MCP_SERVERS = { owner: "opex_app", portal: "opex_portal" } as const
export type MaddoxMcpScope = keyof typeof MADDOX_MCP_SERVERS

/** Rota do servidor MCP do Opex (a partir da URL base do app, com o `basePath`). */
export const maddoxMcpPath = (scope: MaddoxMcpScope) => `/api/maddox/mcp/${scope}`

/** Grupo dos cards das ferramentas nativas do OpenCode (bash, arquivos, MCPs do OpenCode…). */
export const MADDOX_NATIVE_TOOL_GROUP = "opencode-native" as const

export const MADDOX_CONSUMPTION_ORIGIN = "maddox-agent"
export const MADDOX_TITLE_CONSUMPTION_ORIGIN = "maddox-title"
export const MADDOX_CLIENT_CONSUMPTION_ORIGIN = "maddox-client-agent"
export const MADDOX_CLIENT_TITLE_CONSUMPTION_ORIGIN = "maddox-client-title"

export const MADDOX_CLIENT_AUDIT_ENTITY = "ClienteOrcamentoMaddoxAgent"
export const MADDOX_CLIENT_CONFIG_EVENT = "maddox-client-config-updated"
/** Configuração do Maddox (cor, modelo, disponibilidade) mudou: o portal relê a situação. */
export const MADDOX_SETTINGS_EVENT = "maddox-settings-updated"

/** Chave das abas abertas no navegador (o portal acrescenta `:{clientId}:{userId}`). */
export const MADDOX_TABS_STORAGE_KEY = "opex:maddox-agent:tabs:v1"

/** Tempo máximo de um turno: um pedido de permissão pode esperar a resposta do usuário até lá. */
export const MADDOX_TURN_TIMEOUT_MS = 24 * 60 * 60 * 1000

/** Instruções da sessão do OpenCode (chave do `session.instructions.entry`). */
export const MADDOX_INSTRUCTIONS_KEY = "opex-maddox"

/** Atalho global: Ctrl+Shift+M (⌘+Shift+M no Mac). */
export function isMaddoxShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
    return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "m"
}

export const DEFAULT_MADDOX_INSTRUCTIONS = [
    "Você é o Agente Maddox, o assistente do dono do Opex que roda no OpenCode, na máquina do dono.",
    "Você tem as ferramentas do próprio OpenCode (terminal, arquivos, skills e os MCPs configurados no OpenCode) e as ferramentas do Opex pelo MCP `opex_app` (tarefas, mesas de trabalho, centrais, serviços, financeiro, clientes, ambientes, integrações e o resto do app).",
    "Para dados e ações do Opex, use as ferramentas `opex_app_*`: elas chamam o app de verdade, com validação, auditoria e tempo real. Nunca invente ids, códigos, repositórios ou valores: descubra-os pelas ferramentas.",
    "Algumas ações pedem confirmação do usuário no chat (Confirmar/Cancelar). Quando isso acontecer, aguarde a decisão.",
    "O usuário pode enviar arquivos no chat; eles chegam junto da mensagem. Para anexá-los a uma tarefa ou prévia, use as ferramentas de arquivos do chat do Opex com o `fileId`.",
    "Responda em português do Brasil, em Markdown, de forma objetiva. Use listas e tabelas curtas quando ajudarem e cite os códigos das tarefas (ex.: OPX-123).",
].join("\n")

/** Instruções do Maddox no **portal do cliente** (fixas, como as do Agente Opex no portal). */
export const DEFAULT_MADDOX_CLIENT_INSTRUCTIONS = [
    "Você é o Agente Maddox no portal do cliente: um assistente por chat que roda no OpenCode e ajuda o usuário do portal a acompanhar as tarefas, os pedidos de orçamento e (para administradores) o financeiro e os usuários do próprio cliente.",
    "As ferramentas do portal chegam pelo MCP `opex_portal` e já limitam tudo ao cliente e ao papel do usuário autenticado. Nunca tente acessar, deduzir ou mencionar dados de outros clientes ou do app interno do dono.",
    "Nunca invente ids, códigos, repositórios ou valores: descubra-os pelas ferramentas (ex.: get_portal_overview, list_tasks, list_previews).",
    "Algumas ações pedem confirmação do usuário no chat (Confirmar/Cancelar). Quando isso acontecer, aguarde a decisão.",
    "Nunca revele senhas, tokens ou caminhos internos da máquina.",
    "Responda em português do Brasil, em Markdown, de forma objetiva.",
].join("\n")
