import { createIntegrationRegistry, defineIntegration, extendDefinition, type IntegrationDefinition } from "@nandobfer/integracoes"
import { cronsIntegration } from "@nandobfer/integracoes/crons"
import { githubIntegration } from "@nandobfer/integracoes/github"
import { aiCostIntegrations, aiIntegrations, configureIa } from "@nandobfer/integracoes/ia"
import { internalApiIntegration } from "@nandobfer/integracoes/internal-api"
import { pusherIntegration } from "@nandobfer/integracoes/pusher"
import { smtpIntegration } from "@nandobfer/integracoes/smtp"
import { storageS3Integration } from "@nandobfer/integracoes/storage-s3"
import { PUBLIC_API_SPEC_PATH } from "@/lib/public-api/paths"
import { OPEX_CRON_JOBS, SESSION_CLEANUP_JOB_IDS } from "./jobs"
import { OPEX_CONSUMPTION_ORIGIN_LABELS } from "./origin-labels"

/**
 * Registro das integrações do Opex — ponto ÚNICO (módulo puro: servidor e navegador). As comuns vêm
 * da biblioteca `@nandobfer/integracoes`; as do Opex (Clientes, Builder Machine, Engramind, Evolution
 * API, Gotenberg, Google Drive) são adaptadores do próprio app. A ordem aqui é a ordem da lista.
 */

configureIa({
    appName: "Opex",
    originLabels: OPEX_CONSUMPTION_ORIGIN_LABELS,
    // Engramind (Redator/embedding) aceita uma só chave: recebe a principal destes provedores.
    keyRingNotes: Object.fromEntries(["gemini", "anthropic", "openai", "deepseek"].map((provider) => [provider, "O Engramind aceita uma só chave: ele recebe a chave principal."])),
})

/** Provedores que alimentam o Engramind (Redator/embedding): ele aceita uma chave só e recebe a principal. */
export const AI_API_KEY_ENGRAMIND_PROVIDERS = ["gemini", "anthropic", "openai", "deepseek"] as const

const github = githubIntegration({ description: "Issues de repositórios vinculados viram tarefas dO Opex" })

