import { z } from "zod"
import { MIN_MASKABLE_SECRET_LENGTH } from "@/features/http-request/secrets"
import { OPEX_PROVIDER_IDS } from "@/features/opex-agent/constants"
import { AI_TEXT_PROVIDER_IDS } from "@/lib/ai/providers"
import { MAX_RUN_REQUEST_CHARS } from "./constants"
import { CHANNEL_SLUG } from "./provision-plan"

/**
 * Contrato dos agentes rotineiros (OPE-130, módulo PURO): o MESMO schema valida a API e o formulário
 * (react-hook-form + `zodResolver`). Limites vazios (`null`) = sem limite.
 *
 * Decisão D1 do plano aprovado (OPE-130): o limite "Custo máximo por execução (USD)" virou
 * **"Máximo de tokens por execução"** (`maxTokens`), porque os provedores diretos não informam custo.
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/

const triggerBase = { id: z.string().trim().min(1).max(40), enabled: z.boolean() }

export const routineTriggerSchema = z.discriminatedUnion("kind", [
    z.object({ ...triggerBase, kind: z.literal("interval"), every: z.number({ error: "Informe o intervalo" }).int("Use um número inteiro").min(1, "Mínimo de 1").max(10_000, "Intervalo grande demais"), unit: z.enum(["minutes", "hours"]) }),
    z.object({ ...triggerBase, kind: z.literal("daily"), time: z.string().regex(TIME, "Horário inválido (HH:mm)") }),
    z.object({
        ...triggerBase,
        kind: z.literal("weekly"),
        days: z.array(z.number().int().min(0).max(6)).min(1, "Escolha ao menos um dia").max(7),
        time: z.string().regex(TIME, "Horário inválido (HH:mm)"),
    }),
    z.object({ ...triggerBase, kind: z.literal("once"), at: z.string().regex(LOCAL_DATETIME, "Data e hora inválidas") }),
    z.object({ ...triggerBase, kind: z.literal("webhook") }),
])
export type RoutineTrigger = z.infer<typeof routineTriggerSchema>
export type RoutineTriggerKind = RoutineTrigger["kind"]

const optionalLimit = (max: number, label: string) => z.number().int("Use um número inteiro").min(1, `${label}: mínimo de 1`).max(max, `${label}: valor grande demais`).nullable()

export const routineLimitsSchema = z.object({
    concurrency: optionalLimit(50, "Execuções simultâneas"),
    maxActiveMinutes: optionalLimit(7 * 24 * 60, "Tempo máximo ativo"),
    maxWaitingMinutes: optionalLimit(365 * 24 * 60, "Tempo máximo esperando"),
    maxTokens: optionalLimit(1_000_000_000, "Máximo de tokens"),
    maxLiveWaitMinutes: optionalLimit(24 * 60, "Espera viva máxima"),
})
export type RoutineLimits = z.infer<typeof routineLimitsSchema>
export const EMPTY_ROUTINE_LIMITS: RoutineLimits = { concurrency: null, maxActiveMinutes: null, maxWaitingMinutes: null, maxTokens: null, maxLiveWaitMinutes: null }

/**
 * Decisão D9 do plano aprovado (OPE-130): o motor Opex usa só os provedores do Agente Opex (Gemini,
 * Anthropic, OpenAI, DeepSeek) — o OpenCode não aceita as ferramentas do app e é o próprio motor
 * "OpenCode no host".
 */
export const ROUTINE_OPEX_PROVIDER_IDS = OPEX_PROVIDER_IDS
export const ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE = "O motor Opex não usa o OpenCode: em Configurar, escolha Gemini, Anthropic, OpenAI ou DeepSeek, ou troque o motor para OpenCode no host."
/** Provedor gravado que o motor Opex não aceita (agentes salvos antes de D9 com `opencode`). */
export const isInvalidRoutineOpexProvider = (engine: string, provider: string | null | undefined): boolean =>
    engine === "opex" && provider !== null && provider !== undefined && !(ROUTINE_OPEX_PROVIDER_IDS as readonly string[]).includes(provider)

export const routineOpexEngineSchema = z.object({
    provider: z.enum(ROUTINE_OPEX_PROVIDER_IDS, { error: "Escolha o provedor" }).nullable(),
    model: z.string().trim().max(200),
    variant: z.string().trim().max(80).nullable(),
    enabledTools: z.array(z.string().trim().min(1).max(120)).max(500),
    enabledMcpServers: z.array(z.string().trim().min(1).max(64)).max(100),
})
export type RoutineOpexEngine = z.infer<typeof routineOpexEngineSchema>

