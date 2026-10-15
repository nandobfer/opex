/**
 * Vocabulário e caminhos do módulo **Serviços** (módulo PURO, cliente e servidor). O dono cria
 * lançamentos manuais de faturamento em `/financeiro/servicos/novo`; eles entram nas somas do
 * Financeiro, do dashboard do dono e do portal do cliente.
 */

/** Campos reativos: o último editado é a fonte da verdade e recalcula os outros dois. */
export const SERVICE_CALC_ORIGINS = ["hours", "clientHours", "billingBrl"] as const
export type ServiceCalcOrigin = (typeof SERVICE_CALC_ORIGINS)[number]

export const SERVICE_CALC_ORIGIN_LABELS: Record<ServiceCalcOrigin, string> = {
    hours: "Duração do serviço",
    clientHours: "Duração inflada",
    billingBrl: "Faturamento",
}

/** Lista do dono (o Financeiro lista tarefas e serviços juntos). */
export const SERVICES_PATH = "/financeiro"
export const SERVICE_NEW_PATH = "/financeiro/servicos/novo"
export const serviceDetailPath = (id: string) => `/financeiro/servicos/${id}`
export const serviceEditPath = (id: string) => `/financeiro/servicos/${id}/editar`

/** Detalhe do serviço no portal do cliente. */
export const CLIENTE_SERVICO_PATH = "/cliente/servicos"
export const clienteServicoPath = (id: string) => `${CLIENTE_SERVICO_PATH}/${id}`

/** Evento Pusher quando serviços mudam. `private-app` (dono) e `private-client-{clientId}` (portal). */
export const SERVICES_UPDATED_EVENT = "services-updated"

/** Entidade de auditoria dos serviços. */
export const SERVICE_AUDIT_ENTITY = "Servico"

/** Prefixo do código dos serviços **sem** repositório (com repositório segue a sequência das tarefas). */
export const SERVICE_CODE_PREFIX = "SRV"
/** Chave do contador global do código `SRV-{n}`. */
export const SERVICE_CODE_COUNTER = "finance-service"

/** Origem do consumo de IA (painel de consumo dos provedores). */
export const SERVICE_AI_ORIGIN = "service-ai"

/** Limites do título/summary gerados por IA (alinham com os do resumo das tarefas). */
export const SERVICE_TITLE_MAX = 120
export const SERVICE_SUMMARY_MAX = 400
