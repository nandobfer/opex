/**
 * Catálogo das integrações administráveis (copiado do CRM Marketing Campanhas).
 *
 * Integrações ativas: Pusher, API interna, Crons, GitHub e Provedores de IA (hub `ai`
 * com os provedores `ai_opencode`, `ai_gemini` e `ai_jev`, que só aparecem dentro do hub).
 * `archflow` aparece como "Em desenvolvimento" (sem campos, teste, debug nem ações).
 *
 * Fonte única dos metadados: nome, descrição, ambiente padrão e campos. É módulo PURO (sem
 * dependência de servidor) — a tela usa o mesmo catálogo para desenhar o formulário e o servidor o
 * usa para validar, resolver defaults e decidir o que criptografar.
 *
 * Precedência de valores (ver `config.ts`): banco → variável de ambiente legada → default do
 * código. As chaves `env` existem só nas integrações herdadas do CRM (migração inicial).
 * ⚠️ Integrações e campos NOVOS não declaram `env`: toda configuração é feita em /integracoes.
 */

import { PUBLIC_API_SPEC_PATH } from "@/lib/public-api/paths"
import type { Schedule } from "./schedule"

export const INTEGRATION_IDS = ["pusher", "internal_api", "crons", "github", "ai", "ai_opencode", "ai_gemini", "ai_jev", "orcamentos"] as const

export type IntegrationId = (typeof INTEGRATION_IDS)[number]

/** Integrações exibidas na lista como "Em desenvolvimento" (sem configuração nem ações). */
export const IN_DEVELOPMENT_INTEGRATIONS = [
    {
        id: "archflow",
        name: "Archflow",
        description: "Plataforma de arquitetura para solicitar deploys nos ambientes de QA e PRD",
    },
] as const satisfies readonly { id: string; name: string; description: string }[]

export type InDevelopmentIntegrationId = (typeof IN_DEVELOPMENT_INTEGRATIONS)[number]["id"]

export function getInDevelopmentIntegration(id: string) {
    return IN_DEVELOPMENT_INTEGRATIONS.find((item) => item.id === id)
}

export type IntegrationEnvironment = "interno" | "externo"

export const INTEGRATION_ENVIRONMENT_LABELS: Record<IntegrationEnvironment, string> = {
    interno: "Interno",
    externo: "Externo",
}

/**
 * `token`: texto visível com ações Copiar e Gerar novo token (ex.: token entregue a clientes).
 * `textarea`: texto longo (até 2000 caracteres). `select`: um dos `options` em lista suspensa.
 * `segmented`: um dos `options` em botões lado a lado (poucas opções, ex.: Cluster | Host).
 */
export type PublicFieldKind = "text" | "url" | "number" | "boolean" | "token" | "textarea" | "select" | "segmented" | "cron-jobs"

/**
 * Card que desenha o campo. Sem grupo, o campo aparece em "Campos públicos"/"Campos privados".
 * `card`: campo gravado SOMENTE pela rota de um card próprio da integração — fica fora do
 * detalhe e do PATCH genérico.
 */
export type FieldGroup = "card"

/** Campos gravados só pela rota do próprio card (fora do detalhe e do PATCH genérico). */
export const isCardManagedField = (field: { group?: FieldGroup }) => field.group === "card"

export interface FieldOption {
    readonly value: string
    readonly label: string
}

/** Campo exibido (e exigido) só quando outro campo público tem o valor indicado. */
export interface FieldCondition {
    readonly field: string
    readonly equals: string
}

export type PublicFieldValue = string | number | boolean | CronJobConfig[]

export interface PublicFieldDef {
    readonly key: string
    readonly label: string
    readonly description?: string
    readonly kind: PublicFieldKind
    /** Variáveis legadas, em ordem de preferência. */
    readonly env?: readonly string[]
    readonly defaultValue?: PublicFieldValue
    readonly placeholder?: string
    readonly unit?: string
    readonly min?: number
    readonly max?: number
    readonly required?: boolean
    /** Somente `select` e `segmented`. */
    readonly options?: readonly FieldOption[]
    readonly group?: FieldGroup
    /**
     * Sem condição, o campo sempre aparece. Com condição, some da tela quando ela não vale e o
     * valor salvo é preservado (volta a valer quando a condição volta a ser verdadeira).
     */
    readonly visibleWhen?: FieldCondition
    /** Somente `url`: aceita só a origem (`esquema://host:porta`), sem caminho. */
    readonly urlOriginOnly?: boolean
    /**
     * Somente `url`: endereços do navegador para o Pusher/Soketi, um ou mais (separados por vírgula),
     * cada um com caminho opcional; o cliente usa o que combina com o host da página.
     */
    readonly pusherClientUrls?: boolean
}

