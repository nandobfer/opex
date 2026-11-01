import { z, type ZodType } from "zod"
import { EMBEDDING_PROVIDERS, JOB_KINDS, JOB_STATES, LLM_PURPOSES, MEMORY_STATUSES, SECRET_KEYS, SUBSCRIPTION_MODES, TOKEN_KINDS, USAGE_GROUPS } from "./constants"
import { scopesSchema } from "./schemas/scopes"

/**
 * Catálogo (puro) das operações administrativas do Engramind que o Opex expõe. Uma entrada vale para
 * as três vias do Opex: a rota `/api/engramind/<route>` (proxy do dono), a ferramenta do Agente Opex
 * e o serviço (`server/operations-runner.ts`), que é quem chama o Engramind. O nome (`id`) é o
 * `operationId` do OpenAPI do Engramind.
 */

export type EngramindMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
export type EngramindArea = "connection" | "settings" | "secrets" | "providers" | "apps" | "agents" | "tokens" | "channels" | "subscriptions" | "memories" | "operation"
export type EngramindRisk = "read" | "write" | "destructive"

export interface EngramindRequest {
    path: string
    query?: Record<string, string | number | boolean | undefined | null>
    body?: unknown
}

export interface EngramindOperation<I = Record<string, unknown>> {
    id: string
    method: EngramindMethod
    /** Rota do Opex relativa a `/api/engramind` (`:param` = segmento). */
    route: string
    area: EngramindArea
    risk: EngramindRisk
    /** Nome da ferramenta do Agente Opex. */
    tool: string
    label: string
    /** Para o modelo e para o tooltip da ferramenta. */
    description: string
    input: ZodType<I>
    request: (input: I) => EngramindRequest
    /** Frase do card de confirmação (destrutivas). */
    summarize?: (input: I) => string
    /** Entrada sem segredos (histórico e cards). */
    redact?: (input: I) => unknown
    /** Tipo do evento `engramind-updated` publicado depois da mutação. */
    event?: string
}

const SECRET_OMITTED = "[segredo omitido]"
const enc = encodeURIComponent

// Schemas sem conversão de tipo: também viram o JSON Schema das ferramentas do Agente Opex. A rota
// converte a query (`normalizeEngramindQuery`).
const limit = z.number().int().min(1).max(200).optional().describe("Itens por página (1 a 200, padrão 50)")
const cursor = z.string().trim().min(1).max(500).optional().describe("Cursor da próxima página (next_cursor)")
const page = { cursor, limit }
const isoDate = z.string().trim().datetime({ offset: true, message: "Use data e hora RFC 3339 (ex.: 2026-10-31T12:00:00Z)" })

/** Slug hierárquico do canal (`eng/global`): minúsculas, dígitos e hífens; até 8 segmentos e 120 caracteres. */
export const channelSlugSchema = z
    .string()
    .trim()
    .max(120, "Até 120 caracteres")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,7}$/, "Use segmentos com minúsculas, dígitos e hífens simples, separados por /")
const channelRef = z.string().trim().min(1).max(160).describe("Id (ch_…) ou slug do canal (eng/global)")
const identitySlug = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use minúsculas, dígitos e hífens simples")
const appRef = z.string().trim().min(1).max(80).describe("Id (app_…) ou slug do app")
const agentRef = z.string().trim().min(1).max(160).describe("Id (ag_…) ou app/agente")
const tokenRef = z.string().trim().min(1).max(40).describe("Id do token (tk_…)")
const memoryRef = z.string().trim().min(1).max(60).describe("Id da memória (m_…)")
const name = z.string().trim().min(1, "Informe o nome").max(120)
const description = z.string().trim().max(1000).nullable().optional()
const priority = z.number().int().min(-1000).max(1000)
const webhookUrl = z.string().trim().url("URL inválida").max(2048).regex(/^https?:\/\//, "Use http:// ou https://").nullable().optional()
const webhookSecret = z.string().min(32, "O segredo do webhook tem de 32 a 256 caracteres").max(256).nullable().optional()
/** Alvo de assinatura: canal exato (`eng/global`) ou prefixo com um segmento completo antes do `*` (`eng/*`, `eng/projeto-*`). */
export function isValidSubscriptionTarget(value: string): boolean {
    if (!value.endsWith("*")) return channelSlugSchema.safeParse(value).success
    const base = value.slice(0, -1)
    const slash = base.lastIndexOf("/")
    if (slash <= 0) return false
    return channelSlugSchema.safeParse(base.slice(0, slash)).success && /^[a-z0-9-]*$/.test(base.slice(slash + 1))
}
const subscriptionTarget = z
    .string()
    .trim()
    .min(1)
    .max(121)
    .refine(isValidSubscriptionTarget, "Canal exato (eng/global) ou prefixo terminado em * depois de um segmento completo (eng/*, eng/projeto-*)")
const settingsMap = z.record(z.string().trim().min(1).max(100), z.unknown())
const settingsProposal = z.record(z.string().trim().min(1).max(100), z.unknown()).optional().describe("Configuração proposta só para o teste (não é gravada)")

const redactSettings = (settings: Record<string, unknown> | undefined) =>
    settings ? Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, key.endsWith("api_key") && value ? SECRET_OMITTED : value])) : settings