const opexIntegrations = [
    defineIntegration({
        id: "orcamentos",
        name: "Clientes",
        description: "Clientes do portal público: repositórios, custo por hora e fator de lucro",
        defaultEnvironment: "externo",
        path: "clientes",
        legacyPaths: ["orcamentos"],
        streamsDebugOverPusher: true,
        publicFields: [],
        secretFields: [],
    }),
    defineIntegration({
        id: "builder_machine",
        name: "Builder Machine",
        description: "Build e containers das prévias no Docker do seu PC (WSL) por túnel SSH; túnel fechado usa o servidor",
        defaultEnvironment: "interno",
        streamsDebugOverPusher: true,
        publicFields: [{ key: "active", label: "Integração ativa", description: "Desativada, as prévias ficam no servidor e as rotas da Builder Machine não respondem", kind: "boolean", defaultValue: false }],
        // Chave privada colada em "Inserir chave existente" (aba Preparo do PC); gerada pelo app, fica só no host.
        secretFields: [{ key: "sshPrivateKey", label: "Chave privada do servidor", group: "card" }],
    }),
    defineIntegration({
        id: "engramind",
        name: "Engramind",
        description: "Rede de memórias para agentes (serviço Rust): configurações, provedores, apps, agentes, tokens, operação e variáveis de ambiente",
        defaultEnvironment: "externo",
        // O Engramind publica o contrato da versão em execução em `GET /openapi.json` (sem token).
        explorer: { baseUrlField: "baseUrl", authLabel: "Bearer com o token admin do Opex (guardado cifrado; nunca vai ao navegador)" },
        defaultSwagger: { baseUrlField: "baseUrl", path: "/openapi.json" },
        streamsDebugOverPusher: true,
        // Tudo é gravado pela aba Conexão (`PUT /api/engramind/connection`), que dispara o bootstrap.
        publicFields: [
            { key: "baseUrl", label: "URL base do Engramind", description: "Endereço que o servidor do Opex alcança (ex.: http://engramind-api:8000)", kind: "url", placeholder: "http://engramind-api:8000", required: true, group: "card" },
            { key: "opexPublicUrl", label: "URL pública do Opex", description: "Endereço do Opex que o Engramind alcança para entregar os webhooks", kind: "url", placeholder: "http://opex:3100", required: true, group: "card" },
            { key: "environmentId", label: "Ambiente do Engramind", description: "Ambiente (módulo Ambientes) com a instalação, para as variáveis de ambiente", kind: "text", group: "card" },
            // OPE-206: backup e conferência da migração dos nomes dos canais, rodados no host pelo OpenCode (aba Migração).
            {
                key: "memoryExportScript",
                label: "Script de export das memórias (host)",
                description:
                    "Caminho absoluto no host do script que exporta todas as memórias para JSON (ex.: /home/usuario/linux-scripts/export-engramind-memories.mjs); usado no backup e na conferência da migração dos canais",
                kind: "text",
                placeholder: "/home/usuario/linux-scripts/export-engramind-memories.mjs",
                group: "card",
            },
        ],
        secretFields: [
            { key: "adminToken", label: "Token admin", description: "Token eng.tk_… admin com read+write+delete (o de bootstrap é trocado por um próprio do Opex)", required: true },
            { key: "webhookSecret", label: "Segredo do webhook", description: "Gerado pelo Opex e registrado no app opex; nunca exibido", group: "card" },
            { key: "appToken", label: "Token do app opex", description: "Token eng.tk_… kind app emitido pelo Opex para provisionar os agentes de memórias (OPE-117); nunca exibido", group: "card" },
        ],
    }),
    // OPE-192: WhatsApp pela Evolution API (ver aicontext/modules/evolution-api.md). Sem `env`: o
    // pré-preenchimento vem do ambiente `evolution-api` (lido no servidor, a chave nunca vai ao navegador).
    defineIntegration({
        id: "evolution-api",
        name: "Evolution API",
        description: "WhatsApp pela Evolution API: instância, pareamento por QR code ou código, webhook e operações",
        defaultEnvironment: "interno",
        streamsDebugOverPusher: true,
        publicFields: [
            { key: "internalUrl", label: "URL interna", description: "Endereço que o servidor do Opex alcança (rede evolution-network)", kind: "url", placeholder: "http://evolution-api:8080", required: true },
            { key: "publicUrl", label: "URL pública", description: "Endereço público da Evolution, usado nos links e no Manager (/manager)", kind: "url", placeholder: "https://evolution.exemplo.com" },
            { key: "defaultInstance", label: "Instância padrão", description: "Nome da instância do WhatsApp usada pelo Opex", kind: "text", placeholder: "opex" },
            { key: "version", label: "Versão", description: "Versão da Evolution informada pelo ambiente (o teste confere a versão real)", kind: "text", placeholder: "2.3.8" },
            { key: "webhookUrl", label: "URL do webhook", description: "URL de entrada do Opex registrada na instância", kind: "url", group: "card" },
        ],
        secretFields: [
            { key: "apiKey", label: "Chave global", description: "AUTHENTICATION_API_KEY da Evolution (cifrada; nunca exibida)", required: true },
            { key: "webhookSecret", label: "Segredo do webhook", description: "Gerado pelo Opex e enviado pela Evolution no header do webhook; nunca exibido", group: "card" },
        ],
    }),
]

// OPE-210: HTML → PDF/PNG dos documentos dos agentes (ver aicontext/modules/agent-documents.md). Serviço
// compartilhado no host (projeto Compose próprio, rede gotenberg-network); sem `env`.
const gotenberg = defineIntegration({
    id: "gotenberg",
    name: "Gotenberg (PDF)",
    description: "Conversão de HTML em PDF e PNG dos documentos dos agentes e validade das URLs desses documentos",
    defaultEnvironment: "interno",
    streamsDebugOverPusher: true,
    publicFields: [
        { key: "url", label: "URL interna", description: "Endereço que o servidor do Opex alcança (rede gotenberg-network)", kind: "url", placeholder: "http://gotenberg:3000", required: true },
        { key: "timeoutSeconds", label: "Tempo limite da conversão", kind: "number", unit: "s", defaultValue: 30, min: 5, max: 120 },
        {
            key: "urlTtlMinutes",
            label: "Validade padrão das URLs dos documentos",
            description: "Validade das URLs de download e de envio devolvidas pelas ferramentas de documentos dos agentes",
            kind: "number",
            unit: "min",
            defaultValue: 15,
            min: 1,
            max: 1440,
        },
        {
            key: "urlTtlMaxMinutes",
            label: "Validade máxima das URLs dos documentos",
            description: "Teto da validade que o agente pode pedir (se ficar abaixo da padrão, vale a menor das duas)",
            kind: "number",
            unit: "min",
            defaultValue: 60,
            min: 1,
            max: 10_080,
        },
    ],
    secretFields: [],
})

const googleDrive = defineIntegration({
    id: "google_drive",
    name: "Google Drive",
    description: "Fonte de tarefas a partir de planilhas do Google Sheets",
    defaultEnvironment: "externo",
    status: "in-development",
    streamsDebugOverPusher: true,
    publicFields: [],
    secretFields: [],
})