export interface SecretFieldDef {
    readonly key: string
    readonly label: string
    readonly description?: string
    readonly env?: readonly string[]
    readonly required?: boolean
    readonly group?: FieldGroup
}

export interface IntegrationDef {
    readonly id: IntegrationId
    readonly name: string
    /** Uma linha, curta — a tabela trunca o excedente. */
    readonly description: string
    readonly defaultEnvironment: IntegrationEnvironment
    /**
     * Adaptador do explorador: campo público com a URL base das chamadas e autenticação injetada
     * pelo servidor. Sem adaptador, as chamadas seguem o `servers` da especificação e vão sem
     * credenciais. Ver `src/features/integrations/openapi/adapters.ts`.
     */
    readonly explorer?: ExplorerAdapterDef
    /**
     * Documentação servida pela própria aplicação: caminho relativo à URL interna. Quando
     * presente, a `swaggerUrl` é derivada automaticamente e não pode ser editada.
     */
    readonly managedSwaggerPath?: string
    /** Variáveis legadas que ligavam o debug antes desta tela. */
    readonly debugEnv?: readonly string[]
    /** Pusher não retransmite os próprios logs de debug (recursão). */
    readonly streamsDebugOverPusher: boolean
    /**
     * Integração-filha: some da lista de `/integracoes` e aparece dentro da página da mãe (ex.:
     * provedores de IA dentro de "Provedores de IA"). O voltar da página leva à mãe.
     */
    readonly parent?: IntegrationId
    readonly publicFields: readonly PublicFieldDef[]
    readonly secretFields: readonly SecretFieldDef[]
}

/** Declaração pura do adaptador; os headers são montados no servidor (`openapi/adapters.ts`). */
export interface ExplorerAdapterDef {
    /** Campo público com a URL base; `"internal"` usa a URL interna da própria aplicação. */
    readonly baseUrlField: string
    /** Usa só a origem do campo (ex.: a URL salva aponta para um endpoint específico). */
    readonly originOnly?: boolean
    /** Resumo exibido no explorador (nunca o valor da credencial). */
    readonly authLabel: string
}

/** `baseUrlField` especial: URL interna da aplicação (`getInternalBaseUrl`). */
export const EXPLORER_INTERNAL_BASE_URL = "internal"

// ---------------------------------------------------------------------------
// Crons
// ---------------------------------------------------------------------------

export type CronJobKind = "http" | "internal"

export interface CronJobConfig {
    id: string
    label: string
    kind: CronJobKind
    /** Somente `http`: rota da própria aplicação chamada com `Bearer CRON_SECRET`. */
    path?: string
    schedule: Schedule
    enabled: boolean
}

export const HEALTH_CHECK_JOB_ID = "integrations-health-check"
export const GITHUB_ISSUE_SYNC_JOB_ID = "github-issue-sync"
export const AGENTIC_PR_WATCH_JOB_ID = "agentic-pr-watch"
export const AGENTIC_QUEUE_JOB_ID = "agentic-queue-pump"
export const TASK_SUMMARY_JOB_ID = "ai-task-summary"