export const routineOpencodeEngineSchema = z.object({
    model: z.string().trim().max(200),
    variant: z.string().trim().max(80).nullable(),
    agent: z.string().trim().max(120).nullable(),
    enabledMcps: z.array(z.string().trim().min(1).max(120)).max(100),
    /** "Chamadas HTTP com segredos": `http_request` no MCP da execução, com os segredos do agente (padrão desligado). */
    httpRequests: z.boolean().optional(),
})
export type RoutineOpencodeEngine = z.infer<typeof routineOpencodeEngineSchema>

export const ROUTINE_ENGINES = ["opex", "opencode"] as const
export type RoutineEngine = (typeof ROUTINE_ENGINES)[number]
export const ROUTINE_ENGINE_LABELS: Record<RoutineEngine, string> = { opex: "Opex", opencode: "OpenCode no host" }

export const ROUTINE_IDENTITY_SOURCE_MESSAGE = "Preencha o objetivo ou as instruções: o provisionamento gera o resto a partir deles"

export const routineAgentInputSchema = z
    .object({
        // Nome e objetivo opcionais (OPE-130, D8): vazios, o subagente de provisionamento os gera.
        name: z.string().trim().max(80, "Nome com no máximo 80 caracteres").refine((value) => value === "" || value.length >= 2, "Nome com no mínimo 2 caracteres (ou deixe vazio para gerar)"),
        objective: z.string().trim().max(4_000, "Objetivo com no máximo 4.000 caracteres"),
        instructions: z.string().max(20_000, "Instruções com no máximo 20.000 caracteres"),
        engine: z.enum(ROUTINE_ENGINES),
        opex: routineOpexEngineSchema,
        opencode: routineOpencodeEngineSchema,
        confirmIrreversible: z.boolean(),
        limits: routineLimitsSchema,
        triggers: z.array(routineTriggerSchema).max(20, "No máximo 20 gatilhos"),
    })
    .superRefine((value, ctx) => {
        if (!value.objective && !value.instructions.trim()) ctx.addIssue({ code: "custom", path: ["objective"], message: ROUTINE_IDENTITY_SOURCE_MESSAGE })
        if (value.engine === "opex") {
            if (!value.opex.provider) ctx.addIssue({ code: "custom", path: ["opex", "provider"], message: "Escolha o provedor" })
            if (!value.opex.model) ctx.addIssue({ code: "custom", path: ["opex", "model"], message: "Escolha o modelo" })
        } else if (!value.opencode.model) ctx.addIssue({ code: "custom", path: ["opencode", "model"], message: "Escolha o modelo" })
        const ids = new Set<string>()
        value.triggers.forEach((trigger, index) => {
            if (ids.has(trigger.id)) ctx.addIssue({ code: "custom", path: ["triggers", index, "id"], message: "Gatilho repetido" })
            ids.add(trigger.id)
        })
        if (value.triggers.filter((trigger) => trigger.kind === "webhook").length > 1) ctx.addIssue({ code: "custom", path: ["triggers"], message: "Use um único gatilho de webhook" })
    })
export type RoutineAgentInput = z.infer<typeof routineAgentInputSchema>

export const DEFAULT_ROUTINE_AGENT_INPUT: RoutineAgentInput = {
    name: "",
    objective: "",
    instructions: "",
    engine: "opex",
    opex: { provider: null, model: "", variant: null, enabledTools: [], enabledMcpServers: [] },
    opencode: { model: "", variant: null, agent: null, enabledMcps: [], httpRequests: false },
    confirmIrreversible: true,
    limits: EMPTY_ROUTINE_LIMITS,
    triggers: [],
}

/** "Executar agora" (diálogo e Agente Opex). */
export const routineRunRequestSchema = z.object({
    request: z.string().trim().max(MAX_RUN_REQUEST_CHARS, `Solicitação com no máximo ${MAX_RUN_REQUEST_CHARS} caracteres`).optional(),
})
export type RoutineRunRequest = z.infer<typeof routineRunRequestSchema>

/** Corpo do webhook público (`POST /api/v1/routine-agents/{id}/runs`); o `payload` tem teto de 64 KB. */
export const routineWebhookBodySchema = z.object({
    request: z.string().trim().max(MAX_RUN_REQUEST_CHARS, `Solicitação com no máximo ${MAX_RUN_REQUEST_CHARS} caracteres`).optional(),
    payload: z.unknown().optional(),
})
export type RoutineWebhookBody = z.infer<typeof routineWebhookBodySchema>

export const routineWebhookResponseSchema = z.object({ runId: z.string(), status: z.string() })

export const ROUTINE_ENTRY_TARGETS = ["agent", "global"] as const
export type RoutineEntryTarget = (typeof ROUTINE_ENTRY_TARGETS)[number]
export const ROUTINE_ENTRY_TARGET_LABELS: Record<RoutineEntryTarget, string> = { agent: "Este agente", global: "Todos os rotineiros" }