const [aiHub, ...aiChildren] = aiIntegrations({
    opencode: {
        sessionsDirectoryPlaceholder: "/home/usuario/opex-ia",
        publicFields: [
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
                key: "sshPrivateKey",
                label: "Chave privada SSH",
                description: "Chave privada (OpenSSH/PEM, sem senha) do usuário SSH; o servidor do app a usa só para o ciclo de vida do serviço",
                multiline: true,
            },
        ],
    },
})

/** Lista ordenada (a mesma do catálogo anterior). */
export const OPEX_INTEGRATIONS: readonly IntegrationDefinition[] = [
    pusherIntegration(),
    internalApiIntegration({ specPath: PUBLIC_API_SPEC_PATH }),
    cronsIntegration({ cronSecretDescription: "Bearer exigido pelas rotas /api/routines/*", internalBaseUrlPlaceholder: "http://127.0.0.1:3100", jobs: OPEX_CRON_JOBS }),
    extendDefinition(github, {
        publicFields: [
            ...github.publicFields,
            { key: "commentOnCreate", label: "Comentar na issue ao criar a tarefa", description: "Ao criar uma tarefa, comenta na issue com o código dela", kind: "boolean", defaultValue: true },
        ],
    }),
    aiHub!,
    ...aiChildren,
    opexIntegrations[0]!,
    smtpIntegration({ fromPlaceholder: "Opex <nao-responda@exemplo.com>" }),
    storageS3Integration(),
    ...opexIntegrations.slice(1),
    ...aiCostIntegrations(),
    gotenberg,
    googleDrive,
]

export const integrationsRegistry = createIntegrationRegistry({ integrations: OPEX_INTEGRATIONS })

export const INTEGRATION_IDS = [
    "pusher",
    "internal_api",
    "crons",
    "github",
    "ai",
    "ai_opencode",
    "ai_gemini",
    "ai_anthropic",
    "ai_openai",
    "ai_deepseek",
    "ai_opencode_go",
    "ai_command_code",
    "ai_jev",
    "orcamentos",
    "smtp",
    "storage_s3",
    "builder_machine",
    "engramind",
    "evolution-api",
    "fx_ptax",
    "models_dev",
    "gotenberg",
] as const

export type IntegrationId = (typeof INTEGRATION_IDS)[number]

export const INTEGRATIONS_BASE_PATH = integrationsRegistry.basePath

export function isIntegrationId(value: string): value is IntegrationId {
    return (INTEGRATION_IDS as readonly string[]).includes(value)
}

export function getIntegrationDef(id: IntegrationId): IntegrationDefinition
export function getIntegrationDef(id: string): IntegrationDefinition | undefined
export function getIntegrationDef(id: string): IntegrationDefinition | undefined {
    return integrationsRegistry.get(id)
}

/** Caminho da página da integração (caminho próprio ou `/integracoes/<id>`). */
export const integrationPath = (id: string): string => integrationsRegistry.path(id)

/** Rotinas que aceitam `retentionDays` (limpezas de sessões). */
export const jobSupportsRetentionDays = (jobId: string): boolean => SESSION_CLEANUP_JOB_IDS.includes(jobId) || Boolean(integrationsRegistry.cronJobCapabilities(jobId).retentionDays)

/** Rotinas que deixam escolher o escopo (`scope`). */
export const jobSupportsScope = (jobId: string): boolean => Boolean(integrationsRegistry.cronJobCapabilities(jobId).scope)

/** Integrações configuráveis (fora as "Em desenvolvimento"), na ordem da lista. */
export const INTEGRATIONS: readonly IntegrationDefinition[] = OPEX_INTEGRATIONS.filter((def) => def.status !== "in-development")

/** Integrações exibidas na lista como "Em desenvolvimento" (sem configuração nem ações). */
export const IN_DEVELOPMENT_INTEGRATIONS: readonly IntegrationDefinition[] = integrationsRegistry.inDevelopment()

/** Integração com caminho próprio (ex.: `/integracoes/ia/gemini`, `/integracoes/clientes`). */
export const hasCustomIntegrationPath = (id: string): boolean => Boolean(getIntegrationDef(id)?.path)

/** Integrações com um campo de chaveiro (`keyRing`): os provedores de IA por API key. */
export const KEY_RING_INTEGRATION_IDS: readonly IntegrationId[] = INTEGRATIONS.filter((def) => def.secretFields.some((field) => field.keyRing)).map((def) => def.id as IntegrationId)

export function getInDevelopmentIntegration(id: string): IntegrationDefinition | undefined {
    return IN_DEVELOPMENT_INTEGRATIONS.find((item) => item.id === id)
}
