/**
 * Vocabulário e caminhos do módulo Orçamentos (módulo PURO). O administrador cadastra clientes em
 * Integrações › Orçamentos; cada cliente acessa o portal público por `/cliente?t=<token>`.
 */

export const ORCAMENTOS_PATH = "/integracoes/clientes"

/** Abas da página da integração Orçamentos. `clientes` é a padrão (omitida da URL). */
export const ORCAMENTOS_TABS = ["clientes"] as const
export type OrcamentosTab = (typeof ORCAMENTOS_TABS)[number]

export const ORCAMENTOS_BASE_PATH = "/cliente"
/** Parâmetro de query com o token de acesso do cliente. */
export const CLIENTE_TOKEN_PARAM = "t"

export const clientePortalPath = (token: string) => `${ORCAMENTOS_BASE_PATH}?${CLIENTE_TOKEN_PARAM}=${encodeURIComponent(token)}`
export const clienteNovaPath = (token: string) => `${ORCAMENTOS_BASE_PATH}/nova?${CLIENTE_TOKEN_PARAM}=${encodeURIComponent(token)}`
export const clienteRevisaoPath = (token: string, draftId: string) =>
    `${ORCAMENTOS_BASE_PATH}/revisao/${draftId}?${CLIENTE_TOKEN_PARAM}=${encodeURIComponent(token)}`
export const clienteTarefaPath = (token: string, taskId: string) =>
    `${ORCAMENTOS_BASE_PATH}/tarefa/${taskId}?${CLIENTE_TOKEN_PARAM}=${encodeURIComponent(token)}`

/** Evento em `private-app` quando clientes de orçamento mudam. Payload: `{ scope }`. */
export const ORCAMENTOS_UPDATED_EVENT = "orcamentos-updated"

export const CLIENTE_AUDIT_ENTITY = "ClienteOrcamento"
export const DRAFT_AUDIT_ENTITY = "RascunhoOrcamento"

/** Prefixo visível do token de acesso do cliente. */
export const CLIENT_TOKEN_PREFIX = "cli_"

/** Nome do recurso de IA que gera a prévia/estimativa da tarefa. */
export const BUDGET_PREVIEW_FEATURE = "budget-preview"