/** Entradas reaproveitadas pelos formulários da tela (mesmo contrato da rota e do agente). */
export const createAppInput = z.object({ slug: identitySlug, name, description, webhook_url: webhookUrl, webhook_secret: webhookSecret })
export const updateAppInput = z.object({ app: appRef, name: name.optional(), description, webhook_url: webhookUrl, webhook_secret: webhookSecret, disabled: z.boolean().optional() })
export const createAgentInput = z.object({ app: appRef, slug: identitySlug, name, description })
export const updateAgentInput = z.object({ agent: agentRef, name: name.optional(), description, disabled: z.boolean().optional() })
export const updateTokenInput = z.object({ token: tokenRef, label: z.string().trim().max(120).nullable().optional(), scopes: scopesSchema.optional(), expires_at: isoDate.nullable().optional() })
export const createChannelInput = z.object({ slug: channelSlugSchema, name, description, priority: priority.optional() })
export const updateChannelInput = z.object({ channel: channelRef, name: name.optional(), description, priority: priority.optional() })
export const subscribeInput = z.object({ agent: agentRef, target: subscriptionTarget, mode: z.enum(SUBSCRIPTION_MODES), access: scopesSchema.nullable().optional(), priority: priority.nullable().optional() })
export const updateSubscriptionInput = z.object({ subscription: z.string().trim().min(1).max(40), mode: z.enum(SUBSCRIPTION_MODES).optional(), access: scopesSchema.nullable().optional(), priority: priority.nullable().optional() })
export const issueTokenInput = z
.object({
    kind: z.enum(TOKEN_KINDS),
    app: appRef.optional(),
    agent: agentRef.optional(),
    scopes: scopesSchema,
    label: z.string().trim().max(120).optional(),
    expires_at: isoDate.optional(),
})
.superRefine((value, ctx) => {
    if (value.kind === "agent" && !value.agent) ctx.addIssue({ code: "custom", path: ["agent"], message: "Token agent exige o agente" })
    if (value.kind === "admin" && !value.app && !value.agent) ctx.addIssue({ code: "custom", path: ["app"], message: "Informe o app do token admin" })
})
    .meta({ examples: [{ kind: "agent", agent: "app-a/curador", scopes: ["read", "write"] }] })

/** Tipagem por entrada na definição; no catálogo, a entrada fica apagada (validada por `input` na execução). */
function op<I>(def: EngramindOperation<I>): EngramindOperation {
    return def as unknown as EngramindOperation
}

const listChannelsInput = z.object({ include_archived: z.boolean().optional(), ...page })
const memoryListInput = z.object({
    channels: z.string().trim().max(2000).optional().describe("Slugs e prefixos separados por vírgula"),
    categories: z.string().trim().max(1000).optional().describe("Categorias separadas por vírgula"),
    status: z
        .string()
        .trim()
        .regex(new RegExp(`^(${MEMORY_STATUSES.join("|")})(,(${MEMORY_STATUSES.join("|")}))*$`), `Use ${MEMORY_STATUSES.join(", ")} (um ou mais, separados por vírgula)`)
        .optional()
        .describe("active, permanent e/ou archived separados por vírgula (padrão active,permanent)"),
    author: z.string().trim().max(160).optional().describe("App ou app/agente que escreveu"),
    since: isoDate.optional(),
    ...page,
})