/** Rotinas padrão. */
export const DEFAULT_CRON_JOBS: CronJobConfig[] = [
    {
        id: HEALTH_CHECK_JOB_ID,
        label: "Verificação de status das integrações",
        kind: "internal",
        schedule: { type: "interval", minutes: 5 },
        enabled: true,
    },
    {
        id: GITHUB_ISSUE_SYNC_JOB_ID,
        label: "Sincronizar issues do GitHub",
        kind: "internal",
        schedule: { type: "interval", minutes: 2 },
        enabled: true,
    },
    {
        id: AGENTIC_PR_WATCH_JOB_ID,
        label: "Acompanhar PRs do desenvolvimento agêntico",
        kind: "internal",
        schedule: { type: "interval", minutes: 2 },
        enabled: true,
    },
    {
        id: AGENTIC_QUEUE_JOB_ID,
        label: "Processar a fila do desenvolvimento agêntico",
        kind: "internal",
        schedule: { type: "interval", minutes: 1 },
        enabled: true,
    },
    {
        id: TASK_SUMMARY_JOB_ID,
        label: "Gerar resumos de tarefas (IA)",
        kind: "internal",
        schedule: { type: "interval", minutes: 2 },
        enabled: true,
    },
]

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

export const GITHUB_DEFAULT_API_URL = "https://api.github.com"

// ---------------------------------------------------------------------------
// Pusher
// ---------------------------------------------------------------------------

/** `cluster`: Pusher na nuvem. `host`: servidor próprio compatível (ex.: Soketi) por URL. */
export type PusherMode = "cluster" | "host"

export const PUSHER_MODE_OPTIONS = [
    { value: "cluster", label: "Cluster Pusher" },
    { value: "host", label: "Host próprio" },
] as const satisfies readonly FieldOption[]

// ---------------------------------------------------------------------------
// Provedores de IA
// ---------------------------------------------------------------------------

export const OPENCODE_DEFAULT_URL = "http://127.0.0.1:4096"

// ---------------------------------------------------------------------------
// Campos condicionais
// ---------------------------------------------------------------------------

/** Valor de um campo para a condição: vazio cai no default do campo controlador. */
function conditionValue(fields: readonly PublicFieldDef[], values: Record<string, unknown>, key: string): string {
    const raw = values[key]
    if (raw !== undefined && raw !== null && raw !== "") return String(raw)
    const controller = fields.find((field) => field.key === key)
    return controller?.defaultValue === undefined ? "" : String(controller.defaultValue)
}

/** O campo aparece (e vale) com os valores informados? */
export function isPublicFieldVisible(
    field: PublicFieldDef,
    fields: readonly PublicFieldDef[],
    values: Record<string, unknown>,
): boolean {
    if (!field.visibleWhen) return true
    return conditionValue(fields, values, field.visibleWhen.field) === field.visibleWhen.equals
}

/**
 * Campo condicional obrigatório que ficaria vazio com os valores informados. Só olha campos com
 * `visibleWhen` e só quando a mudança (`touched`) toca o campo ou o seu controlador — assim trocar
 * o modo sem preencher o campo exigido é recusado, sem travar edições alheias em configurações
 * antigas.
 */
export function findMissingConditionalField(
    fields: readonly PublicFieldDef[],
    values: Record<string, unknown>,
    touched: readonly string[],
): PublicFieldDef | undefined {
    return fields.find((field) => {
        if (!field.required || !field.visibleWhen) return false
        if (!touched.includes(field.key) && !touched.includes(field.visibleWhen.field)) return false
        if (!isPublicFieldVisible(field, fields, values)) return false
        const value = values[field.key]
        return value === undefined || value === null || String(value).trim() === ""
    })
}

// ---------------------------------------------------------------------------
// O catálogo
// ---------------------------------------------------------------------------

