/**
 * Vocabulário e caminhos do módulo Orçamentos (módulo PURO). O dono cadastra clientes na integração
 * **Clientes** (`/integracoes/clientes`); cada cliente tem um **usuário padrão** e uma URL de acesso
 * ao portal. O acesso ao portal é por **sessão** (`/cliente`), com a entrada por token (`?t=`) trocando
 * o token por cookie.
 */

export const ORCAMENTOS_PATH = "/integracoes/clientes"

/** Página de configuração de um cliente (abas Configurações, Usuários e Token). */
export const clienteConfigPath = (clientId: string) => `${ORCAMENTOS_PATH}/${clientId}`

/** Abas da página da integração Orçamentos. `clientes` é a padrão (omitida da URL). */
export const ORCAMENTOS_TABS = ["clientes"] as const
export type OrcamentosTab = (typeof ORCAMENTOS_TABS)[number]

export const ORCAMENTOS_BASE_PATH = "/cliente"
/** Parâmetro de query com o token de acesso (entrada do portal). */
export const CLIENTE_TOKEN_PARAM = "t"

/** Cookie que guarda o cliente em **pré-visualização** do dono no portal. */
export const PREVIEW_CLIENT_COOKIE = "opex_preview_client"

/** Entrada do portal por token (o token vira sessão e some da URL). */
export const clienteLoginPath = (token: string) => `${ORCAMENTOS_BASE_PATH}?${CLIENTE_TOKEN_PARAM}=${encodeURIComponent(token)}`

export const clienteDashboardPath = () => `${ORCAMENTOS_BASE_PATH}/dashboard`
export const clienteTarefasPath = () => `${ORCAMENTOS_BASE_PATH}/tarefas`
export const clienteNovaPath = () => `${ORCAMENTOS_BASE_PATH}/nova`
export const clienteRevisaoPath = (draftId: string) => `${ORCAMENTOS_BASE_PATH}/revisao/${draftId}`
export const clienteTarefaPath = (taskId: string) => `${ORCAMENTOS_BASE_PATH}/tarefa/${taskId}`
export const clienteFinanceiroPath = () => `${ORCAMENTOS_BASE_PATH}/financeiro`
export const clienteUsuariosPath = () => `${ORCAMENTOS_BASE_PATH}/usuarios`
export const clienteAmbientesPath = () => `${ORCAMENTOS_BASE_PATH}/ambientes`

/** Evento em `private-app` quando clientes de orçamento mudam. Payload: `{ scope }`. */
export const ORCAMENTOS_UPDATED_EVENT = "orcamentos-updated"
/** Evento nos canais do portal quando as tarefas do cliente mudam. */
export const CLIENTE_TASKS_UPDATED_EVENT = "cliente-tasks-updated"

export const CLIENTE_AUDIT_ENTITY = "ClienteOrcamento"
export const DRAFT_AUDIT_ENTITY = "RascunhoOrcamento"
export const USUARIO_AUDIT_ENTITY = "UsuarioCliente"

/** Prefixo visível do token de acesso do cliente. */
export const CLIENT_TOKEN_PREFIX = "cli_"
/** Prefixo visível do token de acesso de um usuário de cliente. */
export const USER_TOKEN_PREFIX = "usr_"

/** Nome do recurso de IA que gera a prévia/estimativa da tarefa. */
export const BUDGET_PREVIEW_FEATURE = "budget-preview"

/** Termo do valor monetário na visão do cliente (o dono usa "Faturamento"). */
export const CLIENTE_COST_LABEL = "Custo"