export const ENGRAMIND_OPERATIONS: readonly EngramindOperation[] = [
    // --- Conexão -----------------------------------------------------------------------------
    op({
        id: "whoami",
        method: "GET",
        route: "whoami",
        area: "connection",
        risk: "read",
        tool: "get_engramind_whoami",
        label: "Token do Opex no Engramind",
        description: "Mostra o token que o Opex usa no Engramind: app, tipo, escopos e as operações permitidas.",
        input: z.object({}),
        request: () => ({ path: "/v1/whoami" }),
    }),
    // --- Configurações -----------------------------------------------------------------------
    op({
        id: "get_settings",
        method: "GET",
        route: "settings",
        area: "settings",
        risk: "read",
        tool: "get_engramind_settings",
        label: "Ler as configurações do Engramind",
        description: "Lista cada configuração do Engramind com valor efetivo, padrão, tipo, intervalo, sobreposição por canal e a última alteração. Segredos aparecem só como configurados.",
        input: z.object({ key: z.string().trim().max(100).optional().describe("Uma chave só (ex.: limits.rate_per_minute)") }),
        request: (input) => ({ path: "/v1/settings", query: { key: input.key } }),
    }),
    op({
        id: "update_settings",
        method: "PUT",
        route: "settings",
        area: "settings",
        risk: "write",
        tool: "update_engramind_settings",
        label: "Alterar configurações do Engramind",
        description: "Grava um mapa parcial chave → valor nas configurações do Engramind (tudo ou nada; null volta ao padrão). Trocar provedor, modelo, URL, dimensão ou prefixo do embedding valida o provedor e reindexa. Segredos não passam aqui (use set_engramind_secret).",
        input: z.object({ settings: settingsMap.refine((value) => Object.keys(value).length > 0, "Informe ao menos uma chave") }).meta({ examples: [{ settings: { "limits.rate_per_minute": 1200 } }] }),
        request: (input) => ({ path: "/v1/settings", body: input.settings }),
        event: "settings.updated",
    }),
    op({
        id: "get_channel_settings",
        method: "GET",
        route: "channels/:channel/settings",
        area: "settings",
        risk: "read",
        tool: "get_engramind_channel_settings",
        label: "Ler as configurações de um canal",
        description: "Mostra, para as chaves que aceitam sobreposição por canal, o valor efetivo, o global e a sobreposição do canal.",
        input: z.object({ channel: channelRef }),
        request: (input) => ({ path: `/v1/channels/${enc(input.channel)}/settings` }),
    }),
    op({
        id: "update_channel_settings",
        method: "PUT",
        route: "channels/:channel/settings",
        area: "settings",
        risk: "write",
        tool: "update_engramind_channel_settings",
        label: "Alterar configurações de um canal",
        description: "Grava sobreposições de configuração num canal (mapa parcial; null remove a sobreposição e volta ao global).",
        input: z.object({ channel: channelRef, settings: settingsMap.refine((value) => Object.keys(value).length > 0, "Informe ao menos uma chave") }).meta({ examples: [{ channel: "eng/global", settings: { "memory.text_max": 2000 } }] }),
        request: (input) => ({ path: `/v1/channels/${enc(input.channel)}/settings`, body: input.settings }),
        event: "settings.updated",
    }),
    // --- Segredos ----------------------------------------------------------------------------
    op({
        id: "set_secret",
        method: "PUT",
        route: "secrets/:key",
        area: "secrets",
        risk: "write",
        tool: "set_engramind_secret",
        label: "Gravar ou apagar um segredo do Engramind",
        description: "Grava (value) ou apaga (value: null) a chave de API do Redator (redator.api_key) ou do embedding (embedding.api_key). O valor nunca é lido de volta.",
        input: z.object({ key: z.enum(SECRET_KEYS), value: z.string().min(1, "Informe o valor").max(4000).nullable() }),
        request: (input) => ({ path: `/v1/secrets/${enc(input.key)}`, body: { value: input.value } }),
        redact: (input) => ({ key: input.key, value: input.value ? SECRET_OMITTED : null }),
        event: "settings.updated",
    }),
    // --- Provedores --------------------------------------------------------------------------
    op({
        id: "test_redator",
        method: "POST",
        route: "providers/redator/test",
        area: "providers",
        risk: "write",
        tool: "test_engramind_redator",
        label: "Testar o Redator",
        description: "Chama o LLM do Redator com um texto de exemplo (com a configuração atual ou uma proposta em settings) e devolve título, texto, modelo e latência, sem gravar memória.",
        input: z.object({ text: z.string().trim().min(1, "Informe um texto de exemplo").max(4000), settings: settingsProposal }),
        request: (input) => ({ path: "/v1/settings/redator/test", body: { text: input.text, ...(input.settings ? { settings: input.settings } : {}) } }),
        redact: (input) => ({ ...input, settings: redactSettings(input.settings) }),
    }),
    op({
        id: "test_embedding",
        method: "POST",
        route: "providers/embedding/test",
        area: "providers",
        risk: "write",
        tool: "test_engramind_embedding",
        label: "Testar o embedding",
        description: "Vetoriza um texto com a configuração atual ou uma proposta (chaves embedding.*) e devolve provedor, modelo, model_id, dimensão e latência, sem gravar nada.",
        input: z.object({ text: z.string().trim().min(1, "Informe um texto").max(4000), settings: settingsProposal }),
        request: (input) => ({ path: "/v1/settings/embedding/test", body: { text: input.text, ...(input.settings ? { settings: input.settings } : {}) } }),
        redact: (input) => ({ ...input, settings: redactSettings(input.settings) }),
    }),
    op({
        id: "list_embedding_models",
        method: "POST",
        route: "providers/embedding/models",
        area: "providers",
        risk: "read",
        tool: "list_engramind_embedding_models",
        label: "Listar modelos de embedding",
        description: "Lista os modelos de embedding de um provedor (local, ollama ou openai_compatible). Sem base_url/api_key, valem as configuradas; gemini e off não listam.",
        input: z.object({
            provider: z.enum(EMBEDDING_PROVIDERS),
            base_url: z.string().trim().url("URL inválida").max(500).optional(),
            api_key: z.string().min(1).max(4000).optional(),
        }),
        request: (input) => ({ path: "/v1/settings/embedding/models", body: input }),
        redact: (input) => ({ ...input, api_key: input.api_key ? SECRET_OMITTED : undefined }),
    }),
    op({
        id: "reembed_all",
        method: "POST",
        route: "embeddings/reembed",
        area: "providers",
        risk: "write",
        tool: "reembed_engramind",
        label: "Reindexar as memórias",
        description: "Revetoriza todas as memórias com o modelo de embedding vigente (útil depois de trocar a chave ou quando um lote falhou). O progresso aparece em get_engramind_status.",
        input: z.object({}),
        request: () => ({ path: "/v1/embeddings/reembed", body: {} }),
        event: "status.updated",
    }),
    // --- Apps --------------------------------------------------------------------------------
    op({
        id: "list_apps",
        method: "GET",
        route: "apps",
        area: "apps",
        risk: "read",
        tool: "list_engramind_apps",
        label: "Listar os apps do Engramind",
        description: "Lista os apps (sistemas que usam o Engramind) com o estado do webhook de cada um.",
        input: z.object({ ...page }),
        request: (input) => ({ path: "/v1/apps", query: input }),
    }),
    op({
        id: "create_app",
        method: "POST",
        route: "apps",
        area: "apps",
        risk: "write",
        tool: "create_engramind_app",
        label: "Criar app no Engramind",
        description: "Cria um app (slug único na rede) e, opcionalmente, o webhook dele (URL e segredo de 32 a 256 caracteres).",
        input: createAppInput,
        request: (input) => ({ path: "/v1/apps", body: input }),
        redact: (input) => ({ ...input, webhook_secret: input.webhook_secret ? SECRET_OMITTED : input.webhook_secret }),
        event: "identities.updated",
    }),
    op({
        id: "update_app",
        method: "PATCH",
        route: "apps/:app",
        area: "apps",
        risk: "write",
        tool: "update_engramind_app",
        label: "Editar app do Engramind",
        description: "Altera nome, descrição, webhook (URL e segredo; null remove) ou desativa/reativa o app (disabled). Desativar faz os tokens dele pararem de autenticar.",
        input: updateAppInput,
        request: ({ app, ...body }) => ({ path: `/v1/apps/${enc(app)}`, body }),
        redact: (input) => ({ ...input, webhook_secret: input.webhook_secret ? SECRET_OMITTED : input.webhook_secret }),
        event: "identities.updated",
    }),
    op({
        id: "delete_app",
        method: "DELETE",
        route: "apps/:app",
        area: "apps",
        risk: "destructive",
        tool: "delete_engramind_app",
        label: "Excluir app do Engramind",
        description: "Exclui o app com os agentes, tokens e assinaturas dele (a autoria das memórias e a auditoria ficam).",
        input: z.object({ app: appRef }),
        request: (input) => ({ path: `/v1/apps/${enc(input.app)}` }),
        summarize: (input) => `Excluir o app "${input.app}" do Engramind, com os agentes, tokens e assinaturas dele`,
        event: "identities.updated",
    }),
    // --- Agentes -----------------------------------------------------------------------------
    op({
        id: "list_agents",
        method: "GET",
        route: "agents",
        area: "agents",
        risk: "read",
        tool: "list_engramind_agents",
        label: "Listar os agentes do Engramind",
        description: "Lista os agentes (de todos os apps ou de um app).",
        input: z.object({ app: appRef.optional(), ...page }),
        request: (input) => ({ path: "/v1/agents", query: input }),
    }),
    op({
        id: "create_agent",
        method: "POST",
        route: "agents",
        area: "agents",
        risk: "write",
        tool: "create_engramind_agent",
        label: "Criar agente no Engramind",
        description: "Cria um agente num app (slug único dentro do app; o endereço completo é app/agente).",
        input: createAgentInput,
        request: (input) => ({ path: "/v1/agents", body: input }),
        event: "identities.updated",
    }),
    op({
        id: "update_agent",
        method: "PATCH",
        route: "agents/:agent",
        area: "agents",
        risk: "write",
        tool: "update_engramind_agent",
        label: "Editar agente do Engramind",
        description: "Altera nome e descrição ou desativa/reativa o agente (disabled). Desativado, os tokens dele param de autenticar.",
        input: updateAgentInput,
        request: ({ agent, ...body }) => ({ path: `/v1/agents/${enc(agent)}`, body }),
        event: "identities.updated",
    }),
    op({
        id: "delete_agent",
        method: "DELETE",
        route: "agents/:agent",
        area: "agents",
        risk: "destructive",
        tool: "delete_engramind_agent",
        label: "Excluir agente do Engramind",
        description: "Exclui o agente com os tokens e as assinaturas dele.",
        input: z.object({ agent: agentRef }),
        request: (input) => ({ path: `/v1/agents/${enc(input.agent)}` }),
        summarize: (input) => `Excluir o agente "${input.agent}" do Engramind, com os tokens e as assinaturas dele`,
        event: "identities.updated",
    }),
    // --- Tokens ------------------------------------------------------------------------------
    op({
        id: "list_tokens",
        method: "GET",
        route: "tokens",
        area: "tokens",
        risk: "read",
        tool: "list_engramind_tokens",
        label: "Listar os tokens do Engramind",
        description: "Lista os tokens (só o prefixo público, nunca o segredo) com tipo, escopos, rótulo, status, expiração e último uso.",
        input: z.object({ app: appRef.optional(), agent: agentRef.optional(), ...page }),
        request: (input) => ({ path: "/v1/tokens", query: input }),
    }),
    op({
        id: "issue_token",
        method: "POST",
        route: "tokens",
        area: "tokens",
        risk: "write",
        tool: "issue_engramind_token",
        label: "Emitir token do Engramind",
        description: "Emite um token (admin: gestão da rede; agent: memórias dos canais assinados) com escopos read, read+write, read+delete ou read+write+delete. O segredo aparece uma única vez.",
        input: issueTokenInput,
        request: (input) => ({ path: "/v1/tokens", body: input }),
        event: "identities.updated",
    }),
    op({
        id: "update_token",
        method: "PATCH",
        route: "tokens/:token",
        area: "tokens",
        risk: "write",
        tool: "update_engramind_token",
        label: "Editar token do Engramind",
        description: "Altera rótulo, escopos (sem escalada) e expiração (null remove) de um token. O token do próprio Opex não pode ser rebaixado.",
        input: updateTokenInput,
        request: ({ token, ...body }) => ({ path: `/v1/tokens/${enc(token)}`, body }),
        event: "identities.updated",
    }),
    op({
        id: "revoke_token",
        method: "POST",
        route: "tokens/:token/revoke",
        area: "tokens",
        risk: "destructive",
        tool: "revoke_engramind_token",
        label: "Revogar token do Engramind",
        description: "Revoga o token na hora (a próxima requisição com ele recebe 401). O token do próprio Opex não pode ser revogado por aqui.",
        input: z.object({ token: tokenRef }),
        request: (input) => ({ path: `/v1/tokens/${enc(input.token)}/revoke`, body: {} }),
        summarize: (input) => `Revogar o token ${input.token} do Engramind (deixa de autenticar na hora)`,
        event: "identities.updated",
    }),
    // --- Canais ------------------------------------------------------------------------------
    op({
        id: "list_channels",
        method: "GET",
        route: "channels",
        area: "channels",
        risk: "read",
        tool: "list_engramind_channels",
        label: "Listar os canais do Engramind",
        description: "Lista os canais (include_archived inclui os arquivados).",
        input: listChannelsInput,
        request: (input) => ({ path: "/v1/channels", query: input }),
    }),
    op({
        id: "get_channel",
        method: "GET",
        route: "channels/:channel",
        area: "channels",
        risk: "read",
        tool: "get_engramind_channel",
        label: "Ler um canal do Engramind",
        description: "Mostra um canal (nome, descrição, prioridade, versão e se está arquivado).",
        input: z.object({ channel: channelRef }),
        request: (input) => ({ path: `/v1/channels/${enc(input.channel)}` }),
    }),
    op({
        id: "channel_stats",
        method: "GET",
        route: "channels/:channel/stats",
        area: "channels",
        risk: "read",
        tool: "get_engramind_channel_stats",
        label: "Estatísticas de um canal",
        description: "Memórias por status e por categoria, pendências de título e embedding, recuperações, última mudança e versão do canal.",
        input: z.object({ channel: channelRef }),
        request: (input) => ({ path: `/v1/channels/${enc(input.channel)}/stats` }),
    }),
    op({
        id: "create_channel",
        method: "POST",
        route: "channels",
        area: "channels",
        risk: "write",
        tool: "create_engramind_channel",
        label: "Criar canal no Engramind",
        description: "Cria um canal (slug hierárquico e imutável, ex.: eng/global) com nome, descrição e prioridade (-1000 a 1000).",
        input: createChannelInput,
        request: (input) => ({ path: "/v1/channels", body: input }),
        event: "channel.updated",
    }),
    op({
        id: "update_channel",
        method: "PATCH",
        route: "channels/:channel",
        area: "channels",
        risk: "write",
        tool: "update_engramind_channel",
        label: "Editar canal do Engramind",
        description: "Altera nome, descrição e prioridade de um canal (o slug não muda).",
        input: updateChannelInput,
        request: ({ channel, ...body }) => ({ path: `/v1/channels/${enc(channel)}`, body }),
        event: "channel.updated",
    }),
    op({
        id: "archive_channel",
        method: "POST",
        route: "channels/:channel/archive",
        area: "channels",
        risk: "destructive",
        tool: "archive_engramind_channel",
        label: "Arquivar canal do Engramind",
        description: "Arquiva o canal: sai do contexto, da busca e das dicas e deixa de receber escrita (continua legível pelo slug).",
        input: z.object({ channel: channelRef }),
        request: (input) => ({ path: `/v1/channels/${enc(input.channel)}/archive`, body: {} }),
        summarize: (input) => `Arquivar o canal "${input.channel}" do Engramind (sai do contexto e da busca)`,
        event: "channel.updated",
    }),
    op({
        id: "restore_channel",
        method: "POST",
        route: "channels/:channel/restore",
        area: "channels",
        risk: "write",
        tool: "restore_engramind_channel",
        label: "Restaurar canal do Engramind",
        description: "Devolve um canal arquivado ao uso.",
        input: z.object({ channel: channelRef }),
        request: (input) => ({ path: `/v1/channels/${enc(input.channel)}/restore`, body: {} }),
        event: "channel.updated",
    }),
    op({
        id: "delete_channel",
        method: "DELETE",
        route: "channels/:channel",
        area: "channels",
        risk: "destructive",
        tool: "delete_engramind_channel",
        label: "Excluir canal do Engramind",
        description: "Exclui de vez um canal ARQUIVADO, com as memórias (e revisões) e as assinaturas exatas dele.",
        input: z.object({ channel: channelRef }),
        request: (input) => ({ path: `/v1/channels/${enc(input.channel)}` }),
        summarize: (input) => `Excluir de vez o canal "${input.channel}" do Engramind, com as memórias e as assinaturas exatas`,
        event: "channel.updated",
    }),
    // --- Assinaturas -------------------------------------------------------------------------
    op({
        id: "list_subscriptions",
        method: "GET",
        route: "subscriptions",
        area: "subscriptions",
        risk: "read",
        tool: "list_engramind_subscriptions",
        label: "Listar assinaturas do Engramind",
        description: "Lista as assinaturas (de um agente ou de um canal) com alvo, modo, acesso, prioridade e os canais alcançados (reaches).",
        input: z.object({ agent: agentRef.optional(), channel: channelRef.optional(), ...page }),
        request: (input) => ({ path: "/v1/subscriptions", query: input }),
    }),
    op({
        id: "subscribe",
        method: "POST",
        route: "subscriptions",
        area: "subscriptions",
        risk: "write",
        tool: "subscribe_engramind_agent",
        label: "Assinar canal para um agente",
        description: "Faz um agente assinar um canal exato ou um prefixo (eng/*), com modo inject (contexto e busca), search (só busca) ou manage (só citado pelo slug), acesso (restringe os escopos) e prioridade.",
        input: subscribeInput,
        request: (input) => ({ path: "/v1/subscriptions", body: input }),
        event: "subscription.updated",
    }),
    op({
        id: "update_subscription",
        method: "PATCH",
        route: "subscriptions/:subscription",
        area: "subscriptions",
        risk: "write",
        tool: "update_engramind_subscription",
        label: "Editar assinatura do Engramind",
        description: "Altera modo, acesso (null volta aos escopos do token) e prioridade (null volta à do canal) de uma assinatura.",
        input: updateSubscriptionInput,
        request: ({ subscription, ...body }) => ({ path: `/v1/subscriptions/${enc(subscription)}`, body }),
        event: "subscription.updated",
    }),
    op({
        id: "unsubscribe",
        method: "DELETE",
        route: "subscriptions/:subscription",
        area: "subscriptions",
        risk: "write",
        tool: "remove_engramind_subscription",
        label: "Remover assinatura do Engramind",
        description: "Cancela uma assinatura (o agente deixa de alcançar o alvo; as memórias continuam no canal).",
        input: z.object({ subscription: z.string().trim().min(1).max(40) }),
        request: (input) => ({ path: `/v1/subscriptions/${enc(input.subscription)}` }),
        event: "subscription.updated",
    }),
    // --- Memórias ----------------------------------------------------------------------------
    op({
        id: "list_memories",
        method: "GET",
        route: "memories",
        area: "memories",
        risk: "read",
        tool: "list_engramind_memories",
        label: "Listar memórias do Engramind",
        description: "Lista memórias com filtros por canal, categoria, status, autor e desde.",
        input: memoryListInput,
        request: (input) => ({ path: "/v1/memories", query: input }),
    }),
    op({
        id: "search_memories",
        method: "POST",
        route: "memories/search",
        area: "memories",
        risk: "read",
        tool: "search_engramind_memories",
        label: "Buscar memórias do Engramind",
        description: "Busca memórias por sentido e por texto (mode hybrid) ou só por texto (mode text, sem vetores).",
        input: z.object({
            query: z.string().trim().min(1, "Digite o que procurar").max(500),
            channels: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
            categories: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
            include_archived: z.boolean().optional(),
            limit: z.number().int().min(1).max(50).optional(),
        }),
        request: (input) => ({ path: "/v1/memories/search", body: input }),
    }),
    op({
        id: "get_memory",
        method: "GET",
        route: "memories/:memory",
        area: "memories",
        risk: "read",
        tool: "get_engramind_memory",
        label: "Ler uma memória do Engramind",
        description: "Mostra uma memória inteira (texto, título, categoria, status, versão e autor).",
        input: z.object({ memory: memoryRef }),
        request: (input) => ({ path: `/v1/memories/${enc(input.memory)}` }),
    }),
    op({
        id: "memory_history",
        method: "GET",
        route: "memories/:memory/history",
        area: "memories",
        risk: "read",
        tool: "get_engramind_memory_history",
        label: "Histórico de versões de uma memória",
        description: "Lista as revisões de uma memória (texto, título, categoria, autor e motivo de cada versão).",
        input: z.object({ memory: memoryRef, ...page }),
        request: ({ memory, ...query }) => ({ path: `/v1/memories/${enc(memory)}/history`, query }),
    }),
    op({
        id: "revert_memory",
        method: "POST",
        route: "memories/:memory/revert",
        area: "memories",
        risk: "write",
        tool: "revert_engramind_memory",
        label: "Reverter memória a uma versão",
        description: "Devolve texto, título e categoria de uma versão do histórico numa revisão nova.",
        input: z.object({ memory: memoryRef, version: z.number().int().min(1) }),
        request: ({ memory, version }) => ({ path: `/v1/memories/${enc(memory)}/revert`, body: { version } }),
        event: "memory.updated",
    }),
    op({
        id: "pin_memory",
        method: "POST",
        route: "memories/:memory/pin",
        area: "memories",
        risk: "write",
        tool: "pin_engramind_memory",
        label: "Fixar memória",
        description: "Fixa a memória (status permanent).",
        input: z.object({ memory: memoryRef }),
        request: (input) => ({ path: `/v1/memories/${enc(input.memory)}/pin`, body: {} }),
        event: "memory.updated",
    }),
    op({
        id: "unpin_memory",
        method: "POST",
        route: "memories/:memory/unpin",
        area: "memories",
        risk: "write",
        tool: "unpin_engramind_memory",
        label: "Desafixar memória",
        description: "Volta uma memória fixada para active.",
        input: z.object({ memory: memoryRef }),
        request: (input) => ({ path: `/v1/memories/${enc(input.memory)}/unpin`, body: {} }),
        event: "memory.updated",
    }),
    op({
        id: "archive_memory",
        method: "POST",
        route: "memories/:memory/archive",
        area: "memories",
        risk: "destructive",
        tool: "archive_engramind_memory",
        label: "Arquivar memória",
        description: "Arquiva a memória (sai do contexto e da busca padrão; restore_engramind_memory desfaz).",
        input: z.object({ memory: memoryRef }),
        request: (input) => ({ path: `/v1/memories/${enc(input.memory)}/archive`, body: {} }),
        summarize: (input) => `Arquivar a memória ${input.memory} do Engramind`,
        event: "memory.archived",
    }),
    op({
        id: "restore_memory",
        method: "POST",
        route: "memories/:memory/restore",
        area: "memories",
        risk: "write",
        tool: "restore_engramind_memory",
        label: "Restaurar memória",
        description: "Devolve uma memória arquivada ao uso.",
        input: z.object({ memory: memoryRef }),
        request: (input) => ({ path: `/v1/memories/${enc(input.memory)}/restore`, body: {} }),
        event: "memory.updated",
    }),
    op({
        id: "create_memory",
        method: "POST",
        route: "memories",
        area: "memories",
        risk: "write",
        tool: "create_engramind_memory",
        label: "Gravar memória no Engramind",
        description: "Grava uma memória num canal ativo (texto entre memory.text_min e memory.text_max; categoria de categories.list, omitida = a primeira).",
        input: z.object({ channel: channelRef, text: z.string().trim().min(1, "Digite o texto da memória").max(20_000), category: z.string().trim().min(1).max(40).optional() }),
        request: (input) => ({ path: "/v1/memories", body: input }),
        event: "memory.created",
    }),
    op({
        id: "update_memory",
        method: "PATCH",
        route: "memories/:memory",
        area: "memories",
        risk: "write",
        tool: "update_engramind_memory",
        label: "Editar memória do Engramind",
        description: "Edita o texto e/ou a categoria de uma memória. Com expected_version (a versão lida), uma edição concorrente devolve conflito em vez de sobrescrever.",
        input: z.object({ memory: memoryRef, text: z.string().trim().min(1).max(20_000).optional(), category: z.string().trim().min(1).max(40).optional(), expected_version: z.number().int().min(1).optional() }),
        request: ({ memory, ...body }) => ({ path: `/v1/memories/${enc(memory)}`, body }),
        event: "memory.updated",
    }),
    op({
        id: "move_memory",
        method: "POST",
        route: "memories/:memory/move",
        area: "memories",
        risk: "write",
        tool: "move_engramind_memory",
        label: "Mover memória de canal",
        description: "Move a memória para outro canal ativo.",
        input: z.object({ memory: memoryRef, to: channelRef }),
        request: ({ memory, to }) => ({ path: `/v1/memories/${enc(memory)}/move`, body: { to } }),
        event: "memory.updated",
    }),
    op({
        id: "delete_memory",
        method: "DELETE",
        route: "memories/:memory",
        area: "memories",
        risk: "destructive",
        tool: "delete_engramind_memory",
        label: "Excluir memória",
        description: "Exclui de vez a memória e as revisões dela.",
        input: z.object({ memory: memoryRef }),
        request: (input) => ({ path: `/v1/memories/${enc(input.memory)}` }),
        summarize: (input) => `Excluir de vez a memória ${input.memory} do Engramind, com o histórico`,
        event: "memory.deleted",
    }),
    // --- Operação ----------------------------------------------------------------------------
    op({
        id: "get_status",
        method: "GET",
        route: "status",
        area: "operation",
        risk: "read",
        tool: "get_engramind_status",
        label: "Status do Engramind",
        description: "Versão, banco, backup (Litestream), contagens, fila, Redator, embeddings (com a reindexação), webhooks e retenção.",
        input: z.object({}),
        request: () => ({ path: "/v1/status" }),
    }),
    op({
        id: "list_jobs",
        method: "GET",
        route: "jobs",
        area: "operation",
        risk: "read",
        tool: "list_engramind_jobs",
        label: "Jobs da fila do Engramind",
        description: "Lista os jobs (redact, embed, webhook) do mais recente ao mais antigo, com filtro por tipo e estado.",
        input: z.object({ kind: z.enum(JOB_KINDS).optional(), state: z.enum(JOB_STATES).optional(), ...page }),
        request: (input) => ({ path: "/v1/jobs", query: input }),
    }),
    op({
        id: "retry_job",
        method: "POST",
        route: "jobs/:job/retry",
        area: "operation",
        risk: "write",
        tool: "retry_engramind_job",
        label: "Retentar job do Engramind",
        description: "Recoloca na fila um job failed, com as tentativas zeradas.",
        input: z.object({ job: z.string().trim().min(1).max(40) }),
        request: (input) => ({ path: `/v1/jobs/${enc(input.job)}/retry`, body: {} }),
        event: "jobs.updated",
    }),
    op({
        id: "list_llm_calls",
        method: "GET",
        route: "llm-calls",
        area: "operation",
        risk: "read",
        tool: "list_engramind_llm_calls",
        label: "Chamadas do Redator ao LLM",
        description: "Lista as chamadas ao LLM (finalidade, provedor, modelo, tokens, custo, duração e resultado), com filtro por desde e finalidade.",
        input: z.object({ since: isoDate.optional(), purpose: z.enum(LLM_PURPOSES).optional(), ...page }),
        request: (input) => ({ path: "/v1/llm-calls", query: input }),
    }),
    op({
        id: "get_usage",
        method: "GET",
        route: "usage",
        area: "operation",
        risk: "read",
        tool: "get_engramind_usage",
        label: "Consumo do Engramind",
        description: "Requisições, memórias entregues e tokens renderizados do contexto, agrupados por dia, agente, operação ou canal (até 366 dias; padrão: 7 dias).",
        input: z.object({ since: isoDate.optional(), until: isoDate.optional(), group_by: z.enum(USAGE_GROUPS).optional() }),
        request: (input) => ({ path: "/v1/usage", query: input }),
    }),
    op({
        id: "get_audit",
        method: "GET",
        route: "audit",
        area: "operation",
        risk: "read",
        tool: "get_engramind_audit",
        label: "Auditoria do Engramind",
        description: "Eventos de auditoria do Engramind (do mais recente ao mais antigo) com filtro por entidade, id, ação e período (since/until; o recorte por período é feito pelo Opex).",
        input: z.object({ entity: z.string().trim().max(40).optional(), entity_id: z.string().trim().max(160).optional(), action: z.string().trim().max(60).optional(), since: isoDate.optional(), until: isoDate.optional(), ...page }),
        request: (input) => ({ path: "/v1/audit", query: { entity: input.entity, entity_id: input.entity_id, action: input.action, cursor: input.cursor, limit: input.limit } }),
    }),
]