export const INTEGRATIONS: readonly IntegrationDef[] = [
    {
        id: "pusher",
        name: "Pusher",
        description: "Eventos em tempo real para as telas do app",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: false,
        publicFields: [
            {
                key: "mode",
                label: "Conexão",
                description: "Cluster do Pusher na nuvem ou servidor próprio compatível (ex.: Soketi)",
                kind: "segmented",
                options: PUSHER_MODE_OPTIONS,
                env: ["PUSHER_MODE"],
                defaultValue: "cluster",
                required: true,
            },
            { key: "appId", label: "App ID", kind: "text", env: ["PUSHER_APP_ID"], required: true },
            { key: "key", label: "Key", kind: "text", env: ["PUSHER_KEY"], required: true },
            {
                key: "cluster",
                label: "Cluster",
                kind: "text",
                env: ["PUSHER_CLUSTER"],
                defaultValue: "sa1",
                required: true,
                visibleWhen: { field: "mode", equals: "cluster" },
            },
            {
                key: "url",
                label: "URL do servidor",
                description: "Usada pelo servidor do app para publicar eventos",
                kind: "url",
                env: ["PUSHER_URL"],
                placeholder: "http://soketi:6001",
                required: true,
                urlOriginOnly: true,
                visibleWhen: { field: "mode", equals: "host" },
            },
            { key: "clientKey", label: "Key pública do cliente", description: "Vazio usa a mesma Key do servidor", kind: "text", env: ["NEXT_PUBLIC_PUSHER_KEY"] },
            {
                key: "clientCluster",
                label: "Cluster público do cliente",
                description: "Vazio usa o mesmo cluster do servidor",
                kind: "text",
                env: ["NEXT_PUBLIC_PUSHER_CLUSTER"],
                visibleWhen: { field: "mode", equals: "cluster" },
            },
            {
                key: "clientUrl",
                label: "URL pública do cliente",
                description:
                    "Usada pelo navegador; vazio usa a URL do servidor. Vários endereços separados por vírgula (ex.: IP e domínio): vale o de mesmo host da página. Aceita caminho de proxy",
                kind: "url",
                env: ["NEXT_PUBLIC_PUSHER_URL"],
                placeholder: "ws://192.168.0.64:6001, wss://dominio.com.br/prefixo/soketi",
                pusherClientUrls: true,
                visibleWhen: { field: "mode", equals: "host" },
            },
        ],
        secretFields: [{ key: "secret", label: "Secret", env: ["PUSHER_SECRET"], required: true }],
    },
    {
        id: "internal_api",
        name: "API interna",
        description: "Documentação e tokens dos endpoints públicos do app (acesso por token)",
        defaultEnvironment: "interno",
        explorer: { baseUrlField: EXPLORER_INTERNAL_BASE_URL, authLabel: "Bearer com o token de sistema informado abaixo (não é salvo)" },
        managedSwaggerPath: PUBLIC_API_SPEC_PATH,
        streamsDebugOverPusher: true,
        publicFields: [],
        secretFields: [],
    },
    {
        id: "crons",
        name: "Crons",
        description: "Rotinas agendadas executadas pelo próprio app",
        defaultEnvironment: "interno",
        streamsDebugOverPusher: true,
        publicFields: [
            { key: "schedulerEnabled", label: "Agendador ativo", description: "Desligado, nenhuma rotina é disparada", kind: "boolean", defaultValue: true },
            {
                key: "internalBaseUrl",
                label: "URL base interna",
                description: "Vazio usa http://127.0.0.1 na porta do processo",
                kind: "url",
                placeholder: "http://127.0.0.1:3100",
            },
            { key: "jobs", label: "Rotinas", kind: "cron-jobs", defaultValue: DEFAULT_CRON_JOBS },
        ],
        secretFields: [{ key: "cronSecret", label: "Cron secret", description: "Bearer exigido pelas rotas /api/routines/*", env: ["CRON_SECRET"], required: true }],
    },
    {
        id: "github",
        name: "GitHub",
        description: "Issues de repositórios vinculados viram tarefas dO Opex",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        publicFields: [
            {
                key: "apiUrl",
                label: "URL da API",
                description: "GitHub.com usa https://api.github.com",
                kind: "url",
                defaultValue: GITHUB_DEFAULT_API_URL,
                placeholder: GITHUB_DEFAULT_API_URL,
                required: true,
            },
            {
                key: "commentOnCreate",
                label: "Comentar na issue ao criar a tarefa",
                description: "Ao criar uma tarefa, comenta na issue com o código dela",
                kind: "boolean",
                defaultValue: true,
            },
        ],
        secretFields: [
            {
                key: "token",
                label: "Token de acesso (PAT)",
                description: "Fine-grained: Issues (leitura e escrita), Contents, Pull requests e Metadata (leitura). Clássico: escopo repo.",
                required: true,
            },
        ],
    },
    {
        id: "ai",
        name: "Provedores de IA",
        description: "Provedores de IA (OpenCode, Gemini) e as features do app que os usam",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        publicFields: [],
        secretFields: [],
    },
    {
        id: "ai_opencode",
        name: "OpenCode",
        description: "Servidor OpenCode 2.x: modelos e agentes das suas contas e assinaturas",
        defaultEnvironment: "interno",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [
            {
                key: "baseUrl",
                label: "URL do servidor",
                description: "Endereço do opencode serve (2.x) que o servidor do app alcança. Em Docker, use o IP do host, não 127.0.0.1",
                kind: "url",
                placeholder: OPENCODE_DEFAULT_URL,
                required: true,
                urlOriginOnly: true,
            },
            {
                key: "directory",
                label: "Diretório das sessões",
                description: "Pasta (na máquina do OpenCode, precisa existir) em que as sessões do app são criadas; vazio usa a do servidor",
                kind: "text",
                placeholder: "/home/usuario/opex-ia",
            },
        ],
        secretFields: [
            {
                key: "password",
                label: "Senha do servidor",
                description: "OPENCODE_PASSWORD do opencode serve (usuário opencode, autenticação Basic)",
                required: true,
            },
        ],
    },
    {
        id: "ai_gemini",
        name: "Gemini",
        description: "Modelos Google Gemini pela API do Google AI Studio",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [],
        secretFields: [{ key: "apiKey", label: "API key", description: "Chave do Google AI Studio (aistudio.google.com/apikey)", required: true }],
    },
    {
        id: "ai_jev",
        name: "JEV",
        description: "Modelo TypeSafe (JEV) de decisão estruturada, não de geração de texto",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [],
        secretFields: [{ key: "apiKey", label: "API key", description: "Chave da TypeSafe (console.typesafe.ai/keys)", required: true }],
    },
    {
        id: "orcamentos",
        name: "Orçamentos",
        description: "Clientes do portal público: repositórios, custo por hora e fator de lucro",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        publicFields: [],
        secretFields: [],
    },
]

