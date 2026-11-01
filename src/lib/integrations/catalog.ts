/**
 * Catálogo das integrações administráveis (copiado do CRM Marketing Campanhas).
 *
 * Integrações ativas: Pusher, API interna, Crons, GitHub, Inteligência Artificial (hub `ai`
 * com os provedores `ai_opencode`, `ai_gemini`, `ai_anthropic`, `ai_openai`, `ai_deepseek` e `ai_jev`, que só aparecem dentro do hub), Clientes,
 * SMTP, Storage S3 e Builder Machine (prévias no Docker do PC; liga pelo campo "Integração ativa").
 * `google_drive` aparece como "Em desenvolvimento" (sem campos, teste, debug nem ações).
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

export const INTEGRATION_IDS = ["pusher", "internal_api", "crons", "github", "ai", "ai_opencode", "ai_gemini", "ai_anthropic", "ai_openai", "ai_deepseek", "ai_jev", "orcamentos", "smtp", "storage_s3", "builder_machine", "engramind"] as const

export type IntegrationId = (typeof INTEGRATION_IDS)[number]

/** Integrações exibidas na lista como "Em desenvolvimento" (sem configuração nem ações). */
export const IN_DEVELOPMENT_INTEGRATIONS = [
    {
        id: "google_drive",
        name: "Google Drive",
        description: "Fonte de tarefas a partir de planilhas do Google Sheets",
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
    /** Valor de várias linhas (ex.: chave privada SSH): a tela usa área de texto mascarada. */
    readonly multiline?: boolean
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
     * provedores de IA dentro de "Inteligência Artificial"). O voltar da página leva à mãe.
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

/** Escopo de varredura das rotinas internas que processam tarefas (hoje: tags de tarefas concluídas). */
export type CronJobScope = "pending" | "all"

export interface CronJobConfig {
    id: string
    label: string
    kind: CronJobKind
    /** Somente `http`: rota da própria aplicação chamada com `Bearer CRON_SECRET`. */
    path?: string
    schedule: Schedule
    enabled: boolean
    /** Somente rotinas que aceitam escolher o escopo (`jobSupportsScope`). `pending` = só o que falta/está desatualizado. */
    scope?: CronJobScope
    /** Somente rotinas de limpeza de sessões (`jobSupportsRetentionDays`): dias sem interação (X). */
    retentionDays?: number
}

export const HEALTH_CHECK_JOB_ID = "integrations-health-check"
export const GITHUB_ISSUE_SYNC_JOB_ID = "github-issue-sync"
export const AGENTIC_PR_WATCH_JOB_ID = "agentic-pr-watch"
export const AGENTIC_QUEUE_JOB_ID = "agentic-queue-pump"
export const TASK_SUMMARY_JOB_ID = "ai-task-summary"
export const TASK_TAGS_JOB_ID = "ai-task-tags"
export const TASK_TAGS_CONCLUDED_JOB_ID = "ai-task-tags-concluded"
/** Limpeza de anexos abandonados (uploads nunca vinculados) e remoções pendentes no storage. */
export const ATTACHMENT_CLEANUP_JOB_ID = "task-attachments-cleanup"
/** Limpeza dos arquivos do chat do Agente Opex enviados e não usados numa mensagem em 24 h (S3 + metadados). */
export const OPEX_FILES_CLEANUP_JOB_ID = "opex-files-cleanup"
/** Builder Machine: limpeza das imagens órfãs e do cache do builder do PC. */
export const BUILDER_MACHINE_CLEANUP_JOB_ID = "builder-machine-cleanup"
/** Pede a quota ao plugin opencode-quota (RPC, motivo poll) e avisa a tela quando muda. */
export const OPENCODE_QUOTA_JOB_ID = "opencode-quota-refresh"
/** Ambientes: mantém as últimas tags de cada ambiente no registry e roda o garbage-collect. */
export const ENVIRONMENTS_REGISTRY_CLEANUP_JOB_ID = "environments-registry-cleanup"
/** Exclui as sessões do servidor OpenCode sem interação há X dias (nunca as vinculadas ao Opex nem as em execução). */
export const OPENCODE_SESSIONS_CLEANUP_JOB_ID = "opencode-sessions-cleanup"
/** Agente Opex: arquiva as sessões sem interação há X dias e exclui as arquivadas há X dias. */
export const OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID = "opex-agent-sessions-cleanup"
/** Agente Maddox: arquiva as sessões sem interação há X dias e exclui as arquivadas há X dias. */
export const MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID = "maddox-agent-sessions-cleanup"

/** Rotinas de limpeza de sessões: aceitam `retentionDays`. */
export const SESSION_CLEANUP_JOB_IDS: readonly string[] = [OPENCODE_SESSIONS_CLEANUP_JOB_ID, OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID, MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID]
/** Dias sem interação padrão das rotinas de limpeza de sessões. */
export const DEFAULT_SESSION_RETENTION_DAYS = 30
export const SESSION_RETENTION_DAYS_MIN = 1
export const SESSION_RETENTION_DAYS_MAX = 3650

export function jobSupportsRetentionDays(jobId: string): boolean {
    return SESSION_CLEANUP_JOB_IDS.includes(jobId)
}

/** Dias efetivos da rotina (`retentionDays` salvo ou o padrão). */
export function jobRetentionDays(job: Pick<CronJobConfig, "retentionDays">): number {
    const days = job.retentionDays
    return typeof days === "number" && Number.isInteger(days) && days >= SESSION_RETENTION_DAYS_MIN && days <= SESSION_RETENTION_DAYS_MAX ? days : DEFAULT_SESSION_RETENTION_DAYS
}

/** Rotinas internas de uma integração ativável (id da rotina → id da integração): somem de Crons com ela desativada. */
export const INTEGRATION_CRON_JOBS: Readonly<Record<string, IntegrationId>> = { [BUILDER_MACHINE_CLEANUP_JOB_ID]: "builder_machine" }

export function cronJobIntegration(jobId: string): IntegrationId | null {
    return INTEGRATION_CRON_JOBS[jobId] ?? null
}

/** Rotinas internas que processam tarefas e deixam escolher o escopo (`scope`). */
export function jobSupportsScope(jobId: string): boolean {
    return jobId === TASK_TAGS_CONCLUDED_JOB_ID
}

/** Opções de escopo da rotina (`scope`). */
export const CRON_JOB_SCOPE_OPTIONS = [
    { value: "pending", label: "Só pendentes" },
    { value: "all", label: "Todas" },
] as const satisfies readonly { value: CronJobScope; label: string }[]

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
        label: "Acompanhar e revisar PRs (desenvolvimento agêntico e Agente Revisor)",
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
    {
        id: TASK_TAGS_JOB_ID,
        label: "Gerar tags de tarefas (IA)",
        kind: "internal",
        schedule: { type: "interval", minutes: 3 },
        enabled: true,
    },
    {
        id: TASK_TAGS_CONCLUDED_JOB_ID,
        label: "Gerar tags de tarefas concluídas (IA)",
        kind: "internal",
        schedule: { type: "interval", minutes: 60 },
        enabled: false,
        scope: "pending",
    },
    {
        id: ATTACHMENT_CLEANUP_JOB_ID,
        label: "Limpar anexos abandonados das tarefas",
        kind: "internal",
        schedule: { type: "interval", minutes: 30 },
        enabled: true,
    },
    {
        id: OPEX_FILES_CLEANUP_JOB_ID,
        label: "Limpar arquivos pendentes do chat do Agente Opex",
        kind: "internal",
        schedule: { type: "interval", minutes: 60 },
        enabled: true,
    },
    {
        id: OPENCODE_QUOTA_JOB_ID,
        label: "Atualizar a quota do OpenCode (opencode-quota)",
        kind: "internal",
        schedule: { type: "interval", minutes: 1 },
        enabled: true,
    },
    {
        id: BUILDER_MACHINE_CLEANUP_JOB_ID,
        label: "Limpar imagens órfãs e cache do builder do PC (Builder Machine)",
        kind: "internal",
        schedule: { type: "daily", time: "03:00" },
        // Ligada ao ativar a integração Builder Machine.
        enabled: false,
    },
    {
        id: ENVIRONMENTS_REGISTRY_CLEANUP_JOB_ID,
        label: "Limpar tags antigas do registry dos ambientes (Ambientes)",
        kind: "internal",
        schedule: { type: "daily", time: "04:00" },
        enabled: false,
    },
    // Limpezas de sessões: nascem desligadas (ação destrutiva); o dono liga e ajusta os dias.
    {
        id: OPENCODE_SESSIONS_CLEANUP_JOB_ID,
        label: "Limpar sessões do OpenCode sem interação",
        kind: "internal",
        schedule: { type: "daily", time: "05:00" },
        enabled: false,
        retentionDays: DEFAULT_SESSION_RETENTION_DAYS,
    },
    {
        id: OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID,
        label: "Limpar sessões do Agente Opex sem interação",
        kind: "internal",
        schedule: { type: "daily", time: "05:00" },
        enabled: false,
        retentionDays: DEFAULT_SESSION_RETENTION_DAYS,
    },
    {
        id: MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID,
        label: "Limpar sessões do Agente Maddox sem interação",
        kind: "internal",
        schedule: { type: "daily", time: "05:00" },
        enabled: false,
        retentionDays: DEFAULT_SESSION_RETENTION_DAYS,
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
// Inteligência Artificial
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
        name: "Inteligência Artificial",
        description: "Provedores de IA (OpenCode, Gemini, Anthropic, OpenAI, DeepSeek, JEV) e as features do app que os usam",
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
            {
                key: "quotaRefreshReason",
                label: "Botão Atualizar da quota",
                description: "Manual consulta todos os provedores na hora e ignora o intervalo e o backoff do opencode-quota; Poll respeita o intervalo do plugin",
                kind: "segmented",
                options: [
                    { value: "manual", label: "Manual" },
                    { value: "poll", label: "Poll" },
                ],
                defaultValue: "manual",
            },
            {
                key: "sshHost",
                label: "Host SSH",
                description: "Acesso SSH à máquina do OpenCode, usado só para iniciar, parar, reiniciar e atualizar o serviço (aba Controles). Vazio usa o host da URL do servidor",
                kind: "text",
                placeholder: "192.168.0.10",
            },
            { key: "sshPort", label: "Porta SSH", kind: "number", defaultValue: 22, min: 1, max: 65535 },
            { key: "sshUser", label: "Usuário SSH", description: "Usuário da máquina que roda o opencode serve", kind: "text", placeholder: "usuario" },
            {
                key: "opencodeBin",
                label: "Executável do opencode",
                description: "Caminho absoluto do opencode no host; vazio é detectado sozinho enquanto o serviço está no ar",
                kind: "text",
                placeholder: "/home/usuario/.nvm/versions/node/v22/bin/opencode",
            },
            {
                key: "sshHostFingerprint",
                label: "Impressão digital do host SSH",
                description: "Gravada ao clicar em Confiar na aba Controles; uma chave de host diferente é recusada. Limpe para confiar de novo",
                kind: "text",
                placeholder: "SHA256:…",
            },
        ],
        secretFields: [
            {
                key: "password",
                label: "Senha do servidor",
                description: "OPENCODE_PASSWORD do opencode serve (usuário opencode, autenticação Basic)",
                required: true,
            },
            {
                key: "sshPrivateKey",
                label: "Chave privada SSH",
                description: "Chave privada (OpenSSH/PEM, sem senha) do usuário SSH; o servidor do app a usa só para o ciclo de vida do serviço",
                multiline: true,
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
        id: "ai_anthropic",
        name: "Anthropic",
        description: "Modelos Claude pela API da Anthropic",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [],
        secretFields: [{ key: "apiKey", label: "API key", description: "Chave do Claude Console (platform.claude.com/settings/keys)", required: true }],
    },
    {
        id: "ai_openai",
        name: "OpenAI",
        description: "Modelos GPT e da série o pela API da OpenAI",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [],
        secretFields: [{ key: "apiKey", label: "API key", description: "Chave da plataforma OpenAI (platform.openai.com/api-keys)", required: true }],
    },
    {
        id: "ai_deepseek",
        name: "DeepSeek",
        description: "Modelos DeepSeek pela API da DeepSeek",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [],
        secretFields: [{ key: "apiKey", label: "API key", description: "Chave da plataforma DeepSeek (platform.deepseek.com/api_keys)", required: true }],
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
        name: "Clientes",
        description: "Clientes do portal público: repositórios, custo por hora e fator de lucro",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        publicFields: [],
        secretFields: [],
    },
    {
        id: "smtp",
        name: "SMTP",
        description: "Envio de e-mails transacionais",
        defaultEnvironment: "interno",
        streamsDebugOverPusher: true,
        publicFields: [
            { key: "host", label: "Host", kind: "text", required: true },
            { key: "port", label: "Porta", kind: "number", defaultValue: 587, min: 1, max: 65535, required: true },
            { key: "user", label: "Usuário", kind: "text" },
            { key: "from", label: "Remetente", kind: "text", placeholder: "Opex <nao-responda@exemplo.com>" },
        ],
        secretFields: [{ key: "password", label: "Senha" }],
    },
    {
        id: "storage_s3",
        name: "Storage S3",
        description: "Armazenamento de arquivos em MinIO/S3 compatível",
        defaultEnvironment: "interno",
        streamsDebugOverPusher: true,
        publicFields: [
            { key: "endpoint", label: "Endpoint", kind: "url", required: true },
            {
                key: "publicEndpoint",
                label: "Endpoint público (navegador)",
                kind: "url",
                placeholder: "http://localhost:9000",
                description:
                    "Endereço do storage visto pelo navegador, usado nas URLs assinadas de upload e mídia. Preencha quando o Endpoint for um nome interno (ex.: container Docker). Vazio = usa o Endpoint.",
            },
            { key: "region", label: "Região", kind: "text", defaultValue: "us-east-1", required: true },
            { key: "bucket", label: "Bucket", kind: "text", defaultValue: "default", required: true },
            { key: "signedUrlExpiresSeconds", label: "Expiração da URL assinada", kind: "number", unit: "s", defaultValue: 3600, min: 60, max: 604_800 },
        ],
        secretFields: [
            { key: "accessKey", label: "Access key", required: true },
            { key: "secretKey", label: "Secret key", required: true },
        ],
    },
    {
        id: "builder_machine",
        name: "Builder Machine",
        description: "Build e containers das prévias no Docker do seu PC (WSL) por túnel SSH; túnel fechado usa o servidor",
        defaultEnvironment: "interno",
        streamsDebugOverPusher: true,
        publicFields: [{ key: "active", label: "Integração ativa", description: "Desativada, as prévias ficam no servidor e as rotas da Builder Machine não respondem", kind: "boolean", defaultValue: false }],
        // Chave privada colada em "Inserir chave existente" (aba Preparo do PC); gerada pelo app, fica só no host.
        secretFields: [{ key: "sshPrivateKey", label: "Chave privada do servidor", group: "card" }],
    },
    {
        id: "engramind",
        name: "Engramind",
        description: "Rede de memórias para agentes (serviço Rust): configurações, provedores, apps, agentes, tokens, operação e variáveis de ambiente",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        // Tudo é gravado pela aba Conexão (`PUT /api/engramind/connection`), que dispara o bootstrap.
        publicFields: [
            { key: "baseUrl", label: "URL base do Engramind", description: "Endereço que o servidor do Opex alcança (ex.: http://engramind-api:8000)", kind: "url", placeholder: "http://engramind-api:8000", required: true, group: "card" },
            { key: "opexPublicUrl", label: "URL pública do Opex", description: "Endereço do Opex que o Engramind alcança para entregar os webhooks", kind: "url", placeholder: "http://opex:3100", required: true, group: "card" },
            { key: "environmentId", label: "Ambiente do Engramind", description: "Ambiente (módulo Ambientes) com a instalação, para as variáveis de ambiente", kind: "text", group: "card" },
        ],
        secretFields: [
            { key: "adminToken", label: "Token admin", description: "Token eng.tk_… admin com read+write+delete (o de bootstrap é trocado por um próprio do Opex)", required: true },
            { key: "webhookSecret", label: "Segredo do webhook", description: "Gerado pelo Opex e registrado no app opex; nunca exibido", group: "card" },
        ],
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
    ai_anthropic: `${INTEGRATIONS_BASE_PATH}/ia/anthropic`,
    ai_openai: `${INTEGRATIONS_BASE_PATH}/ia/openai`,
    ai_deepseek: `${INTEGRATIONS_BASE_PATH}/ia/deepseek`,
    ai_jev: `${INTEGRATIONS_BASE_PATH}/ia/jev`,
    orcamentos: `${INTEGRATIONS_BASE_PATH}/clientes`,
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