const BY_ID = new Map<string, EngramindOperation>(ENGRAMIND_OPERATIONS.map((item) => [item.id, item]))

export function findEngramindOperation(id: string): EngramindOperation | undefined {
    return BY_ID.get(id)
}

/** Valores da query como o schema espera: `true`/`false` → booleano; `limit` → número. */
export function normalizeEngramindQuery(query: Record<string, string>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(query)) {
        if (value === "true" || value === "false") out[key] = value === "true"
        else if (key === "limit" && /^\d+$/.test(value)) out[key] = Number(value)
        else out[key] = value
    }
    return out
}

/** Operação de uma rota do Opex (`segments` já decodificados) e os parâmetros do caminho. */
export function matchEngramindRoute(method: string, segments: readonly string[]): { operation: EngramindOperation; params: Record<string, string> } | null {
    let best: { operation: EngramindOperation; params: Record<string, string>; literals: number } | null = null
    for (const item of ENGRAMIND_OPERATIONS) {
        if (item.method !== method) continue
        const parts = item.route.split("/")
        if (parts.length !== segments.length) continue
        const params: Record<string, string> = {}
        let literals = 0
        let matches = true
        for (let index = 0; index < parts.length; index++) {
            const part = parts[index]!
            const segment = segments[index]!
            if (part.startsWith(":")) params[part.slice(1)] = segment
            else if (part === segment) literals++
            else {
                matches = false
                break
            }
        }
        if (matches && (!best || literals > best.literals)) best = { operation: item, params, literals }
    }
    return best ? { operation: best.operation, params: best.params } : null
}