const BY_ID = new Map<string, IntegrationDef>(INTEGRATIONS.map((def) => [def.id, def]))

export function isIntegrationId(value: string): value is IntegrationId {
    return BY_ID.has(value)
}

export function getIntegrationDef(id: IntegrationId): IntegrationDef
export function getIntegrationDef(id: string): IntegrationDef | undefined
export function getIntegrationDef(id: string): IntegrationDef | undefined {
    return BY_ID.get(id)
}

/** Descrição do campo "Documentação Swagger (OpenAPI)", comum a todas as integrações. */
export const SWAGGER_URL_DESCRIPTION =
    "URL de uma documentação OpenAPI 3.x (JSON): a especificação (ex.: /openapi.json) ou a página do Swagger UI que a publica (ex.: /docs). Outros formatos não são aceitos."

export const INTEGRATIONS_BASE_PATH = "/integracoes"

/** Rotas próprias (fora de `/integracoes/[id]`). */
const CUSTOM_PATHS: Partial<Record<IntegrationId, string>> = {
    ai: `${INTEGRATIONS_BASE_PATH}/ia`,
    ai_opencode: `${INTEGRATIONS_BASE_PATH}/ia/opencode`,
    ai_gemini: `${INTEGRATIONS_BASE_PATH}/ia/gemini`,
    ai_jev: `${INTEGRATIONS_BASE_PATH}/ia/jev`,
    orcamentos: `${INTEGRATIONS_BASE_PATH}/orcamentos`,
}

export function integrationPath(id: IntegrationId): string {
    return CUSTOM_PATHS[id] ?? `${INTEGRATIONS_BASE_PATH}/${id}`
}

/** A integração tem rota própria (a página genérica `/integracoes/[id]` redireciona para ela). */
export function hasCustomIntegrationPath(id: IntegrationId): boolean {
    return CUSTOM_PATHS[id] !== undefined
}

export function integrationDebugChannel(id: IntegrationId): string {
    return `private-integration-${id}`
}

export const INTEGRATION_DEBUG_EVENT = "debug-log"

/**
 * Início/fim de um teste de conexão (manual ou automático), no mesmo canal privado do debug —
 * só ids do catálogo são autorizados (`channel-auth.ts`). Payload: `IntegrationStatusEvent`.
 */
export const INTEGRATION_STATUS_EVENT = "status-updated"