export const routineEntryInputSchema = z.object({
    text: z.string().trim().min(1, "Escreva a entrada").max(4_000, "Entrada com no máximo 4.000 caracteres"),
    target: z.enum(ROUTINE_ENTRY_TARGETS),
})
export type RoutineEntryInput = z.infer<typeof routineEntryInputSchema>

/** Confirmar/recusar a ação pendente (nota opcional para o agente). */
export const routineActionResolutionSchema = z.object({ note: z.string().trim().max(2_000).optional() })

/** Modelo do subagente de provisionamento (decisão D2 da OPE-130). */
/** Forma gravada (leitura): aceita o que já estiver salvo, inclusive provedor sem modelo. */
export const routineAgentSettingsShape = z.object({
    provider: z.enum(AI_TEXT_PROVIDER_IDS).nullable(),
    model: z.string().trim().max(200),
    variant: z.string().trim().max(80).nullable(),
    agent: z.string().trim().max(120).nullable(),
})
/** Gravação (tela e API): com provedor escolhido, o modelo é obrigatório; sem provedor, o provisionamento fica desligado. */
export const routineAgentSettingsSchema = routineAgentSettingsShape.superRefine((value, ctx) => {
    if (value.provider && !value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Escolha o modelo" })
})
export type RoutineAgentSettingsInput = z.infer<typeof routineAgentSettingsShape>
export const DEFAULT_ROUTINE_AGENT_SETTINGS: RoutineAgentSettingsInput = { provider: null, model: "", variant: null, agent: null }

/** Filtro da lista da aba Rotineiros. */
export const ROUTINE_LIST_FILTERS = ["current", "archived"] as const
export type RoutineListFilter = (typeof ROUTINE_LIST_FILTERS)[number]

/** Segredos do agente rotineiro (OPE-130, D5): nome `NOME_EM_MAIUSCULAS`, valor cifrado que nunca sai. */
export const ROUTINE_SECRET_NAME = /^[A-Z][A-Z0-9_]{1,63}$/
export const MAX_ROUTINE_SECRET_VALUE = 16_384
/** Abaixo disso o valor não é mascarado com segurança na resposta (`MIN_MASKABLE_SECRET_LENGTH`). */
export const MIN_ROUTINE_SECRET_VALUE = MIN_MASKABLE_SECRET_LENGTH
export const ROUTINE_SECRET_TOO_SHORT = `Valor com no mínimo ${MIN_MASKABLE_SECRET_LENGTH} caracteres (valores mais curtos não podem ser mascarados na resposta)`
export const MAX_ROUTINE_SECRETS = 50
/** Domínio (`api.x.com`) ou curinga de subdomínio (`*.x.com`). */
export const ROUTINE_SECRET_HOST = /^(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(:\d{1,5})?$/

const secretFields = {
    name: z.string().trim().regex(ROUTINE_SECRET_NAME, "Use maiúsculas, números e _ (ex.: LINKEDIN_TOKEN), começando por letra"),
    description: z.string().trim().max(300, "Descrição com no máximo 300 caracteres"),
    allowedHosts: z
        .array(z.string().trim().toLowerCase().regex(ROUTINE_SECRET_HOST, "Domínio inválido (ex.: api.linkedin.com ou *.gupy.io)"))
        .max(20, "No máximo 20 domínios"),
}

export const routineSecretCreateSchema = z.object({
    ...secretFields,
    value: z.string().min(1, "Informe o valor").min(MIN_ROUTINE_SECRET_VALUE, ROUTINE_SECRET_TOO_SHORT).max(MAX_ROUTINE_SECRET_VALUE, "Valor com no máximo 16 KB"),
})
export type RoutineSecretCreateInput = z.infer<typeof routineSecretCreateSchema>

/** Edição: valor vazio mantém o atual. */
export const routineSecretUpdateSchema = z.object({
    ...secretFields,
    value: z
        .string()
        .max(MAX_ROUTINE_SECRET_VALUE, "Valor com no máximo 16 KB")
        .refine((value) => value === "" || value.length >= MIN_ROUTINE_SECRET_VALUE, ROUTINE_SECRET_TOO_SHORT),
})
export type RoutineSecretUpdateInput = z.infer<typeof routineSecretUpdateSchema>

/** Ação do dono sobre um canal extra do provisionamento (OPE-143): remover+bloquear, desbloquear ou assinar de novo. */
export const ROUTINE_CHANNEL_ACTIONS = ["block", "unblock", "resubscribe"] as const
export type RoutineChannelAction = (typeof ROUTINE_CHANNEL_ACTIONS)[number]
export const routineChannelActionSchema = z.object({
    action: z.enum(ROUTINE_CHANNEL_ACTIONS),
    channel: z.string().trim().toLowerCase().min(1, "Informe o canal").max(120, "Canal com no máximo 120 caracteres").regex(CHANNEL_SLUG, "Slug de canal inválido"),
})
export type RoutineChannelActionInput = z.infer<typeof routineChannelActionSchema>
